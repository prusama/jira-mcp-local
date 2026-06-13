import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { jsonResult, trimJira, withToolErrorHandling } from "./common.js";

export const getWorklogsInputShape = {
  issueKey: z.string().min(1).describe("Jira issue key, e.g. PROJ-123."),
  max: z
    .number()
    .int()
    .positive()
    .max(5000)
    .optional()
    .default(1000)
    .describe("Maximum number of worklog entries to return (default 1000)."),
};

const GetWorklogsInput = z.object(getWorklogsInputShape);

interface Worklog {
  id?: string;
  author?: { name?: string; displayName?: string; emailAddress?: string };
  updateAuthor?: { name?: string; displayName?: string };
  started?: string;
  created?: string;
  updated?: string;
  timeSpent?: string;
  timeSpentSeconds?: number;
  comment?: string;
}

export function makeGetWorklogsTool(client: JiraClient) {
  return async (raw: z.infer<typeof GetWorklogsInput>) =>
    withToolErrorHandling(async () => {
      const input = GetWorklogsInput.parse(raw);
      const items = await client.paginate<Worklog>(
        `/rest/api/2/issue/${encodeURIComponent(input.issueKey)}/worklog`,
        "worklogs",
        100,
        input.max ?? 1000
      );
      const trimmed = items.map((w) => trimJira(w));
      const totalSeconds = items.reduce(
        (sum, w) => sum + (w.timeSpentSeconds ?? 0),
        0
      );
      return jsonResult({
        issueKey: input.issueKey,
        count: trimmed.length,
        totalTimeSpentSeconds: totalSeconds,
        worklogs: trimmed,
      });
    });
}
