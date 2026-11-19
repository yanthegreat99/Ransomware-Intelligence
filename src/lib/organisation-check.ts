import { lookup } from "node:dns/promises";
import { normalizeDomain } from "./intelligence";

export type OrganisationCheck = {
  domain?: string;
  dnsActive: boolean;
  websiteActive: boolean;
  checkedAt: Date;
  evidence: Array<{
    sourceUrl?: string;
    sourceName: string;
    evidenceType: string;
    evidence: string;
    supports: boolean;
  }>;
};

export async function checkOrganisation(domainOrUrl?: string | null): Promise<OrganisationCheck> {
  const domain = normalizeDomain(domainOrUrl);
  const checkedAt = new Date();
  if (!domain) {
    return { dnsActive: false, websiteActive: false, checkedAt, evidence: [{
      sourceName: "Automated organisation check",
      evidenceType: "organisation",
      evidence: "No organisation domain was available for verification.",
      supports: false,
    }] };
  }

  let dnsActive = false;
  try {
    await lookup(domain);
    dnsActive = true;
  } catch {}

  let websiteActive = false;
  try {
    const response = await fetch(`https://${domain}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Ransomware-Intelligence-Analyst/1.0" },
    });
    websiteActive = response.status >= 200 && response.status < 400;
  } catch {}

  return {
    domain,
    dnsActive,
    websiteActive,
    checkedAt,
    evidence: [
      {
        sourceUrl: `https://${domain}`,
        sourceName: "Official domain check",
        evidenceType: "organisation",
        evidence: dnsActive
          ? `DNS resolution succeeded; HTTPS availability: ${websiteActive ? "active" : "not reachable"}`
          : "DNS resolution failed.",
        supports: dnsActive,
      },
    ],
  };
}
