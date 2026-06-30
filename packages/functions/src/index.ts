// Auth functions
export { createUser } from "./auth/createUser.js";
export { pinLogin } from "./auth/pinLogin.js";
export { assignUserRole } from "./auth/assignUserRole.js";

// Reservation functions
export { createReservation } from "./reservations/createReservation.js";
export { cancelReservation } from "./reservations/cancelReservation.js";
export { checkIn } from "./reservations/checkIn.js";
export { checkOut } from "./reservations/checkOut.js";

// Billing functions
export { addCharge } from "./billing/addCharge.js";
export { processPayment } from "./billing/processPayment.js";
export { initiatePeachCheckout } from "./billing/initiatePeachCheckout.js";
// peachWebhook intentionally NOT exported. Peach allows only one notification
// URL per account and the Plankton estate's `savePeachNotification` on
// plankton-backstage owns it. Result-to-folio bridging is a cross-project
// listener (see docs/peach-bridge.md) — not a webhook on this project.

// Room functions
export { updateRoomStatus } from "./rooms/updateRoomStatus.js";

// Guest portal functions
export { createGuestAccount } from "./guest/createGuestAccount.js";
export { checkAvailability } from "./guest/checkAvailability.js";
export { createGuestReservation } from "./guest/createGuestReservation.js";

// Triggers
export { onReservationUpdate } from "./triggers/onReservationUpdate.js";
export { releaseExpiredHolds } from "./triggers/releaseExpiredHolds.js";
