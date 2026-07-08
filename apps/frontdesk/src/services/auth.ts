import { STAFF_ROLES, type AuthUser, type FirebaseCustomClaims } from "@swiftpms/shared";
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

  // Guests get their own portal — the PMS is staff-only.
  if (!STAFF_ROLES.includes(claims.role)) {
    await signOut(auth);
    throw new Error("This account can't access the PMS. Please use the guest portal.");
  }

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

  // Defense in depth -- PIN login is staff-only, mirroring login() above.
  if (!STAFF_ROLES.includes(user.role)) {
    await signOut(auth);
    throw new Error("This account can't access the PMS. Please use the guest portal.");
  }

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

      // Critical path: a guest with an existing Firebase session hits this on
      // every page load. Sign them out of the PMS session rather than
      // letting the listener grant them staff access.
      if (!STAFF_ROLES.includes(claims.role)) {
        await signOut(auth);
        useAuthStore.getState().clearAuth();
        return;
      }

      const user = userFromFirebase(firebaseUser, claims);
      useAuthStore.getState().setAuth(user);
    } else {
      useAuthStore.getState().clearAuth();
    }
  });
}
