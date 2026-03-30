import { HttpsError } from "firebase-functions/v2/https";
import type { z } from "zod";

/**
 * Validates request data against a Zod schema.
 * Throws HttpsError with "invalid-argument" on failure.
 */
export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new HttpsError("invalid-argument", message);
  }
  return result.data;
}
