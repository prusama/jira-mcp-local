import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { jsonResult, trimJira, withToolErrorHandling } from "./common.js";

export const getWatchersAndVotesInputShape = {
  issueKey: z.string().min(1).describe("Jira issue key, e.g. PROJ-123."),
};

const GetWatchersAndVotesInput = z.object(getWatchersAndVotesInputShape);

interface WatchersResponse {
  watchCount?: number;
  isWatching?: boolean;
  watchers?: Array<{ name?: string; displayName?: string; active?: boolean }>;
}

interface VotesResponse {
  votes?: number;
  hasVoted?: boolean;
  voters?: Array<{ name?: string; displayName?: string; active?: boolean }>;
}

export function makeGetWatchersAndVotesTool(client: JiraClient) {
  return async (raw: z.infer<typeof GetWatchersAndVotesInput>) =>
    withToolErrorHandling(async () => {
      const input = GetWatchersAndVotesInput.parse(raw);
      const key = encodeURIComponent(input.issueKey);
      const [watchers, votes] = await Promise.all([
        client.request<WatchersResponse>(`/rest/api/2/issue/${key}/watchers`),
        client.request<VotesResponse>(`/rest/api/2/issue/${key}/votes`),
      ]);
      return jsonResult({
        issueKey: input.issueKey,
        watchers: trimJira(watchers),
        votes: trimJira(votes),
      });
    });
}
