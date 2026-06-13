import type { JiraConfig } from "./config.js";

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | undefined>;
  method?: "GET";
}

export class JiraApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(message: string, status: number, url: string, body: string) {
    super(message);
    this.name = "JiraApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly pat: string;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl;
    this.pat = config.pat;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(this.baseUrl + normalized);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          if (value.length === 0) continue;
          url.searchParams.set(key, value.join(","));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async request<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.pat}`,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    if (!res.ok) {
      const message = this.describeError(res.status, url, text);
      throw new JiraApiError(message, res.status, url, text);
    }
    if (text.length === 0) {
      return undefined as unknown as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new JiraApiError(
        `Failed to parse JSON response from ${url}`,
        res.status,
        url,
        text
      );
    }
  }

  private describeError(status: number, url: string, body: string): string {
    const snippet = body.length > 500 ? `${body.slice(0, 500)}...` : body;
    switch (status) {
      case 401:
        return `Jira returned 401 Unauthorized for ${url}. Check that JIRA_PAT is valid and not expired.`;
      case 403:
        return `Jira returned 403 Forbidden for ${url}. The PAT user lacks permission. Body: ${snippet}`;
      case 404:
        return `Jira returned 404 Not Found for ${url}. The resource may not exist or be visible to this user. Body: ${snippet}`;
      case 429:
        return `Jira returned 429 Too Many Requests for ${url}. Slow down and retry. Body: ${snippet}`;
      default:
        return `Jira returned ${status} for ${url}. Body: ${snippet}`;
    }
  }

  /**
   * Walks a paginated `startAt`/`maxResults` endpoint and concatenates
   * results from a chosen array field (e.g. "values", "worklogs").
   * Stops once `max` items have been collected (default 1000).
   */
  async paginate<T>(
    path: string,
    arrayField: string,
    pageSize = 50,
    max = 1000,
    extraQuery: RequestOptions["query"] = {}
  ): Promise<T[]> {
    const out: T[] = [];
    let startAt = 0;
    while (out.length < max) {
      const remaining = max - out.length;
      const thisPage = Math.min(pageSize, remaining);
      const page = (await this.request<Record<string, unknown>>(path, {
        query: { ...extraQuery, startAt, maxResults: thisPage },
      })) as Record<string, unknown>;
      const items = (page[arrayField] as T[] | undefined) ?? [];
      out.push(...items);
      const total = typeof page.total === "number" ? (page.total as number) : undefined;
      if (items.length < thisPage) break;
      if (total !== undefined && out.length >= total) break;
      startAt += items.length;
    }
    return out;
  }
}
