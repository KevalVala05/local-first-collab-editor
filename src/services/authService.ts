import { z } from "zod";
import { registerSchema } from "@/validation/auth";
import api from "@/lib/api";

type RegisterData = z.infer<typeof registerSchema>;

export async function registerUser(data: RegisterData): Promise<unknown>
{
  const response = await api.post("/auth/register", data);
  return response.data.data;
}
