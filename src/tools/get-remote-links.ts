import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { jsonResult, trimJira, withToolErrorHandling } from "./common.js";

export const getRemoteLinksInputShape = {
  issueKey: z.string().min(1).describe("Jira issue key, e.g. PROJ-123."),
};

const GetRemoteLinksInput = z.object(getRemoteLinksInputShape);

interface RemoteLink {
  id?: number;
  globalId?: string;
  application?: { type?: string; name?: string };
  relationship?: string;
  object?: {
    url?: string;
    title?: string;
    summary?: string;
    icon?: { url16x16?: string; title?: string };
    status?: { resolved?: boolean };
  };
}

export function makeGetRemoteLinksTool(client: JiraClient) {
  return async (raw: z.infer<typeof GetRemoteLinksInput>) =>
    withToolErrorHandling(async () => {
      const input = GetRemoteLinksInput.parse(raw);
      const links = await client.request<RemoteLink[]>(
        `/rest/api/2/issue/${encodeURIComponent(input.issueKey)}/remotelink`
      );
      return jsonResult({
        issueKey: input.issueKey,
        count: links.length,
        links: links.map((l) => trimJira(l)),
      });
    });
}
