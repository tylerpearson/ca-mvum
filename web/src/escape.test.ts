import { describe, it, expect } from "vitest";
import { esc } from "./escape";

describe("esc", () => {
  it("escapes all five special characters", () => {
    expect(esc('&<>"\'')).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("passes a plain string through unchanged", () => {
    expect(esc("Forest Route 8N01")).toBe("Forest Route 8N01");
  });

  it("escapes ampersands first, so entities are not double-escaped", () => {
    expect(esc("<")).toBe("&lt;");
    expect(esc("<")).not.toBe("&amp;lt;");
  });
});
