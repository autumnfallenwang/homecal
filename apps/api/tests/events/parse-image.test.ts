import { parseImageInputSchema } from "@homecal/shared";
import { describe, expect, it, vi } from "vitest";
import { buildImageParsePrompt, callLlmWithImage } from "../../src/services/llm.js";

describe("parseImageInputSchema", () => {
  it("accepts valid image input", () => {
    const result = parseImageInputSchema.safeParse({
      // biome-ignore lint/security/noSecrets: test base64 data
      image: "iVBORw0KGgoAAAANSUhEUg==",
      mimeType: "image/png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid mime types", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      const result = parseImageInputSchema.safeParse({ image: "abc123", mimeType });
      expect(result.success).toBe(true);
    }
  });

  it("rejects empty image", () => {
    const result = parseImageInputSchema.safeParse({ image: "", mimeType: "image/png" });
    expect(result.success).toBe(false);
  });

  it("rejects missing image", () => {
    const result = parseImageInputSchema.safeParse({ mimeType: "image/png" });
    expect(result.success).toBe(false);
  });

  it("rejects missing mimeType", () => {
    const result = parseImageInputSchema.safeParse({ image: "abc123" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid mime type", () => {
    const result = parseImageInputSchema.safeParse({ image: "abc123", mimeType: "text/plain" });
    expect(result.success).toBe(false);
  });
});

// biome-ignore lint/security/noSecrets: function name, not a secret
describe("buildImageParsePrompt", () => {
  it("includes the date", () => {
    const prompt = buildImageParsePrompt("2026-04-06", []);
    expect(prompt).toContain("2026-04-06");
  });

  it("includes day of week", () => {
    const prompt = buildImageParsePrompt("2026-04-06", []);
    expect(prompt).toContain("Sunday");
  });

  it("mentions image parsing", () => {
    const prompt = buildImageParsePrompt("2026-04-06", []);
    expect(prompt).toContain("image");
  });

  it("includes JSON fields", () => {
    const prompt = buildImageParsePrompt("2026-04-06", []);
    expect(prompt).toContain("title");
    expect(prompt).toContain("location");
    expect(prompt).toContain("description");
    expect(prompt).toContain("start");
    expect(prompt).toContain("end");
    expect(prompt).toContain("assignees");
  });

  it("includes family member names when provided", () => {
    const prompt = buildImageParsePrompt("2026-04-06", ["Dad", "Mom"]);
    expect(prompt).toContain("Dad, Mom");
    expect(prompt).toContain("Family members");
  });

  it("omits family members line when empty", () => {
    const prompt = buildImageParsePrompt("2026-04-06", []);
    expect(prompt).not.toContain("Family members");
  });
});

describe("callLlmWithImage", () => {
  it("sends correct message format with image content", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: '{"title":"Test","start":"2026-04-14T14:00:00Z","end":"2026-04-14T15:00:00Z"}',
          },
        },
      ],
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), { status: 200 }));

    const result = await callLlmWithImage(
      { gatewayUrl: "http://localhost:51277", model: "test-model" },
      "system prompt",
      "base64data",
      "image/png",
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:51277/v1/chat/completions");

    const body = JSON.parse(options?.body as string);
    expect(body.model).toBe("test-model");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "Parse this image into a calendar event." },
      { type: "image_url", image_url: { url: "data:image/png;base64,base64data" } },
    ]);

    expect(result).toContain("Test");

    fetchSpy.mockRestore();
  });

  it("throws on gateway error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("error", { status: 500 }));

    await expect(
      callLlmWithImage(
        { gatewayUrl: "http://localhost:51277", model: "test-model" },
        "system prompt",
        "base64data",
        "image/png",
      ),
    ).rejects.toThrow("LLM gateway error: 500");

    fetchSpy.mockRestore();
  });
});
