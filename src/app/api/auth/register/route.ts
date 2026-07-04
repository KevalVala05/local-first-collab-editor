
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { registerSchema } from "@/validation/auth";
import { withErrorHandler, ApiError } from "@/lib/errorMiddleware";
import { StatusCodes } from "http-status-codes";
import { sendSuccessResponse } from "@/lib/response";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/constants/messages";

export const POST = withErrorHandler(async (req: Request) =>
{
  const body = await req.json();

  // Validate using Zod schema (ZodError will be caught by middleware)
  const validation = registerSchema.parse(body);

  const { name, email, password } = validation;

  await dbConnect();

  // Check if user already exists
  const existingUser = await User.findOne({ email });

  if (existingUser)
  {
    throw new ApiError(ERROR_MESSAGES.USER_ALREADY_EXISTS, StatusCodes.CONFLICT);
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create the user
  const user = await User.create(
    {
      name,
      email,
      password: hashedPassword,
    }
  );

  return sendSuccessResponse(
    {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    },
    null,
    SUCCESS_MESSAGES.REGISTER_SUCCESS,
    StatusCodes.CREATED
  );
});
