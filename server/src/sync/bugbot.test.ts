import { describe, expect, test } from "bun:test";
import { parseBugbotRisk } from "./bugbot";

const summary = (body: string) =>
  `## Summary\n\nSomething.\n\n<!-- CURSOR_SUMMARY -->\n---\n\n> [!NOTE]\n${body}\n<!-- /CURSOR_SUMMARY -->`;

describe("parseBugbotRisk", () => {
  test("reads the risk label out of the summary block", () => {
    expect(
      parseBugbotRisk(
        summary("> **Medium Risk**\n> Mutates discount campaign state.")
      )
    ).toBe("medium");
    expect(parseBugbotRisk(summary("> **Low Risk**\n> Copy change."))).toBe(
      "low"
    );
    expect(parseBugbotRisk(summary("> **High Risk**\n> Touches billing."))).toBe(
      "high"
    );
  });

  test("returns null when Bugbot left no summary", () => {
    expect(parseBugbotRisk("## Summary\n\nJust a description.")).toBeNull();
    expect(parseBugbotRisk(null)).toBeNull();
    expect(parseBugbotRisk("")).toBeNull();
  });

  test("ignores risk wording outside the summary block", () => {
    expect(
      parseBugbotRisk("This is a **High Risk** change, review carefully.")
    ).toBeNull();
  });

  test("ignores an unterminated summary block", () => {
    expect(
      parseBugbotRisk("<!-- CURSOR_SUMMARY -->\n> **High Risk**")
    ).toBeNull();
  });
});
