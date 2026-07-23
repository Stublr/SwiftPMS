import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type TourOperatorApplicationStatus = "none" | "pending" | "approved" | "rejected";

export interface TourOperatorStatus {
  isTourOperator: boolean;
  discountPercent: number;
  applicationStatus: TourOperatorApplicationStatus;
  reviewNote: string | null;
}

export interface TourOperatorApplicationInput {
  companyName: string;
  contactName: string;
  phone: string;
  registrationNumber?: string;
  website?: string;
  message?: string;
}

export async function getTourOperatorStatus(): Promise<TourOperatorStatus> {
  const fn = httpsCallable(functions, "getTourOperatorStatus");
  const result = await fn();
  const data = result.data as Partial<TourOperatorStatus>;
  return {
    isTourOperator: data.isTourOperator ?? false,
    discountPercent: data.discountPercent ?? 0,
    applicationStatus: data.applicationStatus ?? "none",
    reviewNote: data.reviewNote ?? null,
  };
}

export async function applyTourOperator(
  input: TourOperatorApplicationInput,
): Promise<{ status: TourOperatorApplicationStatus }> {
  const fn = httpsCallable(functions, "applyTourOperator");
  const result = await fn(input);
  return result.data as { status: TourOperatorApplicationStatus };
}
