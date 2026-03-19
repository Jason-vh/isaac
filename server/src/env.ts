// Core vars required for the server to boot
const core = [
  "DATABASE_URL",
  "JWT_SECRET",
  "WEBAUTHN_RP_ID",
  "WEBAUTHN_ORIGIN",
] as const;

// Sync-source vars — only required when running sync jobs
const sync = [
  "JIRA_BASE_URL",
  "JIRA_API_TOKEN",
  "JIRA_EMAIL",
  "GITLAB_BASE_URL",
  "GITLAB_API_TOKEN",
  "GITLAB_PROJECT_ID",
  "CONFLUENCE_BASE_URL",
  "CONFLUENCE_API_TOKEN",
  "CONFLUENCE_EMAIL",
  "CALENDAR_SCRIPT_URL",
  "CALENDAR_SCRIPT_SECRET",
] as const;

// Slack vars — only needed by the web server for webhook handling
const slack = ["SLACK_SIGNING_SECRET", "SLACK_BOT_TOKEN"] as const;

// Notify vars — only needed by the isaac-notify service
const notify = [
  "FASTMAIL_TOKEN",
  "FASTMAIL_FILTER_TO",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "GITLAB_BASE_URL",
  "GITLAB_API_TOKEN",
  "GITLAB_PROJECT_ID",
  "JIRA_BASE_URL",
] as const;

const all = [...core, ...sync, ...slack, ...notify] as const;

type EnvKey = (typeof all)[number];
type Env = Record<EnvKey, string>;

function validate(keys: readonly string[]): void {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join("\n  ")}`
    );
  }
}

/** Call at server boot to ensure all core vars are set. */
export function validateCoreEnv(): void {
  validate(core);
}

// Proxy that reads from process.env, so sync vars are available
// when set but don't need to be present at boot time.
export const env = new Proxy({} as Env, {
  get(_, key: string) {
    return process.env[key] ?? "";
  },
});

/** Call before running sync jobs to ensure all sync vars are set. */
export function validateSyncEnv(): void {
  validate(sync);
}

/** Call before running the notify service to ensure all notify vars are set. */
export function validateNotifyEnv(): void {
  validate(notify);
}
