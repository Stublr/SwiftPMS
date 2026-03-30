import { useAuthStore } from "@/stores/auth.store";

export function getTenantId(): string {
  const user = useAuthStore.getState().user;
  if (!user?.tenantId) throw new Error("Not authenticated");
  return user.tenantId;
}
