import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import type { FieldsCache } from "../fields-cache.js";
import { jsonResult, trimJira, withToolErrorHandling } from "./common.js";

export const getIssueInputShape = {
  issueKey: z
    .string()
    .min(1)
    .describe("Jira issue key, e.g. PROJ-123 (or a numeric issue id)."),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Optional subset of fields to return (Jira `fields` query). Use field IDs or names. Defaults to all navigable fields. Example: ['summary','status','assignee','customfield_10010']."
    ),
  expand: z
    .array(z.string())
    .optional()
    .describe(
      "Optional Jira `expand` parameters, e.g. ['renderedFields','names','schema','transitions']."
    ),
  resolveCustomFieldNames: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "If true (default), customfield_xxxxx ids in the response are also surfaced under their human-readable names."
    ),
};

const GetIssueInput = z.object(getIssueInputShape);

interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown>;
}

export function makeGetIssueTool(client: JiraClient, fieldsCache: FieldsCache) {
  return async (raw: z.infer<typeof GetIssueInput>) =>
    withToolErrorHandling(async () => {
      const input = GetIssueInput.parse(raw);
      const issue = await client.request<JiraIssue>(
        `/rest/api/2/issue/${encodeURIComponent(input.issueKey)}`,
        {
          query: {
            fields: input.fields,
            expand: input.expand,
          },
        }
      );

      const trimmed = trimJira(issue) as JiraIssue;

      if (input.resolveCustomFieldNames !== false && trimmed.fields) {
        const idToName = await fieldsCache.idToNameMap();
        const named: Record<string, unknown> = {};
        for (const [id, value] of Object.entries(trimmed.fields)) {
          if (id.startsWith("customfield_") && idToName[id]) {
            named[idToName[id]] = value;
          }
        }
        if (Object.keys(named).length > 0) {
          (trimmed as JiraIssue & { customFieldsByName?: unknown }).customFieldsByName =
            named;
        }
      }

      return jsonResult(trimmed);
    });
}
