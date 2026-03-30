import { afterEach, describe, expect, it } from "vitest";
import { getEmailConfig } from "../../src/services/email.js";

describe("getEmailConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns config when all env vars set", () => {
    process.env.EMAIL_FROM = "test@example.com";
    process.env.EMAIL_PASSWORD = "secret";
    process.env.EMAIL_SMTP_SERVER = "smtp.example.com";
    process.env.EMAIL_SMTP_PORT = "587";

    const config = getEmailConfig();
    expect(config).toEqual({
      from: "test@example.com",
      password: "secret",
      smtpServer: "smtp.example.com",
      smtpPort: 587,
    });
  });

  it("returns null when EMAIL_FROM missing", () => {
    process.env.EMAIL_FROM = undefined;
    process.env.EMAIL_PASSWORD = "secret";
    process.env.EMAIL_SMTP_SERVER = "smtp.example.com";
    process.env.EMAIL_SMTP_PORT = "587";

    expect(getEmailConfig()).toBeNull();
  });

  it("returns null when EMAIL_PASSWORD missing", () => {
    process.env.EMAIL_FROM = "test@example.com";
    process.env.EMAIL_PASSWORD = undefined;
    process.env.EMAIL_SMTP_SERVER = "smtp.example.com";
    process.env.EMAIL_SMTP_PORT = "587";

    expect(getEmailConfig()).toBeNull();
  });

  it("returns null when no email env vars set", () => {
    process.env.EMAIL_FROM = undefined;
    process.env.EMAIL_PASSWORD = undefined;
    process.env.EMAIL_SMTP_SERVER = undefined;
    process.env.EMAIL_SMTP_PORT = undefined;

    expect(getEmailConfig()).toBeNull();
  });
});
