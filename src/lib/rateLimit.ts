import { ApiError } from "./errorMiddleware";
import { StatusCodes } from "http-status-codes";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(userId: string, limit = 100, windowMs = 60000)
{
  const now = Date.now();
  const tracker = rateLimitMap.get(userId);

  if (!tracker || now > tracker.resetTime)
  {
    rateLimitMap.set(
      userId,
      {
        count: 1,
        resetTime: now + windowMs,
      }
    );
    return;
  }

  if (tracker.count >= limit)
  {
    throw new ApiError("Too many requests. Please try again later.", StatusCodes.TOO_MANY_REQUESTS);
  }

  tracker.count++;
}
