import { z } from "zod";
import { ERROR_MESSAGES } from "@/constants/messages";

export const registerSchema = z.object(
  {
    name: z.string()
      .trim()
      .min(1, ERROR_MESSAGES.NAME_REQUIRED)
      .min(2, ERROR_MESSAGES.NAME_MIN_LENGTH)
      .max(50, ERROR_MESSAGES.NAME_MAX_LENGTH),
    email: z.string()
      .trim()
      .min(1, ERROR_MESSAGES.EMAIL_REQUIRED)
      .email(ERROR_MESSAGES.INVALID_EMAIL)
      .min(2, ERROR_MESSAGES.EMAIL_MIN_LENGTH)
      .max(50, ERROR_MESSAGES.EMAIL_MAX_LENGTH),
    password: z.string()
      .min(1, ERROR_MESSAGES.PASSWORD_REQUIRED)
      .min(6, ERROR_MESSAGES.PASSWORD_MIN_LENGTH)
      .max(100, ERROR_MESSAGES.PASSWORD_MAX_LENGTH),
  }
);

export const loginSchema = z.object(
  {
    email: z.string()
      .trim()
      .min(1, ERROR_MESSAGES.EMAIL_REQUIRED)
      .email(ERROR_MESSAGES.INVALID_EMAIL)
      .min(2, ERROR_MESSAGES.EMAIL_MIN_LENGTH)
      .max(50, ERROR_MESSAGES.EMAIL_MAX_LENGTH),
    password: z.string()
      .min(1, ERROR_MESSAGES.PASSWORD_REQUIRED)
      .min(6, ERROR_MESSAGES.PASSWORD_MIN_LENGTH)
      .max(100, ERROR_MESSAGES.PASSWORD_MAX_LENGTH),
  }
);
