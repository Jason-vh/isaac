// Maps a repo file path to a productivity category.
// Only the Desk repo is in scope, whose top-level layout is
// frontend/, backend/, e2e/, chart/, tools/, docs/.

export const CODE_CATEGORIES = ["frontend", "backend", "other"] as const;

export type CodeCategory = (typeof CODE_CATEGORIES)[number];

/** Generated or vendored files — counted but excluded from line totals. */
const EXCLUDED_PATTERNS: RegExp[] = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lock|uv\.lock|poetry\.lock|Cargo\.lock)$/,
  /(^|\/)schema\.(json|graphql)$/,
  /(^|\/)graphqlTypes\.ts$/,
  /(^|\/)(dist|node_modules|__generated__|generated)\//,
  /\.snap$/,
  /\.min\.(js|css)$/,
];

export function categorisePath(path: string): CodeCategory {
  if (path.startsWith("frontend/")) return "frontend";
  if (path.startsWith("backend/")) return "backend";
  return "other";
}

export function isExcludedPath(path: string): boolean {
  return EXCLUDED_PATTERNS.some((re) => re.test(path));
}

export function classifyPath(path: string): {
  category: CodeCategory;
  excluded: boolean;
} {
  return { category: categorisePath(path), excluded: isExcludedPath(path) };
}
