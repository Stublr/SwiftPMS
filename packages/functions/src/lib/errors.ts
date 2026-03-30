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
 */
export function wrapError(err: unknown): never {
  if (err instanceof HttpsError) {
    throw err;
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  throw new HttpsError("internal" as FunctionsErrorCode, message);
}
