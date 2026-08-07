import type { WbsoEntry } from "@isaac/shared";

/** What a manual ticket link on a WBSO entry actually writes to. */
export type WbsoLinkTarget =
  | { type: "meeting"; id: number }
  | { type: "mr"; id: number };

/** Null for entries backed by neither, e.g. an all-day leave block. */
export function linkTargetFor(entry: WbsoEntry): WbsoLinkTarget | null {
  if (entry.meetingId) return { type: "meeting", id: entry.meetingId };
  const mrId = entry.reasoning.mergeRequests?.[0]?.id;
  return mrId ? { type: "mr", id: mrId } : null;
}
