type PreviousDisclosure = {
  sourceName: string;
  sourceIdentifier: string | null;
  sourceUrl: string | null;
  normalizedData: unknown;
  publishedAt: Date | null;
  updatedAtSource: Date | null;
  targetedDomain: string | null;
  canonicalVictimId: string | null;
  ransomwareGroupId: string | null;
};

type DisclosureHistory = {
  kind: "source-disclosure-history";
  sourcePayload: unknown;
  revisions: Array<Record<string, unknown>>;
};

export function appendSourceDisclosureHistory(
  rawData: unknown,
  previous: PreviousDisclosure,
  capturedAt = new Date(),
): { __ingestionHistory: DisclosureHistory } {
  const rawObject = typeof rawData === "object" && rawData !== null && !Array.isArray(rawData)
    ? rawData as Record<string, unknown>
    : null;
  const history = rawObject?.__ingestionHistory;
  const isHistory = typeof history === "object" && history !== null &&
    !Array.isArray(history) &&
    (history as Record<string, unknown>).kind === "source-disclosure-history";
  const priorHistory = isHistory ? history as DisclosureHistory : undefined;
  const previousRevision = {
    sourceName: previous.sourceName,
    sourceIdentifier: previous.sourceIdentifier,
    sourceUrl: previous.sourceUrl,
    normalizedData: previous.normalizedData,
    publishedAt: previous.publishedAt?.toISOString() ?? null,
    updatedAtSource: previous.updatedAtSource?.toISOString() ?? null,
    targetedDomain: previous.targetedDomain,
    canonicalVictimId: previous.canonicalVictimId,
    ransomwareGroupId: previous.ransomwareGroupId,
    capturedAt: capturedAt.toISOString(),
  };
  const revisions = priorHistory && Array.isArray(priorHistory.revisions)
    ? priorHistory.revisions
    : [];
  const sourcePayload = priorHistory && Object.prototype.hasOwnProperty.call(priorHistory, "sourcePayload")
    ? priorHistory.sourcePayload
    : rawData;

  return {
    __ingestionHistory: {
      kind: "source-disclosure-history",
      sourcePayload,
      revisions: [...revisions, previousRevision],
    },
  };
}
