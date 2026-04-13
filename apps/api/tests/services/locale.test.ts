import { acceptLanguageToCountry, localeToCountry } from "@homecal/shared";
import { describe, expect, it } from "vitest";

describe("localeToCountry", () => {
  it("returns the uppercased region for simple locales", () => {
    expect(localeToCountry("en-US")).toBe("US");
    expect(localeToCountry("zh-TW")).toBe("TW");
    expect(localeToCountry("fr-FR")).toBe("FR");
  });

  it("handles script subtags (zh-Hant-TW → TW)", () => {
    expect(localeToCountry("zh-Hant-TW")).toBe("TW");
    expect(localeToCountry("zh-Hans-CN")).toBe("CN");
  });

  it("accepts underscore separator", () => {
    expect(localeToCountry("en_US")).toBe("US");
  });

  it("normalizes lowercase region to uppercase", () => {
    expect(localeToCountry("en-us")).toBe("US");
  });

  it("returns null for language-only locales", () => {
    expect(localeToCountry("fr")).toBeNull();
    expect(localeToCountry("en")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(localeToCountry("")).toBeNull();
    expect(localeToCountry(null)).toBeNull();
    expect(localeToCountry(undefined)).toBeNull();
    expect(localeToCountry("   ")).toBeNull();
  });

  it("returns null for numeric (UN M.49) regions", () => {
    // We only support the alpha-2 form.
    expect(localeToCountry("es-419")).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(localeToCountry("garbage")).toBeNull();
    expect(localeToCountry("!!!")).toBeNull();
  });
});

describe("acceptLanguageToCountry", () => {
  it("picks the highest-q locale with a region", () => {
    expect(acceptLanguageToCountry("en-US,en;q=0.9,zh-TW;q=0.8")).toBe("US");
  });

  it("falls through when the top preference has no region", () => {
    expect(acceptLanguageToCountry("en;q=1.0,zh-TW;q=0.8")).toBe("TW");
  });

  it("returns null when no locale has a region", () => {
    expect(acceptLanguageToCountry("en,fr;q=0.5")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(acceptLanguageToCountry("")).toBeNull();
    expect(acceptLanguageToCountry(null)).toBeNull();
    expect(acceptLanguageToCountry(undefined)).toBeNull();
  });

  it("handles a single tag with no q", () => {
    expect(acceptLanguageToCountry("zh-Hant-TW")).toBe("TW");
  });

  it("tolerates extra whitespace and malformed q", () => {
    expect(acceptLanguageToCountry("  en-US ; q=not-a-number ")).toBe("US");
  });
});
