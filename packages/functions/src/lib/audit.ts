import { FieldValue } from "firebase-admin/firestore";
import { auditLogRef } from "./firestore.js";

export interface AuditLogEntry {
  action: string;
  resource: string;
  resourceId: string;
  userId: string;
  userEmail: string;
  tenantId: string;
  propertyId?: string;
  details?: Record<string, unknown>;
}

/**
 * Writes an audit log entry to tenants/{tenantId}/auditLog/{id}.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<string> {
  const ref = auditLogRef(entry.tenantId).doc();
  await ref.set({
    ...entry,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
