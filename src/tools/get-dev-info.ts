import { z } from "zod";
import { JiraApiError, type JiraClient } from "../jira-client.js";
import { jsonResult, trimJira, withToolErrorHandling, errorResult } from "./common.js";

export const getDevInfoInputShape = {
  issueKey: z.string().min(1).describe("Jira issue key, e.g. PROJ-123."),
  applicationType: z
    .string()
    .optional()
    .default("GitHub")
    .describe(
      "Dev integration application type. Common values: 'GitHub', 'bitbucket', 'stash', 'gitlab'. Defaults to 'GitHub'."
    ),
  dataTypes: z
    .array(z.enum(["pullrequest", "branch", "repository"]))
    .optional()
    .default(["pullrequest", "branch", "repository"])
    .describe("Which dev data sections to fetch."),
};

const GetDevInfoInput = z.object(getDevInfoInputShape);

interface IssueIdLookup {
  id: string;
  key: string;
}

interface DevStatusResponse {
  errors?: string[];
  detail?: unknown;
}

export function makeGetDevInfoTool(client: JiraClient) {
  return async (raw: z.infer<typeof GetDevInfoInput>) =>
    withToolErrorHandling(async () => {
      const input = GetDevInfoInput.parse(raw);

      let numericId: string;
      try {
        const lookup = await client.request<IssueIdLookup>(
          `/rest/api/2/issue/${encodeURIComponent(input.issueKey)}`,
          { query: { fields: "summary" } }
        );
        numericId = lookup.id;
      } catch (err) {
        if (err instanceof JiraApiError) {
          return errorResult(
            `Could not resolve issue ${input.issueKey} to a numeric id: ${err.message}`
          );
        }
        throw err;
      }

      const results: Record<string, unknown> = {
        issueKey: input.issueKey,
        issueId: numericId,
        applicationType: input.applicationType ?? "GitHub",
      };
      const sectionErrors: Record<string, string> = {};

      for (const dataType of input.dataTypes ?? [
        "pullrequest",
        "branch",
        "repository",
      ]) {
        try {
          const resp = await client.request<DevStatusResponse>(
            "/rest/dev-status/1.0/issue/detail",
            {
              query: {
                issueId: numericId,
                applicationType: input.applicationType ?? "GitHub",
                dataType,
              },
            }
          );
          results[dataType] = trimJira(resp.detail ?? resp);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          sectionErrors[dataType] =
            "Dev panel data unavailable (endpoint may not be enabled, integration not configured, or PAT lacks permission). " +
            msg;
        }
      }

      if (Object.keys(sectionErrors).length > 0) {
        results.warnings = sectionErrors;
      }

      return jsonResult(results);
    });
}
