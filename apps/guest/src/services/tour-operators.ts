import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export async function getTourOperatorStatus(): Promise<{
  isTourOperator: boolean;
  discountPercent: number;
}> {
  const fn = httpsCallable(functions, "getTourOperatorStatus");
  const result = await fn();
  return result.data as { isTourOperator: boolean; discountPercent: number };
}
