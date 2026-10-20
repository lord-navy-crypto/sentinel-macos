import { describe, expect, it } from "vitest";
import { normalisePresetCode, safePresetUrl } from "./presets";

describe("offline link preset validation", () => {
  it("accepts a reusable short code", () => {
    expect(normalisePresetCode(" Physics_1 ")).toBe("physics_1");
  });
  it("rejects malicious URL schemes and whitespace codes", () => {
    expect(() => safePresetUrl("javascript:alert(1)")).toThrow(/Only/);
    expect(() => safePresetUrl("file:///etc/passwd")).toThrow(/Only/);
    expect(() => normalisePresetCode("bad code")).toThrow(/1–40/);
  });
  it("accepts HTTPS and HTTP links", () => {
    expect(safePresetUrl("https://example.com/study")).toBe("https://example.com/study");
    expect(safePresetUrl("http://localhost:1420").startsWith("http://localhost")).toBe(true);
  });
});
