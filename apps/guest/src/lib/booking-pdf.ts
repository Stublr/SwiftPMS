import { formatCents } from "@swiftpms/shared";
import type { Reservation } from "@swiftpms/shared";

interface BookingPdfData {
  reservation: Reservation;
  guestName: string;
  guestEmail: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyPhone?: string;
  propertyEmail?: string;
  roomTypeName?: string;
  roomNumber?: string;
  amenities?: string[];
  checkInTime?: string;
  checkOutTime?: string;
}

function nightCount(ci: string, co: string): number {
  const diff = new Date(co).getTime() - new Date(ci).getTime();
  return Math.max(1, Math.round(diff / 86400000));
}

function formatDateParts(dateStr: string): { day: string; month: string; weekday: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate().toString(),
    month: d.toLocaleDateString("en-ZA", { month: "long" }),
    weekday: d.toLocaleDateString("en-ZA", { weekday: "long" }),
  };
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

function buildHtml(data: BookingPdfData): string {
  const {
    reservation: r, guestName, guestEmail, propertyName, propertyAddress,
    propertyPhone, propertyEmail, roomTypeName, roomNumber, amenities,
    checkInTime, checkOutTime,
  } = data;

  const nights = nightCount(r.checkInDate, r.checkOutDate);
  const refId = r.id.slice(0, 8).toUpperCase();
  const total = formatCents(r.totalRoomCharges);
  const rate = formatCents(r.roomRate);
  const ci = formatDateParts(r.checkInDate);
  const co = formatDateParts(r.checkOutDate);
  const ciTime = checkInTime ?? "14:00";
  const coTime = checkOutTime ?? "11:00";
  const guestCount = `${r.adults} adult${r.adults !== 1 ? "s" : ""}${r.children > 0 ? `, ${r.children} child${r.children !== 1 ? "ren" : ""}` : ""}`;
  const amenityList = amenities?.length
    ? amenities.map((a) => a.replace(/_/g, " ")).map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" · ")
    : null;

  // Calculate VAT (15% inclusive)
  const totalCents = r.totalRoomCharges;
  const exVatCents = Math.round(totalCents / 1.15);
  const vatCents = totalCents - exVatCents;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Booking Confirmation - ${refId}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; font-size: 13px; line-height: 1.5; }
  .page { max-width: 770px; margin: 0 auto; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 3px solid #003580; margin-bottom: 20px; }
  .brand { font-size: 22px; font-weight: 800; color: #003580; }
  .conf-block { text-align: right; }
  .conf-block .conf-label { font-size: 16px; font-weight: 700; color: #333; }
  .conf-block .conf-num { font-size: 14px; color: #003580; font-weight: 700; }
  .conf-block .pin { font-size: 12px; color: #666; margin-top: 2px; }

  /* Main grid */
  .main-grid { display: grid; grid-template-columns: 1fr 320px; gap: 24px; }

  /* Left column */
  .prop-name { font-size: 15px; font-weight: 700; color: #333; margin-bottom: 4px; }
  .prop-detail { font-size: 12px; color: #555; line-height: 1.6; }
  .prop-detail strong { color: #333; }

  /* Check-in/out blocks */
  .dates-row { display: grid; grid-template-columns: 1fr 1fr 80px 80px; gap: 0; margin-top: 16px; background: #f0f4f8; border-radius: 6px; overflow: hidden; border: 1px solid #ddd; }
  .date-block { padding: 12px 16px; text-align: center; }
  .date-block-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #003580; margin-bottom: 4px; }
  .date-block .day { font-size: 36px; font-weight: 800; color: #003580; line-height: 1; }
  .date-block .month { font-size: 13px; font-weight: 600; color: #333; }
  .date-block .weekday { font-size: 12px; color: #666; }
  .date-block .time { font-size: 11px; color: #888; margin-top: 2px; }
  .stat-block { padding: 12px 8px; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; border-left: 1px solid #ddd; }
  .stat-block .stat-val { font-size: 24px; font-weight: 800; color: #003580; }
  .stat-block .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }

  /* Price */
  .price-section { margin-top: 20px; }
  .price-section h3 { font-size: 13px; font-weight: 800; text-transform: uppercase; color: #003580; border-bottom: 2px solid #003580; padding-bottom: 4px; margin-bottom: 10px; }
  .price-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; color: #555; }
  .price-row.total { font-size: 18px; font-weight: 800; color: #333; padding-top: 8px; border-top: 1px solid #ddd; margin-top: 6px; }

  /* Room details */
  .room-section { margin-top: 20px; border-top: 2px solid #e0e0e0; padding-top: 14px; }
  .room-section h3 { font-size: 15px; font-weight: 700; color: #333; margin-bottom: 10px; }
  .room-meta { font-size: 12px; color: #555; line-height: 1.8; }
  .room-meta strong { color: #333; }
  .amenity-list { font-size: 11px; color: #666; margin-top: 8px; line-height: 1.8; }

  /* Info boxes */
  .info-box { margin-top: 20px; padding: 14px 16px; border-radius: 6px; font-size: 12px; line-height: 1.6; }
  .info-box.important { background: #fff8e1; border: 1px solid #ffe082; }
  .info-box.important h4 { font-size: 12px; font-weight: 700; color: #e65100; margin-bottom: 6px; }
  .info-box.special { background: #f3f4f6; border: 1px solid #d1d5db; }
  .info-box.special h4 { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 6px; }
  .info-box.contact { background: #eff6ff; border: 1px solid #bfdbfe; }

  /* Status badge */
  .status { display: inline-block; padding: 3px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .status.confirmed { background: #e3f2fd; color: #1565c0; }
  .status.checked_in { background: #e8f5e9; color: #2e7d32; }
  .status.checked_out { background: #f5f5f5; color: #616161; }
  .status.cancelled { background: #ffebee; color: #c62828; }

  /* Footer */
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #888; text-align: center; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: none; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">${propertyName ?? "SwiftPMS"}</div>
    </div>
    <div class="conf-block">
      <div class="conf-label">Booking confirmation</div>
      <div class="conf-num">CONFIRMATION NUMBER: ${refId}</div>
      <div class="pin">STATUS: <span class="status ${r.status}">${statusLabel(r.status)}</span></div>
    </div>
  </div>

  <!-- Main Grid -->
  <div class="main-grid">
    <!-- Left: Property Info -->
    <div>
      <div class="prop-name">${propertyName ?? "Property"}</div>
      <div class="prop-detail">
        ${propertyAddress ? `<strong>Address:</strong> ${propertyAddress}<br>` : ""}
        ${propertyPhone ? `<strong>Phone:</strong> ${propertyPhone}<br>` : ""}
        ${propertyEmail ? `<strong>Email:</strong> ${propertyEmail}` : ""}
      </div>
    </div>
    <!-- Right: nothing here, dates below span full width -->
    <div></div>
  </div>

  <!-- Date Blocks Row -->
  <div class="dates-row">
    <div class="date-block">
      <div class="date-block-label">Check-in</div>
      <div class="day">${ci.day}</div>
      <div class="month">${ci.month}</div>
      <div class="weekday">${ci.weekday}</div>
      <div class="time">From ${ciTime}</div>
    </div>
    <div class="date-block">
      <div class="date-block-label">Check-out</div>
      <div class="day">${co.day}</div>
      <div class="month">${co.month}</div>
      <div class="weekday">${co.weekday}</div>
      <div class="time">By ${coTime}</div>
    </div>
    <div class="stat-block">
      <div class="stat-val">1</div>
      <div class="stat-label">Room</div>
    </div>
    <div class="stat-block">
      <div class="stat-val">${nights}</div>
      <div class="stat-label">Night${nights !== 1 ? "s" : ""}</div>
    </div>
  </div>

  <!-- YOUR GROUP label -->
  <div style="text-align:right;margin-top:8px;font-size:12px;color:#666;">
    <strong style="color:#333;">YOUR GROUP:</strong> ${guestCount}
  </div>

  <!-- Price Section -->
  <div class="price-section">
    <h3>Price</h3>
    <div class="price-row">
      <span>1 room × ${nights} night${nights !== 1 ? "s" : ""}</span>
      <span>${formatCents(exVatCents)}</span>
    </div>
    <div class="price-row">
      <span>15% VAT</span>
      <span>${formatCents(vatCents)}</span>
    </div>
    <div class="price-row total">
      <span>Price</span>
      <span>${total}</span>
    </div>
    <div style="font-size:11px;color:#888;margin-top:4px;">
      Rate per night: ${rate}
    </div>
  </div>

  <!-- Room Details -->
  <div class="room-section">
    <h3>${roomTypeName ?? "Room"} ${roomNumber ? `— ${roomNumber}` : ""}</h3>
    <div class="room-meta">
      <strong>Guest name:</strong> ${guestName}<br>
      <strong>Email:</strong> ${guestEmail}<br>
      <strong>Number of guests:</strong> ${guestCount}
    </div>
    ${amenityList ? `<div class="amenity-list">${amenityList}</div>` : ""}
  </div>

  <!-- Special Requests -->
  ${r.specialRequests ? `
  <div class="info-box special">
    <h4>Special Requests</h4>
    <p>${r.specialRequests}</p>
    <p style="margin-top:6px;font-size:11px;color:#888;">Requests are subject to availability and cannot be guaranteed.</p>
  </div>
  ` : ""}

  <!-- Important Information -->
  <div class="info-box important">
    <h4>Important Information</h4>
    <p>Please present this confirmation at check-in. Check-in is from ${ciTime} and check-out is by ${coTime}.</p>
    <p style="margin-top:4px;">Please complete payment to secure your room. Unpaid bookings may be released.</p>
  </div>

  <!-- Contact -->
  ${propertyPhone || propertyEmail ? `
  <div class="info-box contact">
    <strong>Need help?</strong><br>
    ${propertyEmail ? `Email: ${propertyEmail}<br>` : ""}
    ${propertyPhone ? `Phone: ${propertyPhone}` : ""}
  </div>
  ` : ""}

  <!-- Footer -->
  <div class="footer">
    <p>This print version of your confirmation contains the most important information about your booking.</p>
    <p>It can be used to check in when you arrive at ${propertyName ?? "the property"}.</p>
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
  printWindow.onload = () => {
    printWindow.print();
  };
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
