import QRCode from "qrcode";

import { formatCents } from "@swiftpms/shared";
import type { Reservation } from "@swiftpms/shared";

export interface BookingPdfData {
  reservation: Reservation;
  guestName: string;
  guestEmail: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyPhone?: string;
  propertyEmail?: string;
  /** URL to the property logo (root-relative like "/logos/sugarloaf.png" or absolute). Rendered in the header if present; falls back to a text brand otherwise. */
  propertyLogoUrl?: string | null;
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

/**
 * Fetch a logo URL and return it as a base64 data URI. Inlining avoids CORS
 * / network issues when the browser prints the popup to PDF — external
 * <img src> requests can be blocked by the print engine or fail on airplane
 * mode. Returns null on failure so the caller can fall back to the text
 * brand.
 */
async function fetchLogoAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const MIDDOT = "·";
const TIMES = "×";
const EM_DASH = "—";
const RIGHT_ARROW = "→";

const PDF_STYLES = `@page{size:A4;margin:24mm 22mm;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
body{font:11px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333;background:#fff;padding:22mm 20mm;}
@media print{body{padding:0;}}
.p{max-width:680px;margin:0 auto;padding:0;}
/* Every section after the first starts a new printed page (group booking). */
.p + .p{page-break-before:always;margin-top:0;}
.site-lbl{display:inline-block;margin-bottom:8px;padding:3px 10px;border-radius:999px;background:#003580;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid #003580;margin-bottom:14px;gap:16px;}
.brand{font-size:18px;font-weight:800;color:#003580;}
.brand-logo{display:block;height:56px;width:auto;max-width:200px;object-fit:contain;}
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
`;

interface SectionExtras {
  /** 1-based site number within a group booking. Undefined for solo. */
  siteIndex?: number;
  /** Total sites in the group booking. Undefined for solo. */
  siteCount?: number;
  /** Base64 data URI of the property logo. Inlined so the printed PDF doesn't depend on network access. */
  logoDataUri?: string | null;
}

/**
 * Build the inner HTML for one reservation. No <html>/<head>/<body>/<style>
 * wrappers — both solo and group renderers stitch these together in
 * buildHtmlDocument.
 */
async function buildSection(
  data: BookingPdfData,
  extras: SectionExtras = {},
): Promise<string> {
  const {
    reservation: r, guestName, guestEmail, propertyName, propertyAddress,
    propertyPhone, propertyEmail, roomTypeName, roomNumber, amenities,
    checkInTime, checkOutTime,
  } = data;

  const frontdeskUrl = data.frontdeskUrl ?? "https://swiftpms-prod.web.app";
  const tenantId =
    data.tenantId ?? (import.meta.env.VITE_TENANT_ID as string | undefined) ?? "demo";
  const checkInUrl = buildCheckInUrl(frontdeskUrl, tenantId, r.propertyId, r.id);
  const qrDataUri = await QRCode.toDataURL(checkInUrl, {
    errorCorrectionLevel: "Q",
    margin: 2,
    width: 320,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  const nights = nightCount(r.checkInDate, r.checkOutDate);
  const refId = r.id.slice(0, 8).toUpperCase();
  const total = formatCents(r.totalRoomCharges);
  // Effective per-night rate derived from the (possibly discounted) total so
  // it always reconciles with the totals/VAT lines — r.roomRate is the gross
  // nightly rate and would disagree for tour-operator bookings.
  const rate = formatCents(
    nights > 0 && r.totalRoomCharges > 0
      ? Math.round(r.totalRoomCharges / nights)
      : r.roomRate,
  );
  const ci = fmtDate(r.checkInDate);
  const co = fmtDate(r.checkOutDate);
  const ciTime = checkInTime ?? "14:00";
  const coTime = checkOutTime ?? "11:00";
  const guests = `${r.adults} adult${r.adults !== 1 ? "s" : ""}${r.children > 0 ? `, ${r.children} child${r.children !== 1 ? "ren" : ""}` : ""}`;
  const amenityStr = amenities?.length
    ? amenities.map((a) => a.replace(/_/g, " ")).map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(` ${MIDDOT} `)
    : null;
  const exVat = Math.round(r.totalRoomCharges / 1.15);
  const vat = r.totalRoomCharges - exVat;

  const isGroup =
    extras.siteIndex !== undefined && extras.siteCount !== undefined && extras.siteCount > 1;
  const siteBadge = isGroup
    ? `<div class="site-lbl">Site ${extras.siteIndex} of ${extras.siteCount}</div>`
    : "";

  // Left side of the header: logo if we have one (inlined as data URI to
  // survive the print-to-PDF flow), otherwise the text brand.
  const brandBlock = extras.logoDataUri
    ? `<img class="brand-logo" src="${extras.logoDataUri}" alt="${propertyName ?? "Property"}"/>`
    : `<div class="brand">${propertyName ?? "SwiftPMS"}</div>`;

  return `<div class="p">
${siteBadge}
<div class="hdr"><div>${brandBlock}</div>
<div class="cb"><div class="cl">Booking confirmation</div><div class="cn">CONFIRMATION NUMBER: ${refId}</div>
<div class="st">STATUS: <span class="badge ${r.status}">${statusLabel(r.status)}</span></div></div></div>

<div class="pn">${propertyName ?? "Property"}</div>
<div class="pd">${propertyAddress ? `<b>Address:</b> ${propertyAddress}<br>` : ""}${propertyPhone ? `<b>Phone:</b> ${propertyPhone}<br>` : ""}${propertyEmail ? `<b>Email:</b> ${propertyEmail}` : ""}</div>

<div class="dr">
<div class="db"><div class="lb">Check-in</div><div class="dy">${ci.day}</div><div class="mo">${ci.month}</div><div class="wd">${ci.weekday}</div><div class="tm">From ${ciTime}</div></div>
<div class="db"><div class="lb">Check-out</div><div class="dy">${co.day}</div><div class="mo">${co.month}</div><div class="wd">${co.weekday}</div><div class="tm">By ${coTime}</div></div>
<div class="sb"><div class="sv">1</div><div class="sl">Site</div></div>
<div class="sb"><div class="sv">${nights}</div><div class="sl">Night${nights !== 1 ? "s" : ""}</div></div>
</div>
<div class="grp"><b>${isGroup ? "GUESTS ON THIS SITE:" : "YOUR GROUP:"}</b> ${guests}</div>

<div class="ps"><h3>${isGroup ? "Price for this site" : "Price"}</h3>
<div class="pr"><span>1 campsite ${TIMES} ${nights} night${nights !== 1 ? "s" : ""}</span><span>${formatCents(exVat)}</span></div>
<div class="pr"><span>15% VAT</span><span>${formatCents(vat)}</span></div>
<div class="pr t"><span>Total</span><span>${total}</span></div>
<div style="font-size:9px;color:#888;margin-top:2px;">Rate per night: ${rate}</div>
</div>

<div class="rs">
<h3>${roomTypeName ?? "Room"}${roomNumber ? ` ${EM_DASH} ${roomNumber}` : ""}</h3>
<div class="rm"><b>Guest name:</b> ${guestName}<br><b>Email:</b> ${guestEmail}<br><b>Number of guests:</b> ${guests}</div>
${amenityStr ? `<div class="al">${amenityStr}</div>` : ""}
</div>

<div class="qr-box">
<img src="${qrDataUri}" alt="Booking QR code"/>
<div class="qr-text">
<h4>Present this code on arrival</h4>
<p>Staff at ${propertyName ?? "the property"} will scan this QR to check ${isGroup ? "this site" : "you"} in. The code stays valid for the full duration of your stay (${nights} night${nights !== 1 ? "s" : ""}, ${ci.day} ${ci.month} ${RIGHT_ARROW} ${co.day} ${co.month}).${isGroup ? " Each site in a group booking has its own QR — bring them all." : ""}</p>
<span class="qr-ref">REF #${refId}</span>
</div>
</div>

${r.specialRequests ? `<div class="ib sp"><h4>Special Requests</h4><p>${r.specialRequests}</p></div>` : ""}

<div class="ib im"><h4>Important Information</h4>
<p>Please present this confirmation at check-in. Check-in from ${ciTime}, check-out by ${coTime}.</p></div>

${propertyPhone || propertyEmail ? `<div class="ib ct"><b>Need help?</b> ${propertyEmail ? `Email: ${propertyEmail}` : ""}${propertyEmail && propertyPhone ? " | " : ""}${propertyPhone ? `Phone: ${propertyPhone}` : ""}</div>` : ""}

<div class="ft">This confirmation can be used to check in at ${propertyName ?? "the property"}. Generated ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</div>
</div>`;
}

/**
 * Compose one or more reservation sections into a printable HTML document.
 * Sections after the first get an implicit page break via
 * `.p + .p { page-break-before: always }` (defined in PDF_STYLES).
 */
async function buildHtmlDocument(items: BookingPdfData[]): Promise<string> {
  if (items.length === 0) return "";
  const first = items[0]!;
  const refId = first.reservation.id.slice(0, 8).toUpperCase();
  const title =
    items.length > 1
      ? `Group booking confirmation ${EM_DASH} ${items.length} sites`
      : `Booking Confirmation - ${refId}`;
  // Resolve the property logo ONCE and reuse across sections — every section
  // in a group booking is for the same property, and inlining a ~65 KB base64
  // string per section would bloat the document.
  const logoUrl = first.propertyLogoUrl ?? null;
  const logoDataUri = logoUrl ? await fetchLogoAsDataUri(logoUrl) : null;
  const sections = await Promise.all(
    items.map((data, i) =>
      buildSection(data, {
        siteIndex: i + 1,
        siteCount: items.length,
        logoDataUri,
      }),
    ),
  );
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>${PDF_STYLES}</style></head><body>${sections.join("\n")}</body></html>`;
}

/**
 * Open a print-preview window with a solo booking confirmation. Kept as a
 * thin wrapper around downloadBookingGroupPdf so callers that only have one
 * reservation don't have to think about the group array shape.
 */
export async function downloadBookingPdf(data: BookingPdfData): Promise<void> {
  await downloadBookingGroupPdf([data]);
}

/**
 * Open a print-preview window with a group booking confirmation — one page
 * per site, each with its own QR. Same window mechanics as the solo version.
 */
export async function downloadBookingGroupPdf(
  items: BookingPdfData[],
): Promise<void> {
  if (items.length === 0) return;
  // Open the window synchronously while we still have the user-gesture token,
  // THEN do the async QR work. Otherwise modern browsers block the popup.
  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow popups to download the booking confirmation.");
    return;
  }
  w.document.write(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;">Generating your confirmation${items.length > 1 ? "s" : ""}…</body></html>`,
  );
  const html = await buildHtmlDocument(items);
  w.document.open();
  w.document.write(html);
  w.document.close();
  let printed = false;
  function doPrint() {
    if (!printed) {
      printed = true;
      w!.print();
    }
  }
  w.onload = doPrint;
  setTimeout(doPrint, 600);
}
