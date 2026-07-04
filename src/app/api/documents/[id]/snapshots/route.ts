import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { Document } from "@/models/Document";
import { Snapshot } from "@/models/Snapshot";
import { withErrorHandler, ApiError } from "@/lib/errorMiddleware";
import { sendSuccessResponse } from "@/lib/response";
import { StatusCodes } from "http-status-codes";
import { DocumentRole } from "@/types/document";
import zlib from "zlib";
import { checkRateLimit } from "@/lib/rateLimit";

// Helper function to find a document and verify user's role/permission
async function getDocumentWithPermission(docId: string, userId: string)
{
  await dbConnect();

  const doc = await Document.findById(docId);
  if (!doc)
  {
    throw new ApiError("Document not found", StatusCodes.NOT_FOUND);
  }

  let role: DocumentRole | null = null;

  if (doc.ownerId.toString() === userId)
  {
    role = DocumentRole.OWNER;
  }
  else
  {
    const collaborator = doc.collaborators.find(
      (c: { userId: { toString(): string }; role: DocumentRole }) => c.userId.toString() === userId
    );
    if (collaborator)
    {
      role = collaborator.role;
    }
  }

  if (!role)
  {
    throw new ApiError("Access denied", StatusCodes.FORBIDDEN);
  }

  return { doc, role };
}

// GET /api/documents/[id]/snapshots - List all snapshots for a document
export const GET = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
    {
      throw new ApiError("Unauthorized", StatusCodes.UNAUTHORIZED);
    }

    checkRateLimit(session.user.id);

    // Verify user has access to this document
    await getDocumentWithPermission(id, session.user.id);

    const snapshots = await Snapshot.find({ documentId: id })
      .sort({ version: -1 })
      .populate("createdBy", "name email");

    const decompressedSnapshots = snapshots.map(
      (snap) =>
      {
        let decompressedContent = "";
        try
        {
          decompressedContent = zlib.gunzipSync(Buffer.from(snap.content, "base64")).toString("utf-8");
        }
        catch (err)
        {
          decompressedContent = snap.content;
        }

        return {
          _id: snap._id,
          documentId: snap.documentId,
          version: snap.version,
          title: snap.title,
          content: decompressedContent,
          createdBy: snap.createdBy,
          createdAt: snap.createdAt,
        };
      }
    );

    return sendSuccessResponse(decompressedSnapshots, null, "Snapshots retrieved successfully");
  }
);

// POST /api/documents/[id]/snapshots - Create a new manual snapshot
export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
    {
      throw new ApiError("Unauthorized", StatusCodes.UNAUTHORIZED);
    }

    checkRateLimit(session.user.id);

    const { doc, role } = await getDocumentWithPermission(id, session.user.id);

    if (role === DocumentRole.VIEWER)
    {
      throw new ApiError("Viewers cannot create snapshots", StatusCodes.FORBIDDEN);
    }

    let body = { title: "" };
    try
    {
      body = await req.json();
    }
    catch (err)
    {
      // Fallback
    }

    const title = body.title?.trim() || `Version ${doc.currentVersion + 1} (${new Date().toLocaleTimeString()})`;

    // Compress the content
    const compressedContent = zlib.gzipSync(doc.content || "").toString("base64");

    // Increment document version number
    doc.currentVersion = (doc.currentVersion || 0) + 1;
    await doc.save();

    const snapshot = await Snapshot.create(
      {
        documentId: id,
        version: doc.currentVersion,
        title,
        content: compressedContent,
        createdBy: session.user.id,
      }
    );

    const populated = await snapshot.populate("createdBy", "name email");

    return sendSuccessResponse(
      {
        _id: populated._id,
        documentId: populated.documentId,
        version: populated.version,
        title: populated.title,
        content: doc.content || "",
        createdBy: populated.createdBy,
        createdAt: populated.createdAt,
      },
      null,
      "Snapshot created successfully",
      StatusCodes.CREATED
    );
  }
);
