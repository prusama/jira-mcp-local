# jira-mcp-local

Read-only MCP server for **Jira Server / Data Center** that authenticates with a
Personal Access Token (PAT) and exposes focused tools covering all the core
issue data: full system + custom fields, issue links, subtasks, parent/epic
hierarchy, worklogs, changelog, attachments, watchers/votes, remote links, and
the dev panel (commits, branches, PRs).

> Targets the on-prem Jira REST API v2 (`/rest/api/2/...`). For Jira Cloud
> (`*.atlassian.net`) use a different auth scheme — see notes at the bottom.

## Requirements

- Node.js **18 or newer** (uses native `fetch`, the MCP SDK requires Node >= 18).
- A Jira Server/DC Personal Access Token with read access to the projects you
  want to inspect.

## Install & build

```bash
npm install
npm run build
```

This produces a runnable script at `dist/index.js`.

## Configuration

The server is configured via environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `JIRA_BASE_URL` | yes | Base URL of your Jira instance, e.g. `https://jira.your-company.com`. No trailing slash needed. |
| `JIRA_PAT` | yes | Your Jira Personal Access Token. Sent as `Authorization: Bearer <PAT>`. |

A template lives in [.env.example](.env.example).

## Running

Directly:

```bash
JIRA_BASE_URL=https://jira.example.com JIRA_PAT=xxxxx node dist/index.js
```

The server speaks MCP over stdio.

### Cursor / Claude Desktop config

Add an entry to your MCP client config (Cursor `~/.cursor/mcp.json` or Claude
Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jira-local": {
      "command": "node",
      "args": ["C:/Users/you/Documents/jira-mcp-local/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://jira.your-company.com",
        "JIRA_PAT": "your_personal_access_token"
      }
    }
  }
}
```

## Tools

All tools are read-only.

| Tool | What it does |
| --- | --- |
| `get_issue` | Full issue: system fields, custom fields (with human names), subtasks, issue links, parent/epic. Supports `fields` and `expand`. |
| `list_fields` | All Jira fields (system + custom) with id, name, type. Use to discover custom field ids (Story Points, Epic Link, Sprint, ...). Result is cached in-process; pass `refresh: true` to bypass. |
| `get_worklogs` | All worklog entries (author, started, time spent, comment) plus total time logged. |
| `get_changelog` | Full change history of an issue (status transitions, field updates). Supports `fieldFilter` to narrow to e.g. status only. |
| `get_attachments` | Metadata for every attachment (filename, size, mime type, author, content URL). Does not download binary content. |
| `get_watchers_and_votes` | Watcher list + vote summary for an issue. |
| `get_remote_links` | Linked Confluence pages and external URLs attached to an issue. |
| `get_dev_info` | Dev panel data — linked commits, branches, pull requests — via the `/rest/dev-status/1.0/issue/detail` endpoint. Requires a configured dev-tool integration (GitHub / Bitbucket / GitLab); degrades gracefully if unavailable. |

### A few usage notes

- **Custom fields**: `get_issue` returns Jira's raw `customfield_xxxxx` ids
  *and*, by default, mirrors known custom fields under their human-readable
  names in `customFieldsByName`. Disable with `resolveCustomFieldNames: false`.
- **Trimming**: responses strip noisy fields (`avatarUrls`, `iconUrl`, `self`,
  `expand`) and drop nulls/empty objects to keep them token-friendly.
- **Pagination**: tools that return collections (worklogs, changelog) paginate
  through Jira automatically up to a configurable `max`.
- **Errors**: any non-2xx response from Jira is returned as an MCP tool error
  (`isError: true`) with a readable message, including hints for 401/403/404/429.

## Project layout

```
src/
  index.ts            # stdio MCP server entry point
  config.ts           # env var loading
  jira-client.ts      # PAT-authenticated HTTP client + pagination helper
  fields-cache.ts     # caches /rest/api/2/field for name resolution
  tools/
    common.ts                  # shared result/error helpers, response trimming
    get-issue.ts
    list-fields.ts
    get-worklogs.ts
    get-changelog.ts
    get-attachments.ts
    get-watchers-and-votes.ts
    get-remote-links.ts
    get-dev-info.ts
```

## Notes about Jira Cloud

This server is built for Jira **Server / Data Center**. Jira Cloud uses
different auth (Basic with email + API token, not Bearer), API v3 paths, and
ADF-formatted descriptions/comments. To support Cloud you would need to swap
the auth header in [src/jira-client.ts](src/jira-client.ts) and convert ADF →
text in issue/comment responses.
