import groupAliasData from "./group-name-aliases.json" with { type: "json" };

export const groupAliases: Record<string, string> = groupAliasData;
const groupAliasesByKey = new Map(
  Object.entries(groupAliases).map(([name, canonical]) => [groupNameKey(name), canonical]),
);

export function groupNameKey(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeGroupName(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const key = groupNameKey(trimmed);
  return groupAliasesByKey.get(key) ?? trimmed;
}
