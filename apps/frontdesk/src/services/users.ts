import type { User, CreateUserRequest, UpdateUserRequest } from "@swiftpms/shared";
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import { db, functions } from "@/lib/firebase";
import { getTenantId } from "@/lib/auth-context";

export interface UserWithProperties extends User {
  propertyIds: string[];
}

export async function getUsers(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<UserWithProperties[]> {
  const tenantId = getTenantId();
  const snap = await getDocs(collection(db, `tenants/${tenantId}/users`));

  let users = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() ?? "",
    updatedAt: d.data().updatedAt?.toDate?.()?.toISOString?.() ?? "",
  })) as unknown as UserWithProperties[];

  // Client-side search filter
  if (options?.search) {
    const term = options.search.toLowerCase();
    users = users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term),
    );
  }

  // Client-side pagination
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;
  return users.slice(offset, offset + limit);
}

export async function getUser(id: string): Promise<UserWithProperties> {
  const tenantId = getTenantId();
  const snap = await getDoc(doc(db, `tenants/${tenantId}/users/${id}`));
  return { id: snap.id, ...snap.data() } as unknown as UserWithProperties;
}

export async function createUser(data: CreateUserRequest): Promise<UserWithProperties> {
  const call = httpsCallable<CreateUserRequest, UserWithProperties>(functions, "createUser");
  const result = await call(data);
  return result.data;
}

export async function updateUser(id: string, data: UpdateUserRequest): Promise<UserWithProperties> {
  const call = httpsCallable<{ userId: string } & UpdateUserRequest, UserWithProperties>(
    functions,
    "assignUserRole",
  );
  const result = await call({ userId: id, ...data });
  return result.data;
}

export async function deleteUser(id: string): Promise<void> {
  // Soft-delete via Cloud Function
  const call = httpsCallable(functions, "assignUserRole");
  await call({ userId: id, isActive: false });
}

export async function resetUserPin(id: string, pin: string): Promise<{ success: boolean }> {
  const call = httpsCallable<{ userId: string; pin: string }, { success: boolean }>(
    functions,
    "resetUserPin",
  );
  const result = await call({ userId: id, pin });
  return result.data;
}
