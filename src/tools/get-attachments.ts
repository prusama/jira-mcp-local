import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { jsonResult, withToolErrorHandling } from "./common.js";

export const getAttachmentsInputShape = {
  issueKey: z.string().min(1).describe("Jira issue key, e.g. PROJ-123."),
};

const GetAttachmentsInput = z.object(getAttachmentsInputShape);

interface Attachment {
  id?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  created?: string;
  author?: { name?: string; displayName?: string; emailAddress?: string };
  content?: string;
  thumbnail?: string;
}

interface IssueAttachments {
  key: string;
  fields: { attachment?: Attachment[] };
}

export function makeGetAttachmentsTool(client: JiraClient) {
  return async (raw: z.infer<typeof GetAttachmentsInput>) =>
    withToolErrorHandling(async () => {
      const input = GetAttachmentsInput.parse(raw);
      const issue = await client.request<IssueAttachments>(
        `/rest/api/2/issue/${encodeURIComponent(input.issueKey)}`,
        { query: { fields: "attachment" } }
      );
      const attachments = (issue.fields.attachment ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        created: a.created,
        author: a.author && {
          name: a.author.name,
          displayName: a.author.displayName,
          emailAddress: a.author.emailAddress,
        },
        contentUrl: a.content,
      }));
      return jsonResult({
        issueKey: issue.key,
        count: attachments.length,
        attachments,
      });
    });
}
