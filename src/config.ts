export interface JiraConfig {
  baseUrl: string;
  pat: string;
}

export function loadConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL?.trim();
  const pat = process.env.JIRA_PAT?.trim();

  const missing: string[] = [];
  if (!baseUrl) missing.push("JIRA_BASE_URL");
  if (!pat) missing.push("JIRA_PAT");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`
    );
  }

  return {
    baseUrl: baseUrl!.replace(/\/+$/, ""),
    pat: pat!,
  };
}
