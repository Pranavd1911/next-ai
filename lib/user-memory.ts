export function mergeRememberedMemory(...entries: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const entry of entries) {
    if (typeof entry !== "string") continue;

    for (const rawLine of entry.split("\n")) {
      const normalized = rawLine.trim().replace(/\s+/g, " ");
      if (!normalized || seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      lines.push(normalized);
    }
  }

  return lines.join("\n").slice(0, 2000);
}
