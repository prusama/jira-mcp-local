import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { jsonResult, trimJira, withToolErrorHandling } from "./common.js";

export const getChangelogInputShape = {
  issueKey: z.string().min(1).describe("Jira issue key, e.g. PROJ-123."),
  fieldFilter: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of field names to keep (e.g. ['status','assignee']). Case-insensitive. Other changes are dropped."
    ),
  max: z
    .number()
    .int()
    .positive()
    .max(5000)
    .optional()
    .default(500)
    .describe("Maximum number of history entries to return (default 500)."),
};

const GetChangelogInput = z.object(getChangelogInputShape);

interface ChangelogItem {
  field?: string;
  fieldtype?: string;
  fieldId?: string;
  from?: string | null;
  fromString?: string | null;
  to?: string | null;
  toString?: string | null;
}

interface ChangelogHistory {
  id?: string;
  author?: { name?: string; displayName?: string };
  created?: string;
  items?: ChangelogItem[];
}

interface IssueWithChangelog {
  key: string;
  changelog?: {
    histories?: ChangelogHistory[];
    total?: number;
    startAt?: number;
    maxResults?: number;
  };
}

export function makeGetChangelogTool(client: JiraClient) {
  return async (raw: z.infer<typeof GetChangelogInput>) =>
    withToolErrorHandling(async () => {
      const input = GetChangelogInput.parse(raw);
      const issue = await client.request<IssueWithChangelog>(
        `/rest/api/2/issue/${encodeURIComponent(input.issueKey)}`,
        {
          query: {
            expand: "changelog",
            fields: "summary",
          },
        }
      );

      const histories = issue.changelog?.histories ?? [];
      const lowerFilter = input.fieldFilter?.map((f) => f.toLowerCase());

      const mapped = histories
        .map((h) => {
          const items =
            lowerFilter && lowerFilter.length > 0
              ? (h.items ?? []).filter((i) =>
                  lowerFilter.includes((i.field ?? "").toLowerCase())
                )
              : h.items ?? [];
          if (items.length === 0) return null;
          return trimJira({
            id: h.id,
            author: h.author,
            created: h.created,
            items: items.map((i) => ({
              field: i.field,
              fieldtype: i.fieldtype,
              from: i.fromString ?? i.from,
              to: i.toString ?? i.to,
            })),
          });
        })
        .filter((h): h is NonNullable<typeof h> => h !== null)
        .slice(0, input.max ?? 500);

      return jsonResult({
        issueKey: issue.key,
        count: mapped.length,
        totalHistories: issue.changelog?.total ?? histories.length,
        histories: mapped,
      });
    });
}
