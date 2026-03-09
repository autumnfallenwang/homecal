import { parsedEventSchema } from "@homecal/shared";

export interface LlmConfig {
  gatewayUrl: string;
  model: string;
}

export function buildParsePrompt(today: string): string {
  const dayOfWeek = new Date(today).toLocaleDateString("en-US", { weekday: "long" });
  return `You are a calendar event parser. Today is ${dayOfWeek}, ${today}.

Parse the user's natural language input into a calendar event. Return ONLY a JSON object with these fields:
- "title": string — the event title
- "start": string — ISO 8601 datetime (e.g. "2026-03-10T14:00:00Z")
- "end": string — ISO 8601 datetime

Rules:
- If no time is specified, default to 9:00 AM (09:00:00Z).
- If no end time or duration is specified, default to 1 hour after start.
- Resolve relative days like "next Tuesday", "tomorrow", "this Friday" relative to today.
- Return ONLY the JSON object, no explanation or markdown.`;
}

export function parseLlmResponse(raw: string): { title: string; start: string; end: string } {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (cause) {
    throw new Error("Invalid JSON in LLM response", { cause });
  }

  const result = parsedEventSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid event data: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }

  return result.data;
}

export async function callLlm(
  config: LlmConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const response = await fetch(`${config.gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 256,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM gateway error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0].message.content;
}
