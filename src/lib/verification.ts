import { getDb } from "./prisma";
import { checkOrganisation } from "./organisation-check";

export async function runAutomatedVerification(victimId: string) {
  const db = getDb();
  const victim = await db.orm.public.CanonicalVictim
    .include("disclosures")
    .include("evidence")
    .first({ id: victimId });
  if (!victim) return null;
  if (victim.lastCheckedAt && Date.now() - victim.lastCheckedAt.getTime() < 24 * 60 * 60 * 1000) {
    return victim;
  }

  const organisation = await checkOrganisation(victim.domain ?? victim.normalizedDomain);
  await db.orm.public.VerificationEvidence.createAll(
    organisation.evidence.map((item) => ({
      victimId,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      evidenceType: item.evidenceType,
      evidence: item.evidence,
      supports: item.supports,
      createdBy: "AUTOMATED_SYSTEM",
    })),
  );

  const sourceNames = new Set(
    victim.disclosures.map((disclosure) => disclosure.sourceName).filter(Boolean),
  );
  const crossSourceCount = sourceNames.size;
  let status = victim.verificationStatus;
  let incidentStatus = victim.incidentStatus;

  if (organisation.websiteActive && crossSourceCount >= 2) {
    status = "PARTIALLY_VERIFIED";
    incidentStatus = "UNVERIFIED_CLAIM";
  } else if (organisation.websiteActive) {
    status = "PARTIALLY_VERIFIED";
  } else if (victim.verificationStatus === "VERIFIED") {
    status = "UNDER_REVIEW";
  }

  return db.orm.public.CanonicalVictim.where({ id: victimId }).update({
    verificationStatus: status,
    legitimacyStatus: organisation.dnsActive || organisation.websiteActive
      ? "LEGITIMATE_ORGANISATION"
      : victim.legitimacyStatus,
    incidentStatus,
    confidenceScore: organisation.websiteActive ? Math.max(victim.confidenceScore, 25) : victim.confidenceScore,
    lastCheckedAt: organisation.checkedAt,
  });
}
