#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { JiraClient } from "./jira-client.js";
import { FieldsCache } from "./fields-cache.js";

import { getIssueInputShape, makeGetIssueTool } from "./tools/get-issue.js";
import { listFieldsInputShape, makeListFieldsTool } from "./tools/list-fields.js";
import { getWorklogsInputShape, makeGetWorklogsTool } from "./tools/get-worklogs.js";
import { getChangelogInputShape, makeGetChangelogTool } from "./tools/get-changelog.js";
import { getAttachmentsInputShape, makeGetAttachmentsTool } from "./tools/get-attachments.js";
import {
  getWatchersAndVotesInputShape,
  makeGetWatchersAndVotesTool,
} from "./tools/get-watchers-and-votes.js";
import {
  getRemoteLinksInputShape,
  makeGetRemoteLinksTool,
} from "./tools/get-remote-links.js";
import { getDevInfoInputShape, makeGetDevInfoTool } from "./tools/get-dev-info.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new JiraClient(config);
  const fieldsCache = new FieldsCache(client);

  const server = new McpServer(
    {
      name: "jira-mcp-local",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
      instructions:
        "Read-only access to Jira Server/Data Center via a Personal Access Token. " +
        "Use `list_fields` to discover custom field ids before requesting them via `get_issue.fields`.",
    }
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get Jira issue",
      description:
        "Returns a single Jira issue with all fields (system + custom), subtasks, issue links, and parent/epic hierarchy. " +
        "Custom field ids are also surfaced under human-readable names by default.",
      inputSchema: getIssueInputShape,
    },
    makeGetIssueTool(client, fieldsCache) as never
  );

  server.registerTool(
    "list_fields",
    {
      title: "List Jira fields",
      description:
        "Lists all Jira fields (system + custom) with id, name and type. " +
        "Useful for discovering custom field ids like 'Story Points' or 'Epic Link'.",
      inputSchema: listFieldsInputShape,
    },
    makeListFieldsTool(fieldsCache) as never
  );

  server.registerTool(
    "get_worklogs",
    {
      title: "Get Jira worklogs",
      description:
        "Returns all worklog entries for an issue (author, started, time spent, comment) and the total seconds logged.",
      inputSchema: getWorklogsInputShape,
    },
    makeGetWorklogsTool(client) as never
  );

  server.registerTool(
    "get_changelog",
    {
      title: "Get Jira issue changelog",
      description:
        "Returns the change history for an issue (status transitions, field updates) with timestamps. Supports filtering by field name.",
      inputSchema: getChangelogInputShape,
    },
    makeGetChangelogTool(client) as never
  );

  server.registerTool(
    "get_attachments",
    {
      title: "Get Jira issue attachments",
      description:
        "Returns metadata for all attachments on an issue (filename, size, mime type, author, created, content URL). Does not download binary content.",
      inputSchema: getAttachmentsInputShape,
    },
    makeGetAttachmentsTool(client) as never
  );

  server.registerTool(
    "get_watchers_and_votes",
    {
      title: "Get Jira watchers and votes",
      description: "Returns the watcher list and vote summary for an issue.",
      inputSchema: getWatchersAndVotesInputShape,
    },
    makeGetWatchersAndVotesTool(client) as never
  );

  server.registerTool(
    "get_remote_links",
    {
      title: "Get Jira remote links",
      description:
        "Returns remote links attached to an issue (e.g. Confluence pages, external URLs).",
      inputSchema: getRemoteLinksInputShape,
    },
    makeGetRemoteLinksTool(client) as never
  );

  server.registerTool(
    "get_dev_info",
    {
      title: "Get Jira dev panel info",
      description:
        "Returns development panel data for an issue: linked commits, branches, and pull requests. " +
        "Requires a dev tool integration (GitHub/Bitbucket/GitLab) to be configured in Jira; degrades gracefully if unavailable.",
      inputSchema: getDevInfoInputShape,
    },
    makeGetDevInfoTool(client) as never
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("jira-mcp-local started (stdio)\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`jira-mcp-local failed to start: ${msg}\n`);
  process.exit(1);
});
