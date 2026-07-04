import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { Document } from "@/models/Document";
import { withErrorHandler, ApiError } from "@/lib/errorMiddleware";
import { sendSuccessResponse } from "@/lib/response";
import { StatusCodes } from "http-status-codes";
import { DocumentRole } from "@/types/document";
import { updateDocumentSchema } from "@/validation/document";
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

  // Determine user's role
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

// PATCH /api/documents/[id] - Update document title/content
export const PATCH = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
    {
      throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
    }

    const { doc, role } = await getDocumentWithPermission(id, session.user.id);

    // Viewers cannot push updates
    if (role === DocumentRole.VIEWER)
    {
      throw new ApiError(ERROR_MESSAGES.VIEWER_CANNOT_EDIT, StatusCodes.FORBIDDEN);
    }

    const body = await req.json();
    const validation = updateDocumentSchema.parse(body);

    if (validation.title !== undefined)
    {
      doc.title = validation.title;
    }
    if (validation.content !== undefined)
    {
      doc.content = validation.content;
    }

    await doc.save();

    return sendSuccessResponse(doc, null, SUCCESS_MESSAGES.DOCUMENT_UPDATE_SUCCESS);
  }
);

// DELETE /api/documents/[id] - Delete a document
export const DELETE = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
    {
      throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
    }

    const { role } = await getDocumentWithPermission(id, session.user.id);

    // Only OWNER can delete
    if (role !== DocumentRole.OWNER)
    {
      throw new ApiError(ERROR_MESSAGES.OWNER_ONLY_DELETE, StatusCodes.FORBIDDEN);
    }

    await Document.findByIdAndDelete(id);

    return sendSuccessResponse(null, null, SUCCESS_MESSAGES.DOCUMENT_DELETE_SUCCESS);
  }
);
