import type { AuthUser, FirebaseCustomClaims } from "@swiftpms/shared";
import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { auth, functions } from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth.store";

function userFromFirebase(firebaseUser: User, claims: FirebaseCustomClaims): AuthUser {
  return {
    id: firebaseUser.uid,
    tenantId: claims.tenantId,
    email: firebaseUser.email ?? "",
    fullName: firebaseUser.displayName ?? "",
    role: claims.role,
    propertyIds: claims.propertyIds,
  };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const tokenResult = await credential.user.getIdTokenResult();
  const claims = tokenResult.claims as unknown as FirebaseCustomClaims;
  const user = userFromFirebase(credential.user, claims);
  useAuthStore.getState().setAuth(user);
  return user;
}

export async function pinLogin(
  pin: string,
  propertyId: string,
  tenantId: string,
): Promise<AuthUser> {
  const callPinLogin = httpsCallable<
    { pin: string; propertyId: string; tenantId: string },
    { customToken: string; user: AuthUser }
  >(functions, "pinLogin");

  const result = await callPinLogin({ pin, propertyId, tenantId });
  const { customToken, user } = result.data;

  await signInWithCustomToken(auth, customToken);
  useAuthStore.getState().setAuth(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await signOut(auth);
  } finally {
    useAuthStore.getState().clearAuth();
  }
}

// Initialize auth state listener -- call once at app startup
export function initAuthListener(): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const tokenResult = await firebaseUser.getIdTokenResult();
      const claims = tokenResult.claims as unknown as FirebaseCustomClaims;
      const user = userFromFirebase(firebaseUser, claims);
      useAuthStore.getState().setAuth(user);
    } else {
      useAuthStore.getState().clearAuth();
    }
  });
}
