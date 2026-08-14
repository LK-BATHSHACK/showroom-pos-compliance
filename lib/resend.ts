import { Resend } from "resend";

let client: Resend | null = null;
function getClient() {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(key);
  }
  return client;
}

export async function sendEmail(to: string | string[], subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set - skipping email send:", subject);
    return { skipped: true };
  }
  const resend = getClient();
  // IMPORTANT: this "from" address must be on a domain that shows as
  // Verified on the Domains page of the Resend account tied to
  // RESEND_API_KEY. Resend rejects the send outright if it isn't - and the
  // SDK does NOT throw on that rejection (see the catch below), it just
  // returns { data: null, error }, so a domain mismatch here fails 100% of
  // emails completely silently unless the caller checks `error`.
  const result = await resend.emails.send({
    from: "Showroom POS Compliance <notifications@bathshack.com>",
    to,
    subject,
    html,
  });
  if (result.error) {
    // Resend's SDK resolves (doesn't reject) on a send failure, so without
    // this the caller's `await sendEmail(...)` looks like it succeeded even
    // when nothing was sent - this is the fix for exactly that silent-failure
    // pattern (found 12 Aug 2026: every email was failing because the old
    // "from" address used an unverified domain, and nothing ever logged it).
    console.error(`Resend send failed - to: ${to}, subject: "${subject}":`, result.error);
  }
  return result;
}

export const BRAND = {
  pink: "#E6017E",
  black: "#1D1C1D",
  grey: "#6E6E6E",
};

export function emailShell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
    <div style="background:${BRAND.pink}; padding: 16px 24px;">
      <span style="color:#fff; font-weight:bold; font-size:18px;">Bathshack - Showroom POS Compliance</span>
    </div>
    <div style="padding: 24px; color:${BRAND.black};">
      <h2 style="margin-top:0;">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="padding: 12px 24px; color:${BRAND.grey}; font-size:12px;">
      Automated message from the Showroom POS Compliance system.
    </div>
  </div>`;
}
