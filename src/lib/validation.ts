import { z } from "zod";

import { ApiError } from "@/lib/api/client";

// Mirrors the backend password policy (app/modules/auth/service.py) for instant feedback; the API re-checks.
export const passwordSchema = z
  .string()
  .min(12, "At least 12 characters")
  .max(128, "At most 128 characters")
  .refine(
    (v) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(v)).length >= 3,
    "Use at least 3 of: lowercase, uppercase, digits, symbols",
  );

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
