import { parsedEventSchema } from "@homecal/shared";

export interface LlmConfig {
  gatewayUrl: string;
  model: string;
}

export function buildParsePrompt(today: string, memberNames: string[]): string {
  const dayOfWeek = new Date(today).toLocaleDateString("en-US", { weekday: "long" });
  const membersLine = memberNames.length > 0 ? `\nFamily members: ${memberNames.join(", ")}.` : "";
  return `You are a calendar event parser. Today is ${dayOfWeek}, ${today}.${membersLine}

Parse the user's natural language input into a calendar event. Return ONLY a JSON object with these fields:
- "title": string — the event title
- "location": string — where the event takes place (empty string if not mentioned)
- "description": string — additional details or notes (empty string if not mentioned)
- "start": string — ISO 8601 datetime (e.g. "2026-03-10T14:00:00Z")
- "end": string — ISO 8601 datetime
- "assignees": string[] — names of family members this event is for (empty array if none mentioned)

Rules:
- If no time is specified, default to 9:00 AM (09:00:00Z).
- If no end time or duration is specified, default to 1 hour after start.
- Resolve relative days like "next Tuesday", "tomorrow", "this Friday" relative to today.
- For assignees, only include names that match family members listed above. If the input mentions "everyone" or "family", include all members.
- If no person is mentioned, return an empty assignees array.
- Extract location from phrases like "at ...", "in ...", "@..." etc. If no location mentioned, use empty string.
- Extract any extra details into description. If none, use empty string.
- Return ONLY the JSON object, no explanation or markdown.`;
}

function normalizeDatetime(val: string): string {
  // No timezone info → append Z (with or without seconds)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(val)) {
    return `${val}${val.length === 16 ? ":00Z" : "Z"}`;
  }
  // Timezone offset (+HH:MM / -HH:MM) → convert to UTC
  if (/[+-]\d{2}:\d{2}$/.test(val)) {
    return new Date(val).toISOString();
  }
  return val;
}

function resolveAssigneeIds(
  assigneeNames: string[],
  memberNameToId?: Map<string, string>,
): string[] {
  if (!memberNameToId || assigneeNames.length === 0) return [];
  const lowerMap = new Map(
    [...memberNameToId.entries()].map(([name, id]) => [name.toLowerCase(), id]),
  );
  const ids: string[] = [];
  for (const name of assigneeNames) {
    const id = lowerMap.get(name.toLowerCase());
    if (id) ids.push(id);
  }
  return ids;
}

export function parseLlmResponse(
  raw: string,
  memberNameToId?: Map<string, string>,
): {
  title: string;
  location: string;
  description: string;
  start: string;
  end: string;
  assigneeIds: string[];
} {
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

  // Normalize datetimes: handle missing Z suffix and timezone offsets
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["start", "end"]) {
      if (typeof obj[key] === "string") {
        obj[key] = normalizeDatetime(obj[key]);
      }
    }
  }

  const result = parsedEventSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid event data: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }

  let { start, end } = result.data;

  // Ensure end is after start — if not, default to start + 1 hour
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  }

  const assigneeIds = resolveAssigneeIds(result.data.assignees, memberNameToId);

  return {
    title: result.data.title,
    location: result.data.location,
    description: result.data.description,
    start,
    end,
    assigneeIds,
  };
}

export function buildImageParsePrompt(today: string, memberNames: string[]): string {
  const dayOfWeek = new Date(today).toLocaleDateString("en-US", { weekday: "long" });
  const membersLine = memberNames.length > 0 ? `\nFamily members: ${memberNames.join(", ")}.` : "";
  return `You are a calendar event parser. Today is ${dayOfWeek}, ${today}.${membersLine}

Parse the image into a calendar event. The image may be a photo of a handwritten note, a screenshot, a flyer, or any visual containing event information. Return ONLY a JSON object with these fields:
- "title": string — the event title
- "location": string — where the event takes place (empty string if not mentioned)
- "description": string — additional details or notes (empty string if not mentioned)
- "start": string — ISO 8601 datetime (e.g. "2026-03-10T14:00:00Z")
- "end": string — ISO 8601 datetime
- "assignees": string[] — names of family members this event is for (empty array if none mentioned)

Rules:
- If no time is specified, default to 9:00 AM (09:00:00Z).
- If no end time or duration is specified, default to 1 hour after start.
- Resolve relative days like "next Tuesday", "tomorrow", "this Friday" relative to today.
- For assignees, only include names that match family members listed above. If the input mentions "everyone" or "family", include all members.
- If no person is mentioned, return an empty assignees array.
- Extract location from the image if visible.
- Extract any extra details into description. If none, use empty string.
- Return ONLY the JSON object, no explanation or markdown.`;
}

export async function callLlmWithImage(
  config: LlmConfig,
  systemPrompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const response = await fetch(`${config.gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Parse this image into a calendar event." },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
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
