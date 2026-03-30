import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithCustomToken,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { auth, functions, db } from "@/lib/firebase";
import { useGuestAuthStore } from "@/stores/auth.store";

const TENANT_ID = import.meta.env.VITE_TENANT_ID || "demo-tenant";

export async function guestLogin(
  email: string,
  password: string,
): Promise<void> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const tokenResult = await credential.user.getIdTokenResult();
  const claims = tokenResult.claims;

  // Verify this is a guest account
  if (claims.role !== "guest") {
    await signOut(auth);
    throw new Error("This account is not a guest account. Please use the staff portal.");
  }

  const tenantId = claims.tenantId as string;

  // Get guest doc
  const guestDoc = await getDoc(
    doc(db, `tenants/${tenantId}/guests/${credential.user.uid}`),
  );
  const data = guestDoc.data();

  useGuestAuthStore.getState().setAuth({
    guestId: credential.user.uid,
    email: credential.user.email ?? "",
    firstName: (data?.firstName as string) ?? "",
    lastName: (data?.lastName as string) ?? "",
    tenantId,
  });
}

export async function guestRegister(
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  phone?: string,
): Promise<void> {
  const fn = httpsCallable(functions, "createGuestAccount");
  const result = await fn({
    firstName,
    lastName,
    email,
    password,
    phone,
    tenantId: TENANT_ID,
  });
  const { customToken, guest } = result.data as {
    customToken: string;
    guest: { id: string; email: string; firstName: string; lastName: string };
  };
  await signInWithCustomToken(auth, customToken);
  useGuestAuthStore.getState().setAuth({
    guestId: guest.id,
    email: guest.email,
    firstName: guest.firstName,
    lastName: guest.lastName,
    tenantId: TENANT_ID,
  });
}

export async function guestLogout(): Promise<void> {
  try {
    await signOut(auth);
  } finally {
    useGuestAuthStore.getState().clearAuth();
  }
}

export function initGuestAuthListener(): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const tokenResult = await user.getIdTokenResult();
      const claims = tokenResult.claims;
      if (claims.role !== "guest") {
        useGuestAuthStore.getState().clearAuth();
        return;
      }
      const tenantId = claims.tenantId as string;
      const guestDoc = await getDoc(
        doc(db, `tenants/${tenantId}/guests/${user.uid}`),
      );
      const data = guestDoc.data();
      useGuestAuthStore.getState().setAuth({
        guestId: user.uid,
        email: user.email ?? "",
        firstName: (data?.firstName as string) ?? "",
        lastName: (data?.lastName as string) ?? "",
        tenantId,
      });
    } else {
      useGuestAuthStore.getState().clearAuth();
    }
  });
}
