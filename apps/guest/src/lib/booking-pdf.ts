import { formatCents } from "@swiftpms/shared";
import type { Reservation } from "@swiftpms/shared";

interface BookingPdfData {
  reservation: Reservation;
  guestName: string;
  guestEmail: string;
  propertyName?: string;
  roomTypeName?: string;
}

function nightCount(ci: string, co: string): number {
  const diff = new Date(co).getTime() - new Date(ci).getTime();
  return Math.max(1, Math.round(diff / 86400000));
}

function formatDateNice(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    confirmed: "Confirmed",
    checked_in: "Checked In",
    checked_out: "Checked Out",
    cancelled: "Cancelled",
    no_show: "No Show",
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    confirmed: "#2563eb",
    checked_in: "#16a34a",
    checked_out: "#6b7280",
    cancelled: "#dc2626",
    no_show: "#d97706",
  };
  return map[status] ?? "#6b7280";
}

function buildHtml(data: BookingPdfData): string {
  const { reservation: r, guestName, guestEmail, propertyName, roomTypeName } = data;
  const nights = nightCount(r.checkInDate, r.checkOutDate);
  const refId = r.id.slice(0, 8).toUpperCase();
  const total = formatCents(r.totalRoomCharges);
  const rate = formatCents(r.roomRate);
  const color = statusColor(r.status);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Booking Confirmation - ${refId}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; }
  .container { max-width: 600px; margin: 0 auto; }
  .header { text-align: center; padding: 32px 0; border-bottom: 2px solid #e2e8f0; }
  .header h1 { font-size: 28px; font-weight: 700; color: #0f172a; }
  .header p { font-size: 14px; color: #64748b; margin-top: 4px; }
  .status { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; color: white; background: ${color}; margin-top: 12px; }
  .section { padding: 24px 0; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 16px; }
  .details-table { width: 100%; border-collapse: collapse; }
  .details-table td { padding: 10px 0; font-size: 14px; vertical-align: top; }
  .details-table .label { color: #64748b; width: 40%; }
  .details-table .value { font-weight: 600; color: #1e293b; text-align: right; }
  .details-table tr + tr { border-top: 1px solid #f1f5f9; }
  .total-row td { padding-top: 16px !important; border-top: 2px solid #e2e8f0 !important; }
  .total-row .value { font-size: 22px; font-weight: 800; color: #0f172a; }
  .guest-section { background: #f8fafc; border-radius: 8px; padding: 20px; margin-top: 8px; }
  .footer { text-align: center; padding: 24px 0; border-top: 1px solid #e2e8f0; margin-top: 16px; }
  .footer p { font-size: 12px; color: #94a3b8; }
  .note { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 14px 16px; margin-top: 16px; font-size: 13px; color: #92400e; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Booking Confirmation</h1>
    <p>${propertyName ?? "SwiftPMS"}</p>
    <div class="status">${statusLabel(r.status)}</div>
  </div>

  <div class="section">
    <div class="section-title">Reservation Details</div>
    <table class="details-table">
      <tr>
        <td class="label">Reference</td>
        <td class="value">#${refId}</td>
      </tr>
      ${roomTypeName ? `<tr><td class="label">Accommodation</td><td class="value">${roomTypeName}</td></tr>` : ""}
      ${r.roomId ? `<tr><td class="label">Room</td><td class="value">${r.roomId}</td></tr>` : ""}
      <tr>
        <td class="label">Check-in</td>
        <td class="value">${formatDateNice(r.checkInDate)}</td>
      </tr>
      <tr>
        <td class="label">Check-out</td>
        <td class="value">${formatDateNice(r.checkOutDate)}</td>
      </tr>
      <tr>
        <td class="label">Duration</td>
        <td class="value">${nights} night${nights !== 1 ? "s" : ""}</td>
      </tr>
      <tr>
        <td class="label">Guests</td>
        <td class="value">${r.adults} adult${r.adults !== 1 ? "s" : ""}${r.children > 0 ? `, ${r.children} child${r.children !== 1 ? "ren" : ""}` : ""}</td>
      </tr>
      ${r.specialRequests ? `<tr><td class="label">Special Requests</td><td class="value" style="font-weight:400;font-style:italic;">${r.specialRequests}</td></tr>` : ""}
      <tr>
        <td class="label">Rate per Night</td>
        <td class="value">${rate}</td>
      </tr>
      <tr class="total-row">
        <td class="label" style="font-weight:700;color:#1e293b;">Total</td>
        <td class="value">${total}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Guest Information</div>
    <div class="guest-section">
      <table class="details-table">
        <tr>
          <td class="label">Name</td>
          <td class="value">${guestName}</td>
        </tr>
        <tr>
          <td class="label">Email</td>
          <td class="value">${guestEmail}</td>
        </tr>
      </table>
    </div>
  </div>

  ${r.status === "confirmed" ? `<div class="note">Please present this confirmation at check-in. Check-in time is from 14:00.</div>` : ""}

  <div class="footer">
    <p>Thank you for your booking${propertyName ? ` at ${propertyName}` : ""}.</p>
    <p style="margin-top:4px;">Generated on ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</p>
  </div>
</div>
</body>
</html>`;
}

export function downloadBookingPdf(data: BookingPdfData): void {
  const html = buildHtml(data);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to download the booking confirmation.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  // Wait for content to render, then trigger print (save as PDF)
  printWindow.onload = () => {
    printWindow.print();
  };
  // Fallback if onload doesn't fire (some browsers)
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
