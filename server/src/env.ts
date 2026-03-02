const required = [
  "DATABASE_URL",
  "JWT_SECRET",
  "WEBAUTHN_RP_ID",
  "WEBAUTHN_ORIGIN",
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
  "SLACK_SIGNING_SECRET",
  "SLACK_BOT_TOKEN",
] as const;

type EnvKey = (typeof required)[number];
type Env = Record<EnvKey, string>;

function validateEnv(): Env {
  const missing: string[] = [];
  const env: Record<string, string> = {};

  for (const key of required) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else {
      env[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  ${missing.join("\n  ")}`
    );
  }

  return env as Env;
}

export const env = validateEnv();
