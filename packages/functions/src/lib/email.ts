let _resend: import("resend").Resend | null = null;

function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.warn("RESEND_API_KEY not set — emails will be skipped");
      return null;
    }
    // Dynamic require to avoid crash at module load time
    const { Resend } = require("resend") as typeof import("resend");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "SwiftPMS <onboarding@resend.dev>";

export interface BookingEmailData {
  to: string;
  guestName: string;
  propertyName: string;
  propertyEmail?: string;
  propertyPhone?: string;
  roomTypeName: string;
  roomName: string | null;
  checkInDate: string;
  checkOutDate: string;
  nightCount: number;
  adults?: number;
  children?: number;
  totalAmount: string;
  ratePerNight?: string;
  reservationId: string;
  specialRequests?: string | null;
  checkInTime?: string;
  checkOutTime?: string;
}

function formatDateForEmail(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildBookingConfirmationHtml(data: BookingEmailData): string {
  const {
    guestName, propertyName, propertyEmail, propertyPhone,
    roomTypeName, roomName, checkInDate, checkOutDate,
    nightCount, adults, children, totalAmount, ratePerNight,
    reservationId, specialRequests, checkInTime, checkOutTime,
  } = data;

  const refId = reservationId.slice(0, 8).toUpperCase();
  const nightsLabel = `${nightCount} night${nightCount > 1 ? "s" : ""}`;
  const guestsLabel = `${adults ?? 1} adult${(adults ?? 1) > 1 ? "s" : ""}${children && children > 0 ? `, ${children} child${children > 1 ? "ren" : ""}` : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Booking Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">

<!-- Main Container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:32px 40px;text-align:center;">
      <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Booking Confirmed</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">${propertyName}</p>
      <div style="margin-top:16px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:20px;padding:6px 18px;">
        <span style="font-size:13px;font-weight:600;color:#ffffff;">Ref: #${refId}</span>
      </div>
    </td>
  </tr>

  <!-- Welcome -->
  <tr>
    <td style="padding:32px 40px 16px;">
      <p style="margin:0;font-size:16px;color:#1e293b;">Dear <strong>${guestName}</strong>,</p>
      <p style="margin:12px 0 0;font-size:14px;color:#475569;line-height:1.7;">
        Thank you for your reservation. We're delighted to confirm your upcoming stay at <strong>${propertyName}</strong>. Below are your booking details.
      </p>
    </td>
  </tr>

  <!-- Booking Details -->
  <tr>
    <td style="padding:8px 40px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">Reservation Details</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
              <tr>
                <td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Accommodation</td>
                <td style="padding:10px 0;text-align:right;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0;">${roomTypeName}${roomName ? ` &mdash; ${roomName}` : ""}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Check-in</td>
                <td style="padding:10px 0;text-align:right;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0;">${formatDateForEmail(checkInDate)}${checkInTime ? ` from ${checkInTime}` : ""}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Check-out</td>
                <td style="padding:10px 0;text-align:right;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0;">${formatDateForEmail(checkOutDate)}${checkOutTime ? ` by ${checkOutTime}` : ""}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Duration</td>
                <td style="padding:10px 0;text-align:right;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0;">${nightsLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Guests</td>
                <td style="padding:10px 0;text-align:right;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0;">${guestsLabel}</td>
              </tr>
              ${ratePerNight ? `<tr>
                <td style="padding:10px 0;color:#64748b;border-bottom:1px solid #e2e8f0;">Rate per Night</td>
                <td style="padding:10px 0;text-align:right;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0;">${ratePerNight}</td>
              </tr>` : ""}
              <tr>
                <td style="padding:14px 0 10px;color:#1e293b;font-weight:700;border-top:2px solid #cbd5e1;">Total</td>
                <td style="padding:14px 0 10px;text-align:right;font-weight:800;font-size:22px;color:#0f172a;border-top:2px solid #cbd5e1;">${totalAmount}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${specialRequests ? `
  <!-- Special Requests -->
  <tr>
    <td style="padding:0 40px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#92400e;">Special Requests</p>
            <p style="margin:0;font-size:13px;color:#78350f;font-style:italic;">${specialRequests}</p>
            <p style="margin:6px 0 0;font-size:11px;color:#a16207;">Requests are subject to availability and cannot be guaranteed.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ` : ""}

  <!-- Payment Notice -->
  <tr>
    <td style="padding:0 40px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #dbeafe;border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.6;">
              <strong>Payment:</strong> Please complete payment within 30 minutes to secure your room. Unpaid bookings may be released automatically.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Contact -->
  ${propertyEmail || propertyPhone ? `
  <tr>
    <td style="padding:0 40px 32px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">Need Help?</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
        ${propertyEmail ? `Email: <a href="mailto:${propertyEmail}" style="color:#2563eb;text-decoration:none;">${propertyEmail}</a>` : ""}
        ${propertyEmail && propertyPhone ? " &nbsp;|&nbsp; " : ""}
        ${propertyPhone ? `Phone: <a href="tel:${propertyPhone.replace(/\s/g, "")}" style="color:#2563eb;text-decoration:none;">${propertyPhone}</a>` : ""}
      </p>
    </td>
  </tr>
  ` : ""}

  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:13px;color:#64748b;">Thank you for choosing <strong>${propertyName}</strong>.</p>
      <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">This is an automated confirmation. Please do not reply to this email.</p>
    </td>
  </tr>

</table>
<!-- End Main Container -->

</td></tr>
</table>
</body>
</html>`;
}

export async function sendBookingConfirmation(opts: BookingEmailData) {
  const resend = getResend();
  if (!resend) {
    console.log(`[email] Skipped booking confirmation to ${opts.to} (no RESEND_API_KEY)`);
    return;
  }

  const html = buildBookingConfirmationHtml(opts);

  await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.to,
    subject: `Booking Confirmed - ${opts.propertyName} (#${opts.reservationId.slice(0, 8).toUpperCase()})`,
    html,
  });
}

// Export for use in other email types later
export { buildBookingConfirmationHtml };
