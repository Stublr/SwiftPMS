import { HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";

export function notFound(message = "Resource not found"): HttpsError {
  return new HttpsError("not-found", message);
}

export function unauthorized(message = "Authentication required"): HttpsError {
  return new HttpsError("unauthenticated", message);
}

export function forbidden(message = "Insufficient permissions"): HttpsError {
  return new HttpsError("permission-denied", message);
}

export function conflict(message = "Resource conflict"): HttpsError {
  return new HttpsError("already-exists", message);
}

export function badRequest(message = "Invalid request"): HttpsError {
  return new HttpsError("invalid-argument", message);
}

export function internal(message = "Internal error"): HttpsError {
  return new HttpsError("internal", message);
}

export function preconditionFailed(message = "Precondition failed"): HttpsError {
  return new HttpsError("failed-precondition", message);
}

/**
 * Wraps an async function handler to catch errors and rethrow as HttpsError.
 *
 * HttpsErrors (which we throw deliberately with safe, user-facing messages)
 * pass through unchanged. Any OTHER error — a Firestore failure, a provider
 * SDK error, a bug — is logged server-side for debugging but returned to the
 * client as a generic message so we never leak internal details (stack
 * traces, payment-provider reasons, document paths) to callers.
 */
export function wrapError(err: unknown): never {
  if (err instanceof HttpsError) {
    throw err;
  }
  console.error("Unhandled function error:", err);
  throw new HttpsError(
    "internal" as FunctionsErrorCode,
    "An unexpected error occurred. Please try again.",
  );
}
