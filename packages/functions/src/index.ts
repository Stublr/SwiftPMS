// Auth functions
export { createUser } from "./auth/createUser.js";
export { pinLogin } from "./auth/pinLogin.js";
export { assignUserRole } from "./auth/assignUserRole.js";

// Reservation functions
export { createReservation } from "./reservations/createReservation.js";
export { createLegacyReservation } from "./reservations/createLegacyReservation.js";
export { cancelReservation } from "./reservations/cancelReservation.js";
export { checkIn } from "./reservations/checkIn.js";
export { checkOut } from "./reservations/checkOut.js";

// Billing functions
export { addCharge } from "./billing/addCharge.js";
export { processPayment } from "./billing/processPayment.js";
// initiatePeachCheckout now calls the Plankton Payments platform (railways).
// Name kept for backward compatibility with deployed client builds.
export { initiatePeachCheckout } from "./billing/initiatePeachCheckout.js";
export { syncPaymentStatus } from "./billing/syncPaymentStatus.js";

// Room functions
export { updateRoomStatus } from "./rooms/updateRoomStatus.js";

// Cash-up functions
export { openShift } from "./cashup/openShift.js";
export { closeShift } from "./cashup/closeShift.js";

// Guest portal functions
export { createGuestAccount } from "./guest/createGuestAccount.js";
export { checkAvailability } from "./guest/checkAvailability.js";
export { createGuestReservation } from "./guest/createGuestReservation.js";
export { createGuestReservationGroup } from "./guest/createGuestReservationGroup.js";
export { createGuest } from "./guest/createGuest.js";

// Triggers
export { onReservationUpdate } from "./triggers/onReservationUpdate.js";
export { releaseExpiredHolds } from "./triggers/releaseExpiredHolds.js";
export { sweepPendingPayments } from "./triggers/sweepPendingPayments.js";
