import { createSign } from "node:crypto";
import { connect } from "node:http2";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  production: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
}

export interface PushResult {
  success: boolean;
  reason?: string;
}

let cachedJwt: { token: string; issuedAt: number } | null = null;

function generateJwt(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);

  // Reuse JWT for up to 50 minutes (APNs allows 60 min)
  if (cachedJwt && now - cachedJwt.issuedAt < 3000) {
    return cachedJwt.token;
  }

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify({ iss: config.teamId, iat: now })).toString(
    "base64url",
  );

  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(config.privateKey, "base64url");

  const token = `${header}.${payload}.${signature}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

export function getApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY;
  const bundleId = process.env.APNS_BUNDLE_ID;

  if (!keyId || !teamId || !privateKey || !bundleId) {
    return null;
  }

  return {
    keyId,
    teamId,
    privateKey,
    bundleId,
    production: process.env.APNS_PRODUCTION === "true",
  };
}

export function sendPush(
  config: ApnsConfig,
  deviceToken: string,
  payload: PushPayload,
): Promise<PushResult> {
  const host = config.production
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";

  const jwt = generateJwt(config);

  const apnsPayload = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
  });

  return new Promise((resolve) => {
    const client = connect(host);

    client.on("error", () => {
      client.close();
      resolve({ success: false, reason: "connection_error" });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";

    req.on("response", (headers) => {
      status = (headers[":status"] as number) ?? 0;
    });

    req.on("data", (chunk: Buffer) => {
      responseBody += chunk.toString();
    });

    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve({ success: true });
      } else {
        let reason = "unknown";
        try {
          const parsed = JSON.parse(responseBody);
          reason = parsed.reason ?? reason;
        } catch {
          // ignore parse error
        }
        resolve({ success: false, reason });
      }
    });

    req.end(apnsPayload);
  });
}
