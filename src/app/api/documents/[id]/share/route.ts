import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { Document } from "@/models/Document";
import { User } from "@/models/User";
import { withErrorHandler, ApiError } from "@/lib/errorMiddleware";
import { sendSuccessResponse } from "@/lib/response";
import { StatusCodes } from "http-status-codes";
import { shareDocumentSchema } from "@/validation/document";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";
import { DocumentRole } from "@/types/document";

export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
    {
      throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
    }

    await dbConnect();

    // 1. Fetch document and check permissions
    const doc = await Document.findById(id);
    if (!doc)
    {
      throw new ApiError(ERROR_MESSAGES.DOCUMENT_NOT_FOUND, StatusCodes.NOT_FOUND);
    }

    // Determine current user's role
    let currentUserRole: DocumentRole | null = null;
    if (doc.ownerId.toString() === session.user.id)
    {
      currentUserRole = DocumentRole.OWNER;
    }
    else
    {
      const collaborator = doc.collaborators.find(
        (c: { userId: { toString(): string }; role: DocumentRole }) => c.userId.toString() === session.user.id
      );
      if (collaborator)
      {
        currentUserRole = collaborator.role;
      }
    }

    // Only OWNER and EDITOR can invite others
    if (currentUserRole !== DocumentRole.OWNER && currentUserRole !== DocumentRole.EDITOR)
    {
      throw new ApiError(ERROR_MESSAGES.DOCUMENT_ACCESS_DENIED, StatusCodes.FORBIDDEN);
    }

    // 2. Parse and validate body
    const body = await req.json();
    const validation = shareDocumentSchema.parse(body);
    const { email, role } = validation;

    // 3. Find target user by email
    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser)
    {
      throw new ApiError(ERROR_MESSAGES.USER_EMAIL_NOT_FOUND, StatusCodes.NOT_FOUND);
    }

    const targetUserIdStr = targetUser._id.toString();

    // 4. Validate sharing target
    if (targetUserIdStr === doc.ownerId.toString())
    {
      throw new ApiError(ERROR_MESSAGES.OWNER_CANNOT_SHARE, StatusCodes.BAD_REQUEST);
    }

    // 5. Update or add collaborator
    const collaboratorIndex = doc.collaborators.findIndex(
      (c: { userId: { toString(): string }; role: DocumentRole }) => c.userId.toString() === targetUserIdStr
    );

    if (collaboratorIndex > -1)
    {
      // Update existing role
      doc.collaborators[collaboratorIndex].role = role;
    }
    else
    {
      // Add new collaborator
      doc.collaborators.push({
        userId: targetUser._id,
        role,
      });
    }

    await doc.save();

    // Populate collaborators for the response
    const updatedDoc = await Document.findById(id)
      .populate("collaborators.userId", "name email")
      .populate("ownerId", "name email");

    return sendSuccessResponse(
      updatedDoc,
      null,
      SUCCESS_MESSAGES.DOCUMENT_SHARE_SUCCESS
    );
  }
);
