export type EnvVarEntry = {
  key: string;
  value: string;
};

const ENV_ASSIGNMENT_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export function mergeEnvEntries(
  existingContent: string,
  entries: EnvVarEntry[]
): {
  content: string;
  addedKeys: string[];
  updatedKeys: string[];
} {
  const nextEntries = new Map<string, string>();
  for (const entry of entries) {
    nextEntries.set(entry.key, entry.value);
  }

  const lines = existingContent === "" ? [] : existingContent.split(/\r?\n/);
  const mergedLines: string[] = [];
  const seenUpdatedKeys = new Set<string>();
  const updatedKeys: string[] = [];

  for (const line of lines) {
    const match = line.match(ENV_ASSIGNMENT_RE);
    const key = match?.[1];

    if (!key || !nextEntries.has(key)) {
      mergedLines.push(line);
      continue;
    }

    if (seenUpdatedKeys.has(key)) {
      continue;
    }

    mergedLines.push(`${key}=${nextEntries.get(key)}`);
    seenUpdatedKeys.add(key);
    updatedKeys.push(key);
  }

  const addedKeys: string[] = [];
  for (const [key, value] of nextEntries.entries()) {
    if (seenUpdatedKeys.has(key)) {
      continue;
    }

    mergedLines.push(`${key}=${value}`);
    addedKeys.push(key);
  }

  return {
    content: mergedLines.join("\n"),
    addedKeys,
    updatedKeys,
  };
}
