import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import type { FieldsCache } from "../fields-cache.js";
import { jsonResult, trimJira, withToolErrorHandling } from "./common.js";

export const searchIssuesInputShape = {
  jql: z
    .string()
    .min(1)
    .describe(
      "JQL query, e.g. \"project = PROJ AND status = 'In Progress' ORDER BY updated DESC\". " +
        "Quote string values; use ORDER BY to control ordering."
    ),
  max: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .default(50)
    .describe("Maximum number of issues to return (default 50, max 1000)."),
  startAt: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Zero-based index of the first issue to return (for paging). Default 0."),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Optional subset of fields to return per issue (Jira `fields` query). Use field IDs or names. " +
        "Defaults to all navigable fields. Example: ['summary','status','assignee','customfield_10010']."
    ),
  expand: z
    .array(z.string())
    .optional()
    .describe(
      "Optional Jira `expand` parameters applied to each issue, e.g. ['renderedFields','names']."
    ),
  resolveCustomFieldNames: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "If true (default), customfield_xxxxx ids in each issue are also surfaced under their human-readable names in `customFieldsByName`."
    ),
};

const SearchIssuesInput = z.object(searchIssuesInputShape);

interface JiraIssue {
  id: string;
  key: string;
  fields?: Record<string, unknown>;
}

interface SearchResponse {
  startAt?: number;
  maxResults?: number;
  total?: number;
  issues?: JiraIssue[];
}

const PAGE_SIZE = 100;

export function makeSearchIssuesTool(
  client: JiraClient,
  fieldsCache: FieldsCache
) {
  return async (raw: z.infer<typeof SearchIssuesInput>) =>
    withToolErrorHandling(async () => {
      const input = SearchIssuesInput.parse(raw);
      const max = input.max ?? 50;
      const baseStartAt = input.startAt ?? 0;

      const issues: JiraIssue[] = [];
      let total: number | undefined;
      let startAt = baseStartAt;

      while (issues.length < max) {
        const remaining = max - issues.length;
        const pageSize = Math.min(PAGE_SIZE, remaining);
        const page = await client.request<SearchResponse>("/rest/api/2/search", {
          query: {
            jql: input.jql,
            startAt,
            maxResults: pageSize,
            fields: input.fields,
            expand: input.expand,
          },
        });

        const pageIssues = page.issues ?? [];
        issues.push(...pageIssues);
        total = typeof page.total === "number" ? page.total : total;

        if (pageIssues.length < pageSize) break;
        if (total !== undefined && startAt + pageIssues.length >= total) break;
        startAt += pageIssues.length;
      }

      let idToName: Record<string, string> | undefined;
      if (input.resolveCustomFieldNames !== false) {
        idToName = await fieldsCache.idToNameMap();
      }

      const trimmed = issues.map((issue) => {
        const trimmedIssue = trimJira(issue) as JiraIssue;
        if (idToName && trimmedIssue.fields) {
          const named: Record<string, unknown> = {};
          for (const [id, value] of Object.entries(trimmedIssue.fields)) {
            if (id.startsWith("customfield_") && idToName[id]) {
              named[idToName[id]] = value;
            }
          }
          if (Object.keys(named).length > 0) {
            (trimmedIssue as JiraIssue & { customFieldsByName?: unknown }).customFieldsByName =
              named;
          }
        }
        return trimmedIssue;
      });

      return jsonResult({
        jql: input.jql,
        startAt: baseStartAt,
        count: trimmed.length,
        total: total ?? trimmed.length,
        issues: trimmed,
      });
    });
}
