import { z } from "zod";

export const registerSchema = z.object(
  {
    name: z.string()
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name must not exceed 50 characters"),
    email: z.string()
      .email("Invalid email address")
      .min(2, "Email must be at least 2 characters")
      .max(50, "Email must not exceed 50 characters"),
    password: z.string()
      .min(6, "Password must be at least 6 characters")
      .max(100, "Password must not exceed 100 characters"),
  }
);

export const loginSchema = z.object(
  {
    email: z.string()
      .email("Invalid email address")
      .min(2, "Email must be at least 2 characters")
      .max(50, "Email must not exceed 50 characters"),
    password: z.string()
      .min(6, "Password must be at least 6 characters")
      .max(100, "Password must not exceed 100 characters"),
  }
);
