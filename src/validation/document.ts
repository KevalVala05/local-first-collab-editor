import { z } from "zod";
import { ERROR_MESSAGES } from "@/constants/messages";
import { DocumentRole } from "@/types/document";

export const createDocumentSchema = z.object({
  title: z.string()
    .trim()
    .min(1, ERROR_MESSAGES.TITLE_REQUIRED)
    .min(2, ERROR_MESSAGES.TITLE_MIN_LENGTH)
    .max(100, ERROR_MESSAGES.TITLE_MAX_LENGTH)
    .optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string()
    .trim()
    .min(1, ERROR_MESSAGES.TITLE_REQUIRED)
    .min(2, ERROR_MESSAGES.TITLE_MIN_LENGTH)
    .max(100, ERROR_MESSAGES.TITLE_MAX_LENGTH)
    .optional(),
  // Content is HTML from TipTap editor — no length restriction at schema level
  content: z.string().optional(),
});

export const shareDocumentSchema = z.object({
  email: z.string()
    .trim()
    .min(1, ERROR_MESSAGES.EMAIL_REQUIRED)
    .email(ERROR_MESSAGES.INVALID_EMAIL)
    .min(2, ERROR_MESSAGES.EMAIL_MIN_LENGTH)
    .max(50, ERROR_MESSAGES.EMAIL_MAX_LENGTH),
  role: z.enum([DocumentRole.EDITOR, DocumentRole.VIEWER]),
});
