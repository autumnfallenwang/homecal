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

export async function sendReminderEmail(
  config: EmailConfig,
  to: string,
  subject: string,
  body: string,
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
      to,
      subject,
      text: body,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    return { success: false, error: message };
  }
}
