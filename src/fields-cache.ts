import type { JiraClient } from "./jira-client.js";

export interface JiraField {
  id: string;
  key?: string;
  name: string;
  custom: boolean;
  schema?: {
    type?: string;
    items?: string;
    custom?: string;
    customId?: number;
    system?: string;
  };
}

export class FieldsCache {
  private cache: JiraField[] | null = null;
  private inflight: Promise<JiraField[]> | null = null;

  constructor(private readonly client: JiraClient) {}

  async getAll(forceRefresh = false): Promise<JiraField[]> {
    if (!forceRefresh && this.cache) return this.cache;
    if (!forceRefresh && this.inflight) return this.inflight;
    this.inflight = this.client
      .request<JiraField[]>("/rest/api/2/field")
      .then((fields) => {
        this.cache = fields;
        this.inflight = null;
        return fields;
      })
      .catch((err) => {
        this.inflight = null;
        throw err;
      });
    return this.inflight;
  }

  /** Map of customfield_xxxxx id -> human-readable name. */
  async idToNameMap(): Promise<Record<string, string>> {
    const fields = await this.getAll();
    const map: Record<string, string> = {};
    for (const f of fields) {
      map[f.id] = f.name;
    }
    return map;
  }
}
