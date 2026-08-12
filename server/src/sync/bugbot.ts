import type { BugbotRisk } from "@isaac/shared";

// Bugbot writes its summary into the MR description, fenced by these markers.
// Only the fenced block is searched, so an author writing "high risk" in their
// own summary can't be mistaken for a score.
const SUMMARY_BLOCK = /<!--\s*CURSOR_SUMMARY\s*-->([\s\S]*?)<!--\s*\/CURSOR_SUMMARY\s*-->/;
const RISK_LINE = /\*\*(Low|Medium|High|Critical)\s+Risk\*\*/i;

/** Cursor Bugbot's risk label, or null when it left no summary on the MR. */
export function parseBugbotRisk(
  description: string | null | undefined
): BugbotRisk | null {
  const block = description?.match(SUMMARY_BLOCK)?.[1];
  const risk = block?.match(RISK_LINE)?.[1];
  return risk ? (risk.toLowerCase() as BugbotRisk) : null;
}
