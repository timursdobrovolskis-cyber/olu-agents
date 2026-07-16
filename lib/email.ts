import { Resend } from "resend";

export interface SendEmailResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

const DEFAULT_FROM = "Cart Recovery Demo <onboarding@resend.dev>";

export async function sendRecoveryEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM || DEFAULT_FROM;

    const { data, error } = await resend.emails.send({
      from,
      to: [params.to],
      subject: params.subject,
      html: `<p>${params.body.replace(/\n/g, "<br />")}</p>`,
    });

    if (error) {
      return { sent: false, reason: error.message };
    }

    return { sent: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    return { sent: false, reason: message };
  }
}
