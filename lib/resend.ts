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
  return resend.emails.send({
    from: "Showroom POS Compliance <notifications@bathshapp.com>",
    to,
    subject,
    html,
  });
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
