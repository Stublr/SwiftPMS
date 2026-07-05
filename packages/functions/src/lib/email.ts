import { defineSecret, defineString } from "firebase-functions/params";

// SendGrid Dynamic Templates. The HTML design lives in SendGrid itself (see
// src/lib/email-templates/booking-confirmation.html for the source we pasted
// in there) — this file only builds the per-send payload and calls the API.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SENDGRID_API_KEY: any = defineSecret("SENDGRID_API_KEY");

// Non-secret config — set per-project in .env.<project-id>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SENDGRID_TEMPLATE_ID_BOOKING_CONFIRMATION: any = defineString(
  "SENDGRID_TEMPLATE_ID_BOOKING_CONFIRMATION",
  { default: "" },
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FROM_EMAIL: any = defineString("FROM_EMAIL", {
  // TODO: point this at a sender/domain verified in the SendGrid account
  // before going live — SendGrid rejects sends from unverified senders.
  default: "SwiftPMS <bookings@swiftpms.example>",
});

/**
 * Comma-separated list of email addresses to BCC on every booking
 * confirmation. Used so the front gate keeps its own copy — if a guest
 * loses their confirmation email, the gate can pull it from this
 * mailbox and verify arrival. Blank = no BCC. Not exposed to guests
 * (BCC, not CC, so the reply chain stays clean).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CONFIRMATION_EMAIL_BCC: any = defineString("CONFIRMATION_EMAIL_BCC", {
  default: "",
});

export interface BookingEmailData {
  to: string;
  guestName: string;
  propertyName: string;
  propertyEmail?: string;
  propertyPhone?: string;
  /** Absolute URL to the property logo. Rendered in the header of the SendGrid dynamic template if the template references {{logoUrl}}. Absolute (not root-relative) because email clients render off-server. */
  propertyLogoUrl?: string | null;
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

/** Parses "Name <email@domain>" or a bare "email@domain" into SendGrid's from-object shape. */
function parseFromAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(.*)<(.+)>$/);
  if (match) {
    const name = match[1]!.trim();
    const email = match[2]!.trim();
    return name ? { email, name } : { email };
  }
  return { email: raw.trim() };
}

/**
 * Maps our internal booking data to the dynamic_template_data fields the
 * SendGrid template expects. Keep the keys in sync with
 * email-templates/booking-confirmation.html.
 */
function buildDynamicTemplateData(data: BookingEmailData) {
  const {
    guestName, propertyName, propertyEmail, propertyPhone, propertyLogoUrl,
    roomTypeName, roomName, checkInDate, checkOutDate,
    nightCount, adults, children, totalAmount, ratePerNight,
    reservationId, specialRequests, checkInTime, checkOutTime,
  } = data;

  return {
    guestName,
    propertyName,
    logoUrl: propertyLogoUrl || null,
    refId: reservationId.slice(0, 8).toUpperCase(),
    roomTypeName,
    roomName: roomName || null,
    checkInDate: formatDateForEmail(checkInDate),
    checkInTime: checkInTime || null,
    checkOutDate: formatDateForEmail(checkOutDate),
    checkOutTime: checkOutTime || null,
    nights: `${nightCount} night${nightCount > 1 ? "s" : ""}`,
    guests: `${adults ?? 1} adult${(adults ?? 1) > 1 ? "s" : ""}${children && children > 0 ? `, ${children} child${children > 1 ? "ren" : ""}` : ""}`,
    ratePerNight: ratePerNight || null,
    totalAmount,
    specialRequests: specialRequests || null,
    propertyEmail: propertyEmail || null,
    propertyPhone: propertyPhone || null,
  };
}

export async function sendBookingConfirmation(opts: BookingEmailData) {
  const apiKey = SENDGRID_API_KEY.value();
  if (!apiKey) {
    console.log(`[email] Skipped booking confirmation to ${opts.to} (no SENDGRID_API_KEY)`);
    return;
  }
  const templateId = SENDGRID_TEMPLATE_ID_BOOKING_CONFIRMATION.value();
  if (!templateId) {
    console.warn(
      `[email] Skipped booking confirmation to ${opts.to} (SENDGRID_TEMPLATE_ID_BOOKING_CONFIRMATION not configured)`,
    );
    return;
  }

  const refId = opts.reservationId.slice(0, 8).toUpperCase();
  const bccRaw = (CONFIRMATION_EMAIL_BCC.value() ?? "").trim();
  const bccList = bccRaw
    ? bccRaw
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && s.toLowerCase() !== opts.to.toLowerCase())
        .map((email: string) => ({ email }))
    : [];
  const personalization: Record<string, unknown> = {
    to: [{ email: opts.to }],
    dynamic_template_data: buildDynamicTemplateData(opts),
  };
  if (bccList.length > 0) personalization.bcc = bccList;
  const body = {
    personalizations: [personalization],
    from: parseFromAddress(FROM_EMAIL.value()),
    subject: `Booking Confirmed - ${opts.propertyName} (#${refId})`,
    template_id: templateId,
    tracking_settings: {
      click_tracking: { enable: true, enable_text: true },
      open_tracking: { enable: true },
    },
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid send failed (${res.status}): ${text.slice(0, 500)}`);
  }
}
