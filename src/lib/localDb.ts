import Dexie, { type Table } from "dexie";

export interface LocalDocumentOwner
{
  _id: string;
  name: string;
  email: string;
}

export interface LocalDocumentCollaborator
{
  userId: {
    _id: string;
    name: string;
    email: string;
  };
  role: string;
}

export interface LocalDocument
{
  _id: string;
  title: string;
  content: string;
  ownerId: LocalDocumentOwner;
  collaborators: LocalDocumentCollaborator[];
  updatedAt: string;
  createdAt: string;
  syncStatus: "synced" | "pending" | "error";
  isLocalOnly?: boolean;
}

export interface OutboxPayload
{
  content?: string;
  title?: string;
}

export interface OutboxItem
{
  id?: number;
  documentId: string;
  action: "create_document" | "update_content" | "rename_document" | "delete_document";
  payload: OutboxPayload;
  timestamp: number;
}

export class CollaborativeEditorDatabase extends Dexie
{
  documents!: Table<LocalDocument, string>;
  outbox!: Table<OutboxItem, number>;

  constructor()
  {
    super("CollaborativeEditorDatabase");
    this.version(1).stores(
      {
        documents: "_id, title, updatedAt, syncStatus",
        outbox: "++id, documentId, action, timestamp",
      }
    );
  }
}

export const localDb = new CollaborativeEditorDatabase();

// ── Helper Operations ────────────────────────────────────────────────────────

/**
 * Returns paginated, sorted, and filtered documents cached locally.
 */
export async function getCachedDocuments(
  q: string,
  sortBy: string,
  order: string,
  page: number,
  limit: number
): Promise<{ documents: LocalDocument[]; pagination: { page: number; limit: number; total: number; pages: number } }>
{
  let docs = await localDb.documents.toArray();

  // Search filter
  if (q.trim())
  {
    const search = q.toLowerCase();
    docs = docs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(search) ||
        doc.content.toLowerCase().includes(search)
    );
  }

  // Sort
  docs.sort(
    (a, b) =>
    {
      let valA: string | number = a[sortBy as keyof LocalDocument] as string | number || "";
      let valB: string | number = b[sortBy as keyof LocalDocument] as string | number || "";

      if (sortBy === "updatedAt" || sortBy === "createdAt")
      {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }
      else if (typeof valA === "string")
      {
        valA = valA.toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB)
      {
        return order === "asc" ? -1 : 1;
      }
      if (valA > valB)
      {
        return order === "asc" ? 1 : -1;
      }
      return 0;
    }
  );

  // Paginate
  const total = docs.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const startIndex = (page - 1) * limit;
  const paginatedDocs = docs.slice(startIndex, startIndex + limit);

  return {
    documents: paginatedDocs,
    pagination: {
      page,
      limit,
      total,
      pages,
    },
  };
}

/**
 * Saves document content locally in IndexedDB and queues an update in the outbox.
 */
export async function saveDocumentLocally(
  documentId: string,
  content: string
): Promise<void>
{
  const localDoc = await localDb.documents.get(documentId);
  if (localDoc)
  {
    localDoc.content = content;
    localDoc.updatedAt = new Date().toISOString();
    localDoc.syncStatus = "pending";
    await localDb.documents.put(localDoc);
  }

  // Add/update outbox queue
  const existingItem = await localDb.outbox
    .where("documentId")
    .equals(documentId)
    .and((item) => item.action === "update_content")
    .first();

  if (existingItem && existingItem.id !== undefined)
  {
    existingItem.payload.content = content;
    existingItem.timestamp = Date.now();
    await localDb.outbox.put(existingItem);
  }
  else
  {
    await localDb.outbox.add(
      {
        documentId,
        action: "update_content",
        payload: { content },
        timestamp: Date.now(),
      }
    );
  }
}

/**
 * Saves document title locally in IndexedDB and queues a rename action in the outbox.
 */
export async function renameDocumentLocally(
  documentId: string,
  title: string
): Promise<void>
{
  const localDoc = await localDb.documents.get(documentId);
  if (localDoc)
  {
    localDoc.title = title;
    localDoc.updatedAt = new Date().toISOString();
    localDoc.syncStatus = "pending";
    await localDb.documents.put(localDoc);
  }

  const existingItem = await localDb.outbox
    .where("documentId")
    .equals(documentId)
    .and((item) => item.action === "rename_document")
    .first();

  if (existingItem && existingItem.id !== undefined)
  {
    existingItem.payload.title = title;
    existingItem.timestamp = Date.now();
    await localDb.outbox.put(existingItem);
  }
  else
  {
    await localDb.outbox.add(
      {
        documentId,
        action: "rename_document",
        payload: { title },
        timestamp: Date.now(),
      }
    );
  }
}

/**
 * Creates a document locally and queues the creation in the outbox.
 */
export async function createDocumentLocally(
  title: string,
  userId: string,
  userName: string,
  userEmail: string
): Promise<LocalDocument>
{
  const tempId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const newDoc: LocalDocument = {
    _id: tempId,
    title,
    content: "",
    ownerId: {
      _id: userId,
      name: userName,
      email: userEmail,
    },
    collaborators: [],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    syncStatus: "pending",
    isLocalOnly: true,
  };

  await localDb.documents.put(newDoc);

  await localDb.outbox.add(
    {
      documentId: tempId,
      action: "create_document",
      payload: { title },
      timestamp: Date.now(),
    }
  );

  return newDoc;
}

/**
 * Deletes a document locally and queues the deletion in the outbox.
 */
export async function deleteDocumentLocally(
  documentId: string
): Promise<void>
{
  await localDb.documents.delete(documentId);

  // If there are pending outbox updates for this document, remove them
  const pendingItems = await localDb.outbox
    .where("documentId")
    .equals(documentId)
    .toArray();

  for (const item of pendingItems)
  {
    if (item.id !== undefined)
    {
      await localDb.outbox.delete(item.id);
    }
  }

  // If this document was already synced to the server, we need to send a delete request to the server later.
  // If it was local-only, we don't need to notify the server.
  const isLocalOnly = documentId.startsWith("local_");
  if (!isLocalOnly)
  {
    await localDb.outbox.add(
      {
        documentId,
        action: "delete_document",
        payload: {},
        timestamp: Date.now(),
      }
    );
  }
}
