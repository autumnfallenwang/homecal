import { createTransport } from "nodemailer";

export interface EmailConfig {
  from: string;
  password: string;
  smtpServer: string;
  smtpPort: number;
}

export function getEmailConfig(): EmailConfig | null {
  const from = process.env.EMAIL_FROM;
  const password = process.env.EMAIL_PASSWORD;
  const smtpServer = process.env.EMAIL_SMTP_SERVER;
  const smtpPort = process.env.EMAIL_SMTP_PORT;

  if (!from || !password || !smtpServer || !smtpPort) {
    return null;
  }

  return { from, password, smtpServer, smtpPort: Number(smtpPort) };
}

async function sendMail(
  config: EmailConfig,
  opts: { to: string; subject: string; text: string; html?: string },
): Promise<{ success: boolean; error?: string }> {
  const transport = createTransport({
    host: config.smtpServer,
    port: config.smtpPort,
    secure: false, // STARTTLS on port 587
    auth: {
      user: config.from,
      pass: config.password,
    },
  });

  try {
    await transport.sendMail({
      from: `HomeCal <${config.from}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      // Multipart: HTML when provided, plain text always as the fallback.
      ...(opts.html ? { html: opts.html } : {}),
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    return { success: false, error: message };
  }
}

export function sendReminderEmail(
  config: EmailConfig,
  to: string,
  subject: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  return sendMail(config, { to, subject, text: body });
}

/** Send a rendered daily digest — HTML body with the plain text as fallback.
 *  Distinct name so the digest scheduler's DispatchFns can be mocked in tests. */
export function sendDigestEmail(
  config: EmailConfig,
  to: string,
  subject: string,
  body: string,
  html?: string,
): Promise<{ success: boolean; error?: string }> {
  return sendMail(config, { to, subject, text: body, html });
}
