import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "SwiftPMS <onboarding@resend.dev>";

export async function sendBookingConfirmation(opts: {
  to: string;
  guestName: string;
  propertyName: string;
  roomTypeName: string;
  roomName: string | null;
  checkInDate: string;
  checkOutDate: string;
  nightCount: number;
  totalAmount: string;
  reservationId: string;
}) {
  const { to, guestName, propertyName, roomTypeName, roomName, checkInDate, checkOutDate, nightCount, totalAmount, reservationId } = opts;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Booking Confirmed — ${propertyName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 24px 0; border-bottom: 2px solid #e5e7eb;">
          <h1 style="margin: 0; font-size: 24px; color: #1e293b;">Booking Confirmed</h1>
          <p style="margin: 8px 0 0; color: #64748b; font-size: 14px;">${propertyName}</p>
        </div>

        <div style="padding: 24px 0;">
          <p style="font-size: 16px; color: #1e293b;">Hi ${guestName},</p>
          <p style="color: #475569; line-height: 1.6;">
            Your reservation has been confirmed. Here are your booking details:
          </p>
        </div>

        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Reservation</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1e293b;">#${reservationId.slice(0, 8).toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Accommodation</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1e293b;">${roomTypeName}${roomName ? ` — ${roomName}` : ""}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Check-in</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1e293b;">${checkInDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Check-out</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1e293b;">${checkOutDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Duration</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1e293b;">${nightCount} night${nightCount > 1 ? "s" : ""}</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 12px 0 8px; color: #64748b; font-weight: 600;">Total</td>
              <td style="padding: 12px 0 8px; text-align: right; font-weight: 700; font-size: 18px; color: #1e293b;">${totalAmount}</td>
            </tr>
          </table>
        </div>

        <div style="padding: 16px 0; color: #475569; font-size: 14px; line-height: 1.6;">
          <p><strong>Important:</strong> Please complete payment within 30 minutes to secure your room. Unpaid bookings may be released automatically.</p>
        </div>

        <div style="text-align: center; padding: 24px 0; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 12px;">
          <p>Thank you for choosing ${propertyName}.</p>
        </div>
      </div>
    `,
  });
}
