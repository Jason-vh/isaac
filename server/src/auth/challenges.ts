// In-memory challenge store with 5-minute TTL.
// Single process = in-memory is fine. Note: bun --hot clears this on reload.

const TTL_MS = 5 * 60 * 1000;

interface StoredChallenge {
  challenge: string;
  expiresAt: number;
}

const store = new Map<string, StoredChallenge>();

export function setChallenge(key: "reg" | "auth", challenge: string): void {
  store.set(key, { challenge, expiresAt: Date.now() + TTL_MS });
}

export function getChallenge(key: "reg" | "auth"): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  store.delete(key); // one-time use
  return entry.challenge;
}
