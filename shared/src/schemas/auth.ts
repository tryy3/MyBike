import { z } from "zod";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Enter a valid email address"),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  image: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  createdAt: z.union([z.date(), z.string(), z.number()]).optional(),
  updatedAt: z.union([z.date(), z.string(), z.number()]).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
