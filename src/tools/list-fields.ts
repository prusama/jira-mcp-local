import { z } from "zod";
import type { FieldsCache, JiraField } from "../fields-cache.js";
import { jsonResult, withToolErrorHandling } from "./common.js";

export const listFieldsInputShape = {
  nameContains: z
    .string()
    .optional()
    .describe("Case-insensitive substring filter on field name."),
  customOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, returns only custom fields."),
  refresh: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, bypass the in-process cache and re-fetch from Jira."),
};

const ListFieldsInput = z.object(listFieldsInputShape);

export function makeListFieldsTool(fieldsCache: FieldsCache) {
  return async (raw: z.infer<typeof ListFieldsInput>) =>
    withToolErrorHandling(async () => {
      const input = ListFieldsInput.parse(raw);
      const all = await fieldsCache.getAll(input.refresh === true);
      const needle = input.nameContains?.toLowerCase();
      const filtered = all.filter((f: JiraField) => {
        if (input.customOnly && !f.custom) return false;
        if (needle && !f.name.toLowerCase().includes(needle)) return false;
        return true;
      });
      const compact = filtered.map((f) => ({
        id: f.id,
        name: f.name,
        custom: f.custom,
        type: f.schema?.type,
        items: f.schema?.items,
      }));
      return jsonResult({ count: compact.length, fields: compact });
    });
}
