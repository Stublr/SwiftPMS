import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { formatCents } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { SENDGRID_API_KEY, sendHtmlEmail } from "../lib/email.js";
import {
  foliosRef,
  guestRef,
  propertyRef,
  reservationRef,
  roomTypeRef,
} from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const emailInvoiceSchema = z.object({
  propertyId: z.string().min(1),
  reservationId: z.string().min(1),
  /** Override recipient; defaults to the client (bookedFor) or guest email. */
  email: z.string().email().max(200).nullish().transform((v) => v ?? undefined),
});

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Staff emails the invoice for a reservation — to the booking-linked email
 * or an explicitly entered one. Blocked for cancelled / no-show bookings:
 * a cancelled booking has nothing to invoice.
 */
export const emailInvoice = onCall(
  { cors: true, secrets: [SENDGRID_API_KEY] },
  async (request) => {
    try {
      if (!request.auth) throw unauthorized();
      const tenantId = request.auth.token.tenantId as string;
      const role = request.auth.token.role as string;
      if (role === "guest" || role === "scanner") {
        throw preconditionFailed("Only front-desk staff can email invoices");
      }

      const data = validateRequest(emailInvoiceSchema, request.data);

      const resSnap = await reservationRef(tenantId, data.propertyId, data.reservationId).get();
      if (!resSnap.exists) throw notFound("Reservation not found");
      const r = resSnap.data()!;
      if (r.status === "cancelled" || r.status === "no_show") {
        throw preconditionFailed("Cancelled or no-show bookings cannot be invoiced");
      }

      const [guestSnap, propSnap, rtSnap, folioSnap] = await Promise.all([
        guestRef(tenantId, r.guestId as string).get(),
        propertyRef(tenantId, data.propertyId).get(),
        roomTypeRef(tenantId, r.roomTypeId as string).get(),
        foliosRef(tenantId, data.propertyId)
          .where("reservationId", "==", data.reservationId).limit(1).get(),
      ]);
      const guest = guestSnap.data();
      const prop = propSnap.data();
      const bookedFor = r.bookedFor as { name?: string; email?: string } | null | undefined;

      const to =
        data.email ??
        bookedFor?.email ??
        (guest?.email as string | undefined);
      if (!to) throw preconditionFailed("No email on this booking — enter one explicitly");

      const billTo =
        bookedFor?.name ??
        (`${guest?.firstName ?? ""} ${guest?.lastName ?? ""}`.trim() || "Guest");
      // The invoice is always billed to the person the booking is linked to
      // (client for operator bookings, else the guest) — even when staff send
      // it to a different recipient address.
      const billToEmail = bookedFor?.email ?? (guest?.email as string | undefined) ?? null;

      const refId = data.reservationId.slice(0, 8).toUpperCase();
      const total = r.totalRoomCharges as number;
      const exVat = Math.round(total / 1.15);
      const vat = total - exVat;
      const nights = r.nightCount as number;
      const folio = folioSnap.empty ? null : folioSnap.docs[0]!.data();
      const paid = (folio?.totalPayments as number | undefined) ?? 0;
      const balance = Math.max(0, total - paid);
      const propertyName = (prop?.name as string) ?? "Our Lodge";
      const roomTypeName = (rtSnap.data()?.name as string) ?? "Room";

      // Same design system as the booking-confirmation SendGrid template
      // (src/lib/email-templates/booking-confirmation.html): slate palette,
      // navy gradient header + ref pill, f8fafc details card, footer strip.
      const row = (label: string, value: string) =>
        `<tr>
          <td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">${label}</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0;">${value}</td>
        </tr>`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Invoice INV-${refId}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:32px 40px;text-align:center;">
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tax Invoice</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">${propertyName}</p>
      <div style="margin-top:16px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:20px;padding:6px 18px;">
        <span style="font-size:13px;font-weight:600;color:#ffffff;">INV-${refId}</span>
      </div>
    </td>
  </tr>

  <!-- Billed to -->
  <tr>
    <td style="padding:32px 40px 16px;">
      <p style="margin:0;font-size:16px;color:#1e293b;">Dear <strong>${billTo}</strong>,</p>
      <p style="margin:12px 0 0;font-size:14px;color:#475569;line-height:1.7;">
        Please find your invoice for booking <strong>#${refId}</strong> at <strong>${propertyName}</strong> below.
      </p>
    </td>
  </tr>

  <!-- Invoice Details -->
  <tr>
    <td style="padding:8px 40px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">Invoice Details</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
              ${row("Billed to", `${billTo}${billToEmail ? `<br><span style="font-weight:400;color:#64748b;font-size:12px;">${billToEmail}</span>` : ""}`)}
              ${row("Accommodation", roomTypeName)}
              ${row("Check-in", fmtDate(r.checkInDate as string))}
              ${row("Check-out", fmtDate(r.checkOutDate as string))}
              ${row("Duration", `${nights} night${nights !== 1 ? "s" : ""}`)}
              ${row(`Accommodation (ex VAT)`, formatCents(exVat))}
              ${row("15% VAT", formatCents(vat))}
              <tr>
                <td style="padding:14px 0 10px;color:#1e293b;font-weight:700;border-top:2px solid #cbd5e1;">Total</td>
                <td style="padding:14px 0 10px;text-align:right;font-weight:800;font-size:22px;color:#0f172a;border-top:2px solid #cbd5e1;">${formatCents(total)}</td>
              </tr>
              ${row("Paid", formatCents(paid))}
              <tr>
                <td style="padding:10px 0;color:#1e293b;font-weight:700;">Balance due</td>
                <td style="padding:10px 0;text-align:right;font-weight:800;color:${balance > 0 ? "#b91c1c" : "#15803d"};">${formatCents(balance)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${prop?.email || prop?.phone ? `
  <!-- Contact -->
  <tr>
    <td style="padding:0 40px 32px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">Need Help?</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
        ${prop?.email ? `Email: <a href="mailto:${prop.email}" style="color:#2563eb;text-decoration:none;">${prop.email}</a>` : ""}${prop?.email && prop?.phone ? " &nbsp;|&nbsp; " : ""}${prop?.phone ? `Phone: <a href="tel:${prop.phone}" style="color:#2563eb;text-decoration:none;">${prop.phone}</a>` : ""}
      </p>
    </td>
  </tr>` : ""}

  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:13px;color:#64748b;">Thank you for choosing <strong>${propertyName}</strong>.</p>
      <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">Generated ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}. This is an automated email. Please do not reply.</p>
    </td>
  </tr>

</table>

</td></tr>
</table>
</body>
</html>`;

      await sendHtmlEmail({
        to,
        subject: `Invoice INV-${refId} — ${propertyName}`,
        html,
      });

      return { ok: true, sentTo: to };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      wrapError(err);
    }
  },
);
