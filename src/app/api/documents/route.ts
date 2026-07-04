import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import { Document } from "@/models/Document";
import { withErrorHandler, ApiError } from "@/lib/errorMiddleware";
import { sendSuccessResponse } from "@/lib/response";
import { StatusCodes } from "http-status-codes";
import { createDocumentSchema } from "@/validation/document";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";
import { DocumentRole } from "@/types/document";

// GET /api/documents - Fetch list of accessible documents
export const GET = withErrorHandler(async (req: Request) =>
{
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
  {
    throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
  }

  await dbConnect();

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const sortBy = searchParams.get("sortBy") || "updatedAt";
  const order = searchParams.get("order") || "desc";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  const skip = (page - 1) * limit;
  const userId = session.user.id;

  // Build query: User must be owner or collaborator
  const query: {
    $or: Array<{ ownerId: string } | { "collaborators.userId": string }>;
    title?: { $regex: string; $options: string };
  } = {
    $or: [
      { ownerId: userId },
      { "collaborators.userId": userId },
    ],
  };

  // Add search by title (case-insensitive) if provided
  if (q)
  {
    query.title = { $regex: q, $options: "i" };
  }

  // Fetch count and data
  const total = await Document.countDocuments(query);
  const documents = await Document.find(query)
    .sort({ [sortBy]: order === "desc" ? -1 : 1 })
    .skip(skip)
    .limit(limit)
    .populate("ownerId", "name email");

  return sendSuccessResponse({
    documents,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }, null, SUCCESS_MESSAGES.DOCUMENT_RETRIEVE_SUCCESS);
});

// POST /api/documents - Create a new document
export const POST = withErrorHandler(async (req: Request) =>
{
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
  {
    throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
  }

  await dbConnect();

  let body = {};
  try
  {
    body = await req.json();
  }
  catch
  {
    // Allow empty body to fall back to defaults
  }

  const validation = createDocumentSchema.parse(body);
  const title = validation.title;

  const doc = await Document.create({
    title: title || "Untitled Document",
    content: "",
    ownerId: session.user.id,
    currentVersion: 0,
    collaborators: [],
  });

  return sendSuccessResponse(doc, null, SUCCESS_MESSAGES.DOCUMENT_CREATE_SUCCESS, StatusCodes.CREATED);
});
