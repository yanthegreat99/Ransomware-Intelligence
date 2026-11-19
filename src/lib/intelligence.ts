export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(incorporated|inc|corporation|corp|llc|ltd|limited|plc|gmbh|ag|sa|sarl|pte|pty|bv|nv|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeDomain(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^\*\./, "");
}

export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
    }
  }
  return matrix[b.length][a.length];
}

export function similarityScore(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  const distance = levenshtein(left, right);
  return Math.max(0, Math.round((1 - distance / Math.max(left.length, right.length)) * 100));
}

export function hasDistinctOrganisationRoots(a: string, b: string): boolean {
  const left = normalizeName(a).split(" ");
  const right = normalizeName(b).split(" ");
  if (!left.length || !right.length) return false;
  const ignored = new Set(["group", "holdings", "services", "international", "trading", "company", "corporation"]);
  const leftRoot = left.find((token) => !ignored.has(token));
  const rightRoot = right.find((token) => !ignored.has(token));
  return Boolean(leftRoot && rightRoot && leftRoot !== rightRoot);
}

export function safeDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
