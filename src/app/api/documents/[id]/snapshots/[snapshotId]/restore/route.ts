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
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";

// Helper function to find a document and verify user's role/permission
async function getDocumentWithPermission(docId: string, userId: string)
{
  await dbConnect();

  const doc = await Document.findById(docId);
  if (!doc)
  {
    throw new ApiError(ERROR_MESSAGES.DOCUMENT_NOT_FOUND, StatusCodes.NOT_FOUND);
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
    throw new ApiError(ERROR_MESSAGES.DOCUMENT_ACCESS_DENIED, StatusCodes.FORBIDDEN);
  }

  return { doc, role };
}

// POST /api/documents/[id]/snapshots/[snapshotId]/restore - Restore a document to a snapshot state
export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string; snapshotId: string }> }) =>
  {
    const { id, snapshotId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
    {
      throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
    }

    checkRateLimit(session.user.id);

    const { doc, role } = await getDocumentWithPermission(id, session.user.id);

    if (role === DocumentRole.VIEWER)
    {
      throw new ApiError(ERROR_MESSAGES.VIEWER_CANNOT_RESTORE, StatusCodes.FORBIDDEN);
    }

    const snapshot = await Snapshot.findById(snapshotId);
    if (!snapshot || snapshot.documentId.toString() !== id)
    {
      throw new ApiError(ERROR_MESSAGES.SNAPSHOT_NOT_FOUND, StatusCodes.NOT_FOUND);
    }

    // Decompress snapshot content
    let decompressedContent = "";
    try
    {
      decompressedContent = zlib.gunzipSync(Buffer.from(snapshot.content, "base64")).toString("utf-8");
    }
    catch (err)
    {
      decompressedContent = snapshot.content;
    }

    // 1. Create a backup snapshot of current content first for safety
    const backupCompressed = zlib.gzipSync(doc.content || "").toString("base64");
    const nextVersion = (doc.currentVersion || 0) + 1;
    await Snapshot.create(
      {
        documentId: id,
        version: nextVersion,
        title: `Pre-restore Backup (v${doc.currentVersion})`,
        content: backupCompressed,
        createdBy: session.user.id,
      }
    );

    // 2. Set document content to snapshot content and increment version
    doc.content = decompressedContent;
    doc.currentVersion = nextVersion + 1;
    await doc.save();

    return sendSuccessResponse(
      {
        content: decompressedContent,
        currentVersion: doc.currentVersion,
      },
      null,
      SUCCESS_MESSAGES.DOCUMENT_RESTORE_SUCCESS
    );
  }
);
