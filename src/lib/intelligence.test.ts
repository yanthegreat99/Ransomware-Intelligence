import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeName, normalizeDomain, similarityScore, hasDistinctOrganisationRoots } from "./intelligence.ts";
import {
  createRansomwareLiveUrl,
  parseRansomfeedPayload,
  parseRansomfeedPayloadWithStats,
} from "./source-adapter.ts";
import { normalizeCountry } from "./countries.ts";
import { groupNameKey, normalizeGroupName } from "./group-normalization.ts";
import { appendSourceDisclosureHistory } from "./source-history.ts";

test("normalises legal suffixes and punctuation", () => {
  assert.equal(normalizeName("Acme, Inc."), "acme");
});

test("normalises domains", () => {
  assert.equal(normalizeDomain("https://WWW.Example.com/about"), "example.com");
});

test("scores exact and very similar names consistently", () => {
  assert.equal(similarityScore("Contoso Ltd", "Contoso Ltd"), 100);
  assert.ok(similarityScore("Contoso Corporation", "Contoso Corp") >= 85);
});

test("normalises Ransomfeed records and retains source identifiers", () => {
  const records = parseRansomfeedPayload([{
    id: 38772,
    date: "2026-11-16 20:19:11",
    victim: "Agram Concern",
    gang: "qilin",
    country: "Croatia",
    website: "agram-eeig.eu",
    work_sector: "Insurance",
    description: "Insurance and risk management organisation",
  }]);

  assert.equal(records.length, 1);
  assert.equal(records[0].sourceName, "Ransomfeed");
  assert.equal(records[0].sourceIdentifier, "rf-38772");
  assert.equal(records[0].victimName, "Agram Concern");
  assert.equal(records[0].domain, "agram-eeig.eu");
  assert.equal(records[0].country, "Croatia");
  assert.equal(records[0].targetedDomain, "agram-eeig.eu");
  assert.equal(records[0].description, "Insurance and risk management organisation");
});

test("ignores malformed Ransomfeed entries without victim names", () => {
  const records = parseRansomfeedPayload([
    null,
    { id: 1, gang: "unknown" },
  ]);
  assert.deepEqual(records, []);
});

test("counts rejected Ransomfeed rows and retains the original payload", () => {
  const result = parseRansomfeedPayloadWithStats([
    null,
    { id: 2 },
    { id: 3, victim: "Northwind", date: "not-a-date", gang: "qilin" },
  ]);

  assert.equal(result.records.length, 1);
  assert.equal(result.rejectedRecords, 2);
  assert.equal(result.records[0].publishedAt, undefined);
  assert.deepEqual(result.records[0].rawData, {
    id: 3,
    victim: "Northwind",
    date: "not-a-date",
    gang: "qilin",
  });
});

test("builds month endpoints from documented ransomware.live endpoint settings", () => {
  assert.equal(
    createRansomwareLiveUrl(
      "https://api-pro.ransomware.live/victims/recent",
      true,
      2026,
      11,
    ).toString(),
    "https://api-pro.ransomware.live/victims/?year=2026&month=11",
  );
  assert.equal(
    createRansomwareLiveUrl(
      "https://api.ransomware.live/v2/recentvictims",
      false,
      2026,
      11,
    ).toString(),
    "https://api.ransomware.live/v2/victims/2026/11",
  );
});

test("preserves source payloads, references, and prior normalized disclosure versions", () => {
  const first = appendSourceDisclosureHistory(
    { id: 8, description: "original source text" },
    {
      sourceName: "RansomLook",
      sourceIdentifier: "post-8",
      sourceUrl: "https://source.example/post-8",
      normalizedData: { description: "first normalized version" },
      publishedAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAtSource: null,
      targetedDomain: null,
      canonicalVictimId: "victim-1",
      ransomwareGroupId: "group-1",
    },
    new Date("2026-01-03T00:00:00.000Z"),
  );
  const second = appendSourceDisclosureHistory(
    first,
    {
      sourceName: "RansomLook",
      sourceIdentifier: "post-8",
      sourceUrl: "https://source.example/post-8",
      normalizedData: { description: "second normalized version" },
      publishedAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAtSource: null,
      targetedDomain: "source.example",
      canonicalVictimId: "victim-2",
      ransomwareGroupId: "group-1",
    },
    new Date("2026-01-04T00:00:00.000Z"),
  );

  assert.deepEqual(second.__ingestionHistory.sourcePayload, {
    id: 8,
    description: "original source text",
  });
  assert.equal(second.__ingestionHistory.revisions.length, 2);
  assert.deepEqual(second.__ingestionHistory.revisions[0].normalizedData, {
    description: "first normalized version",
  });
  assert.equal(second.__ingestionHistory.revisions[1].canonicalVictimId, "victim-2");
});

test("normalises common country names and ISO codes", () => {
  assert.deepEqual(normalizeCountry("USA"), { name:"United States of America", alpha2:"US", alpha3:"USA" });
  assert.deepEqual(normalizeCountry("UK"), { name:"United Kingdom", alpha2:"GB", alpha3:"GBR" });
  assert.deepEqual(normalizeCountry("UAE"), { name:"United Arab Emirates", alpha2:"AE", alpha3:"ARE" });
  assert.deepEqual(normalizeCountry("Czech Republic"), { name:"Czech Republic", alpha2:"CZ", alpha3:"CZE" });
  assert.equal(normalizeCountry("Non Disponibile"), null);
});

test("does not treat ransomware.live updates as a new victim", () => {
  const disclosures = [
    { sourceName:"ransomware.live", sourceIdentifier:"Acme@lockbit", victimName:"Acme", publishedAt:"2026-01-01" },
    { sourceName:"ransomware.live", sourceIdentifier:"Acme@lockbit-update", victimName:"Acme", publishedAt:"2026-01-05" },
  ];
  const first = disclosures[0];
  const update = disclosures[1];
  const isUpdate = first.sourceName === update.sourceName
    && normalizeName(first.victimName) === normalizeName(update.victimName);
  assert.equal(isUpdate, true);
});

test("detects exact and domain duplicate organisations", () => {
  assert.equal(similarityScore("Contoso Incorporated", "Contoso Inc"), 100);
  assert.equal(normalizeDomain("https://www.contoso.com/news"), "contoso.com");
});

test("keeps distinct organisations separate", () => {
  assert.equal(hasDistinctOrganisationRoots("Northwind Trading", "Southwind Trading"), true);
  assert.equal(hasDistinctOrganisationRoots("Contoso Ltd", "Contoso Corporation"), false);
});

test("normalises threat actor spelling variants", () => {
  assert.equal(normalizeGroupName("brain cipher"), "Brain Cipher");
  assert.equal(normalizeGroupName("BrainCipher"), "Brain Cipher");
  assert.equal(normalizeGroupName("brain  cipher"), "Brain Cipher");
  assert.equal(normalizeGroupName("LockBit 3"), "LockBit");
  assert.equal(normalizeGroupName("TheGentlemen"), "The Gentlemen");
  assert.equal(normalizeGroupName("BYOD"), "BYOD");
  assert.equal(normalizeGroupName("byod"), "BYOD");
  assert.equal(normalizeGroupName("AiLock"), "AiLock");
  assert.equal(normalizeGroupName("ailock"), "AiLock");
  assert.equal(normalizeGroupName("la piovra"), "la_piovra");
  assert.equal(normalizeGroupName("CMD Organization"), "cmdorganization");
  assert.equal(normalizeGroupName("cmd-organization"), "cmdorganization");
  assert.equal(normalizeGroupName("Space Bears"), "spacebears");
  assert.equal(normalizeGroupName("Audit Team"), "AuditTeam");
  assert.equal(normalizeGroupName("LockBit 2"), "LockBit");
  assert.equal(normalizeGroupName("lockbit5"), "LockBit");
  assert.equal(normalizeGroupName("killsec3"), "killsec3");
  assert.equal(normalizeGroupName("killsec"), "killsec");
  assert.notEqual(groupNameKey("Conti"), groupNameKey("Monti"));
});
