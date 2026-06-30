import QRCode from "qrcode";

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
  /** Front desk base URL the QR code resolves to (e.g. https://swiftpms-prod.web.app). */
  frontdeskUrl?: string;
  tenantId?: string;
}

/**
 * Build the check-in URL the QR encodes. Staff scans the QR on the guest's
 * phone / printed PDF; their device opens this URL in the front desk app
 * which loads the reservation and offers a Check In button.
 */
function buildCheckInUrl(
  frontdeskUrl: string,
  tenantId: string,
  propertyId: string,
  reservationId: string,
): string {
  const base = frontdeskUrl.replace(/\/$/, "");
  const qs = new URLSearchParams({
    res: reservationId,
    p: propertyId,
    t: tenantId,
  });
  return `${base}/check-in?${qs.toString()}`;
}

function nightCount(ci: string, co: string): number {
  const diff = new Date(co).getTime() - new Date(ci).getTime();
  return Math.max(1, Math.round(diff / 86400000));
}

function fmtDate(dateStr: string): { day: string; month: string; weekday: string } {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate().toString(),
    month: d.toLocaleDateString("en-ZA", { month: "short" }),
    weekday: d.toLocaleDateString("en-ZA", { weekday: "long" }),
  };
}

function statusLabel(s: string): string {
  return { confirmed: "Confirmed", checked_in: "Checked In", checked_out: "Checked Out", cancelled: "Cancelled", no_show: "No Show" }[s] ?? s;
}

async function buildHtml(data: BookingPdfData): Promise<string> {
  const {
    reservation: r, guestName, guestEmail, propertyName, propertyAddress,
    propertyPhone, propertyEmail, roomTypeName, roomNumber, amenities,
    checkInTime, checkOutTime,
  } = data;

  // Real, scannable QR. Encodes the check-in URL — staff scans, lands on
  // the front desk reservation view, taps Check In.
  const frontdeskUrl =
    data.frontdeskUrl ?? "https://swiftpms-prod.web.app";
  const tenantId =
    data.tenantId ?? (import.meta.env.VITE_TENANT_ID as string | undefined) ?? "demo";
  const checkInUrl = buildCheckInUrl(
    frontdeskUrl,
    tenantId,
    r.propertyId,
    r.id,
  );
  const qrDataUri = await QRCode.toDataURL(checkInUrl, {
    errorCorrectionLevel: "Q",
    margin: 2,
    width: 320,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  const nights = nightCount(r.checkInDate, r.checkOutDate);
  const refId = r.id.slice(0, 8).toUpperCase();
  const total = formatCents(r.totalRoomCharges);
  const rate = formatCents(r.roomRate);
  const ci = fmtDate(r.checkInDate);
  const co = fmtDate(r.checkOutDate);
  const ciTime = checkInTime ?? "14:00";
  const coTime = checkOutTime ?? "11:00";
  const guests = `${r.adults} adult${r.adults !== 1 ? "s" : ""}${r.children > 0 ? `, ${r.children} child${r.children !== 1 ? "ren" : ""}` : ""}`;
  const amenityStr = amenities?.length
    ? amenities.map((a) => a.replace(/_/g, " ")).map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" \u00b7 ")
    : null;
  const exVat = Math.round(r.totalRoomCharges / 1.15);
  const vat = r.totalRoomCharges - exVat;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Booking Confirmation - ${refId}</title>
<style>
@page{size:A4;margin:18mm 18mm;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font:11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333;background:#fff;padding:24px;}
.p{max-width:680px;margin:0 auto;padding:0;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid #003580;margin-bottom:14px;gap:16px;}
.brand{font-size:18px;font-weight:800;color:#003580;}
.cb{text-align:right;}
.cb .cl{font-size:13px;font-weight:700;color:#333;}
.cb .cn{font-size:11px;color:#003580;font-weight:700;}
.cb .st{font-size:10px;color:#666;margin-top:1px;}
.badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}
.badge.confirmed{background:#e3f2fd;color:#1565c0;}
.badge.checked_in{background:#e8f5e9;color:#2e7d32;}
.badge.checked_out{background:#f5f5f5;color:#616161;}
.badge.cancelled{background:#ffebee;color:#c62828;}
.pn{font-size:12px;font-weight:700;color:#333;margin-bottom:2px;}
.pd{font-size:10px;color:#555;line-height:1.5;}
.pd b{color:#333;}
.dr{display:grid;grid-template-columns:1fr 1fr 60px 60px;gap:0;margin-top:10px;background:#f0f4f8;border-radius:5px;overflow:hidden;border:1px solid #ddd;}
.db{padding:8px 12px;text-align:center;}
.db .lb{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#003580;margin-bottom:2px;}
.db .dy{font-size:28px;font-weight:800;color:#003580;line-height:1;}
.db .mo{font-size:11px;font-weight:600;color:#333;}
.db .wd{font-size:10px;color:#666;}
.db .tm{font-size:9px;color:#888;margin-top:1px;}
.sb{padding:8px 4px;text-align:center;display:flex;flex-direction:column;justify-content:center;align-items:center;border-left:1px solid #ddd;}
.sb .sv{font-size:18px;font-weight:800;color:#003580;}
.sb .sl{font-size:8px;text-transform:uppercase;letter-spacing:.3px;color:#666;}
.grp{text-align:right;margin-top:4px;font-size:10px;color:#666;}
.grp b{color:#333;}
.ps{margin-top:12px;}
.ps h3{font-size:11px;font-weight:800;text-transform:uppercase;color:#003580;border-bottom:2px solid #003580;padding-bottom:3px;margin-bottom:6px;}
.pr{display:flex;justify-content:space-between;padding:2px 0;font-size:10px;color:#555;}
.pr.t{font-size:14px;font-weight:800;color:#333;padding-top:5px;border-top:1px solid #ddd;margin-top:4px;}
.rs{margin-top:12px;border-top:1px solid #e0e0e0;padding-top:8px;}
.rs h3{font-size:12px;font-weight:700;color:#333;margin-bottom:6px;}
.rm{font-size:10px;color:#555;line-height:1.6;}
.rm b{color:#333;}
.al{font-size:9px;color:#666;margin-top:4px;line-height:1.6;}
.ib{margin-top:10px;padding:8px 10px;border-radius:4px;font-size:10px;line-height:1.5;}
.ib.im{background:#fff8e1;border:1px solid #ffe082;}
.ib.im h4{font-size:10px;font-weight:700;color:#e65100;margin-bottom:3px;}
.ib.sp{background:#f3f4f6;border:1px solid #d1d5db;}
.ib.sp h4{font-size:10px;font-weight:700;color:#374151;margin-bottom:3px;}
.ib.ct{background:#eff6ff;border:1px solid #bfdbfe;}
.qr-box{margin-top:16px;padding:14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;display:flex;align-items:center;gap:18px;page-break-inside:avoid;}
.qr-box img{display:block;width:140px;height:140px;flex:0 0 140px;background:#fff;border-radius:4px;}
.qr-box .qr-text h4{font-size:13px;font-weight:800;color:#0f172a;margin:0 0 4px 0;letter-spacing:-0.2px;}
.qr-box .qr-text p{font-size:10px;line-height:1.5;color:#475569;margin:0 0 8px 0;}
.qr-box .qr-ref{display:inline-block;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:10px;font-weight:600;color:#0f172a;background:#e2e8f0;padding:2px 8px;border-radius:3px;letter-spacing:0.5px;}
.ft{margin-top:14px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#888;text-align:center;clear:both;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0;}.p{max-width:none;}}
@media screen and (max-width:720px){body{padding:12px;}.qr-box{flex-direction:column;text-align:center;}}
</style></head><body><div class="p">
<div class="hdr"><div><div class="brand">${propertyName ?? "SwiftPMS"}</div></div>
<div class="cb"><div class="cl">Booking confirmation</div><div class="cn">CONFIRMATION NUMBER: ${refId}</div>
<div class="st">STATUS: <span class="badge ${r.status}">${statusLabel(r.status)}</span></div></div></div>

<div class="pn">${propertyName ?? "Property"}</div>
<div class="pd">${propertyAddress ? `<b>Address:</b> ${propertyAddress}<br>` : ""}${propertyPhone ? `<b>Phone:</b> ${propertyPhone}<br>` : ""}${propertyEmail ? `<b>Email:</b> ${propertyEmail}` : ""}</div>

<div class="dr">
<div class="db"><div class="lb">Check-in</div><div class="dy">${ci.day}</div><div class="mo">${ci.month}</div><div class="wd">${ci.weekday}</div><div class="tm">From ${ciTime}</div></div>
<div class="db"><div class="lb">Check-out</div><div class="dy">${co.day}</div><div class="mo">${co.month}</div><div class="wd">${co.weekday}</div><div class="tm">By ${coTime}</div></div>
<div class="sb"><div class="sv">1</div><div class="sl">Room</div></div>
<div class="sb"><div class="sv">${nights}</div><div class="sl">Night${nights !== 1 ? "s" : ""}</div></div>
</div>
<div class="grp"><b>YOUR GROUP:</b> ${guests}</div>

<div class="ps"><h3>Price</h3>
<div class="pr"><span>1 campsite \u00d7 ${nights} night${nights !== 1 ? "s" : ""}</span><span>${formatCents(exVat)}</span></div>
<div class="pr"><span>15% VAT</span><span>${formatCents(vat)}</span></div>
<div class="pr t"><span>Price</span><span>${total}</span></div>
<div style="font-size:9px;color:#888;margin-top:2px;">Rate per night: ${rate}</div>
</div>

<div class="rs">
<h3>${roomTypeName ?? "Room"}${roomNumber ? ` \u2014 ${roomNumber}` : ""}</h3>
<div class="rm"><b>Guest name:</b> ${guestName}<br><b>Email:</b> ${guestEmail}<br><b>Number of guests:</b> ${guests}</div>
${amenityStr ? `<div class="al">${amenityStr}</div>` : ""}
</div>

<div class="qr-box">
<img src="${qrDataUri}" alt="Booking QR code"/>
<div class="qr-text">
<h4>Present this code on arrival</h4>
<p>Staff at ${propertyName ?? "the property"} will scan this QR to check you in. The code stays valid for the full duration of your stay (${nights} night${nights !== 1 ? "s" : ""}, ${ci.day} ${ci.month} \u2192 ${co.day} ${co.month}).</p>
<span class="qr-ref">REF #${refId}</span>
</div>
</div>

${r.specialRequests ? `<div class="ib sp"><h4>Special Requests</h4><p>${r.specialRequests}</p></div>` : ""}

<div class="ib im"><h4>Important Information</h4>
<p>Please present this confirmation at check-in. Check-in from ${ciTime}, check-out by ${coTime}. Please complete payment to secure your room.</p></div>

${propertyPhone || propertyEmail ? `<div class="ib ct"><b>Need help?</b> ${propertyEmail ? `Email: ${propertyEmail}` : ""}${propertyEmail && propertyPhone ? " | " : ""}${propertyPhone ? `Phone: ${propertyPhone}` : ""}</div>` : ""}

<div class="ft">This confirmation can be used to check in at ${propertyName ?? "the property"}. Generated ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</div>
</div></body></html>`;
}

export async function downloadBookingPdf(data: BookingPdfData): Promise<void> {
  // Open the window synchronously while we still have the user-gesture token,
  // THEN do the async QR work. Otherwise modern browsers block the popup.
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow popups to download the booking confirmation."); return; }
  w.document.write(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;">Generating your confirmation…</body></html>`,
  );
  const html = await buildHtml(data);
  w.document.open();
  w.document.write(html);
  w.document.close();
  let printed = false;
  function doPrint() { if (!printed) { printed = true; w!.print(); } }
  w.onload = doPrint;
  setTimeout(doPrint, 600);
}
