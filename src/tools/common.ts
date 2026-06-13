export interface ToolJsonResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function jsonResult(value: unknown): ToolJsonResult {
  return {
    content: [
      { type: "text", text: JSON.stringify(value, null, 2) },
    ],
  };
}

export function errorResult(message: string): ToolJsonResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Wraps an async tool body so any thrown error is converted into an
 * MCP tool error result with a readable message instead of crashing
 * the server.
 */
export async function withToolErrorHandling<T extends ToolJsonResult>(
  fn: () => Promise<T>
): Promise<ToolJsonResult> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg);
  }
}

/** Recursively strips noisy fields (avatars, icon URLs, empty values) from Jira responses. */
export function trimJira<T>(value: T): T {
  return trim(value) as T;
}

const NOISY_KEYS = new Set([
  "avatarUrls",
  "iconUrl",
  "self",
  "expand",
]);

function trim(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(trim).filter((v) => v !== undefined);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (NOISY_KEYS.has(k)) continue;
      const trimmed = trim(v);
      if (trimmed === undefined || trimmed === null) continue;
      if (Array.isArray(trimmed) && trimmed.length === 0) continue;
      if (
        typeof trimmed === "object" &&
        !Array.isArray(trimmed) &&
        Object.keys(trimmed as object).length === 0
      ) {
        continue;
      }
      out[k] = trimmed;
    }
    return out;
  }
  return value;
}
