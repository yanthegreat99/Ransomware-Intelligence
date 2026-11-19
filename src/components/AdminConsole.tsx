"use client";

import { useEffect, useState } from "react";

type Duplicate = {
  id:string;
  similarityScore:number;
  classification:string;
  primaryVictim:{ id:string; name:string; domain?:string|null; targetedDomain?:string|null; country?:string|null; description?:string|null; firstReportedAt?:string; ransomwareGroup?:{name:string}|null };
  candidateVictim:{ id:string; name:string; domain?:string|null; targetedDomain?:string|null; country?:string|null; description?:string|null; firstReportedAt?:string; ransomwareGroup?:{name:string}|null };
};
type Verification = {
  id:string;
  name:string;
  verificationStatus:string;
  confidenceScore:number;
  domain?:string|null;
  country?:string|null;
  region?:string|null;
  description?:string|null;
  legitimacyStatus?:string;
  incidentStatus?:string;
  targetedDomain?:string|null;
  gicsSectorName?:string|null;
  gicsIndustryGroupName?:string|null;
  gicsIndustryName?:string|null;
  gicsSubIndustryName?:string|null;
  disclosures?:Array<{
    sourceName:string;
    sourceUrl:string|null;
    targetedDomain:string|null;
    originalIndustry:string|null;
    rawData?:unknown;
    normalizedData?:unknown;
  }>;
};
type GicsTaxonomy = {
  sectorCode:string;
  sectorName:string;
  industryGroupCode:string;
  industryGroupName:string;
  industryCode:string;
  industryName:string;
  subIndustryCode:string;
  subIndustryName:string;
};
type Ingestion = {
  id:string;
  sourceName:string;
  status:string;
  recordsRead:number;
  errorCount:number;
  startedAt:string;
  metadata?:{
    reconciliation?:{
      recordsRetrieved?:number;
      newDisclosures?:number;
      existingDisclosures?:number;
      updatedDisclosures?:number;
      repeatedSourceIdentifiers?:number;
      canonicalVictimsMatched?:number;
      rejectedRecords?:number;
      ingestionErrors?:number;
      warnings?:string[];
    };
  };
};
type MergeHistory = {
  id:string;
  field:string;
  analyst:string;
  reason:string|null;
  createdAt:string;
  victim:{id:string;name:string};
  newValue:unknown;
};

export default function AdminConsole() {
  const [tab,setTab] = useState("overview");
  const [duplicates,setDuplicates] = useState<Duplicate[]>([]);
  const [verification,setVerification] = useState<Verification[]>([]);
  const [classifications,setClassifications] = useState<Verification[]>([]);
  const [runs,setRuns] = useState<Ingestion[]>([]);
  const [mergeHistory,setMergeHistory] = useState<MergeHistory[]>([]);
  const [taxonomy,setTaxonomy] = useState<GicsTaxonomy[]>([]);
  const [selectedGics,setSelectedGics] = useState<GicsTaxonomy|null>(null);
  const [gicsQuery,setGicsQuery] = useState("");
  const [gicsVictimQuery,setGicsVictimQuery] = useState("");
  const [selectedVictimId,setSelectedVictimId] = useState("");
  const [duplicateModal,setDuplicateModal] = useState<Duplicate|null>(null);
  const [duplicateLimit,setDuplicateLimit] = useState(50);
  const [verificationLimit,setVerificationLimit] = useState(50);
  const [loadingMoreClassifications,setLoadingMoreClassifications] = useState(false);
  const [editingVictimId,setEditingVictimId] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [reviewCounts,setReviewCounts] = useState({duplicates:0,verification:0,classification:0});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const queue = tab==="overview" ? "overview" : tab==="duplicates" ? "duplicates" : tab==="classification" ? "classification" : tab==="verification" ? "verification" : "overview";
      const response = await fetch(`/api/admin/review?queue=${queue}&limit=50`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load review queues");
      setDuplicates(data.duplicates ?? []);
      setVerification(data.verification ?? []);
      setClassifications(data.classifications ?? []);
      setRuns(data.runs ?? []);
      setMergeHistory(data.mergeHistory ?? []);
      setTaxonomy(data.taxonomy ?? []);
      setSelectedGics((data.taxonomy ?? []).length ? (data.taxonomy[0] as GicsTaxonomy) : null);
      setReviewCounts(data.counts ?? {duplicates:0,verification:0,classification:0});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load review queues");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/review?queue=overview&limit=50")
      .then(async (response) => {
        const data = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(data.error ?? "Unable to load review queues");
        setDuplicates(data.duplicates ?? []);
        setVerification(data.verification ?? []);
        setClassifications(data.classifications ?? []);
        setRuns(data.runs ?? []);
        setMergeHistory(data.mergeHistory ?? []);
        setTaxonomy(data.taxonomy ?? []);
        setSelectedGics((data.taxonomy ?? []).length ? (data.taxonomy[0] as GicsTaxonomy) : null);
        setReviewCounts(data.counts ?? {duplicates:0,verification:0,classification:0});
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load review queues");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function action(payload: Record<string, unknown>): Promise<boolean> {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/review", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Review action failed");
      setMessage(
        data.merged
          ? `Merged records successfully. ${data.retainedClaimCount ?? 0} source claim(s) were preserved.`
          : "Review action completed successfully.",
      );
      await load();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Review action failed");
      return false;
    }
  }

  async function saveVictimEdit(event: React.FormEvent<HTMLFormElement>, victimId:string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      victimId,
      name:String(form.get("name") ?? "").trim(),
      domain:String(form.get("domain") ?? "").trim() || null,
      country:String(form.get("country") ?? "").trim() || null,
      region:String(form.get("region") ?? "").trim() || null,
      description:String(form.get("description") ?? "").trim() || null,
      verificationStatus:String(form.get("verificationStatus")),
      legitimacyStatus:String(form.get("legitimacyStatus")),
      incidentStatus:String(form.get("incidentStatus")),
      confidenceScore:Number(form.get("confidenceScore") ?? 0),
      analyst:String(form.get("analyst") ?? "").trim(),
      reason:String(form.get("reason") ?? "").trim(),
    };
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/victims", {
        method:"PATCH",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Victim update failed");
      setMessage(`Updated victim: ${data.victim.name}`);
      setEditingVictimId("");
      await load();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Victim update failed");
    }
  }

  async function loadMoreClassifications() {
    if (loadingMoreClassifications || classifications.length >= reviewCounts.classification) return;
    setLoadingMoreClassifications(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/review?queue=classification&limit=50&offset=${classifications.length}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load more classification records");
      setClassifications((current) => [...current, ...(data.classifications ?? [])]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more classification records");
    } finally {
      setLoadingMoreClassifications(false);
    }
  }

  async function runIngestion() {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/ingest",{method:"POST"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ingestion failed");
      setMessage("Ingestion started for all configured sources.");
      await load();
    } catch (ingestionError) {
      setError(ingestionError instanceof Error ? ingestionError.message : "Ingestion failed");
    }
  }

  async function logout() {
    await fetch("/api/admin/session",{method:"DELETE"});
    window.location.reload();
  }

  async function createVictim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name:String(form.get("name") ?? "").trim(),
      domain:String(form.get("domain") ?? "").trim() || undefined,
      country:String(form.get("country") ?? "").trim() || undefined,
      region:String(form.get("region") ?? "").trim() || undefined,
      description:String(form.get("description") ?? "").trim() || undefined,
      organisationType:String(form.get("organisationType") ?? "").trim() || undefined,
      ransomwareGroup:String(form.get("ransomwareGroup") ?? "").trim() || undefined,
      firstReportedAt:new Date(String(form.get("firstReportedAt") ?? "")).toISOString(),
      analyst:String(form.get("analyst") ?? "").trim(),
      reason:String(form.get("reason") ?? "").trim(),
      sourceName:"Manual analyst entry",
    };
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/victims",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Victim creation failed");
      setMessage(`Created victim: ${data.victim.name}`);
      event.currentTarget.reset();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Victim creation failed");
    }
  }

  const tabs = [
    ["overview","Overview"],
    ["duplicates","1. Duplicates"],
    ["classification","2. GICS & Verification"],
    ["ingestion","Ingestion"],
    ["manual","Manual entry"],
    ["merges","Merge history"],
  ] as const;

  return (
    <div className="admin-console">
      <div className="console-header">
        <div>
          <div className="eyebrow">PROTECTED ANALYST WORKSPACE</div>
          <h1>Review and administration</h1>
        </div>
        <div className="console-actions">
          <button className="export-button" type="button" onClick={load} disabled={loading}>Refresh</button>
          <button className="search-button" type="button" onClick={runIngestion} disabled={loading}>Run ingestion</button>
          <button className="export-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="console-tabs" role="tablist" aria-label="Analyst console sections">
        {tabs.map(([id,label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab===id}
            className={tab===id?"active":""}
            onClick={() => {
              setTab(id);
              const tabId = String(id);
              if (tabId==="overview" || tabId==="duplicates" || tabId==="classification") {
                const queue=tabId==="classification" ? "classification" : tabId;
                setLoading(true);
                void fetch(`/api/admin/review?queue=${queue}&limit=50`)
                  .then(async (response) => {
                    const data=await response.json();
                    if (!response.ok) throw new Error(data.error ?? "Unable to load review queue");
                    setDuplicates(data.duplicates ?? []);
                    setVerification(data.verification ?? []);
                    setClassifications(data.classifications ?? []);
                    setRuns(data.runs ?? []);
                    setMergeHistory(data.mergeHistory ?? []);
                    setTaxonomy(data.taxonomy ?? []);
                    setSelectedGics((data.taxonomy ?? []).length ? (data.taxonomy[0] as GicsTaxonomy) : null);
                    setReviewCounts(data.counts ?? {duplicates:0,verification:0,classification:0});
                  })
                  .catch((loadError:unknown) => setError(loadError instanceof Error ? loadError.message : "Unable to load review queue"))
                  .finally(() => setLoading(false));
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {message ? <div className="form-success" role="status">{message}</div> : null}
      {loading ? <div className="console-loading" role="status">Loading analyst data…</div> : null}

      {!loading && tab==="overview" ? (
        <section className="console-grid">
          <article className="metric-card"><div><span>Duplicates awaiting review</span><strong>{reviewCounts.duplicates}</strong></div></article>
          <article className="metric-card"><div><span>Victims needing GICS review</span><strong>{reviewCounts.classification}</strong></div></article>
          <article className="metric-card"><div><span>Victims needing verification</span><strong>{reviewCounts.verification}</strong></div></article>
          <article className="metric-card"><div><span>Recent ingestion runs</span><strong>{runs.length}</strong></div></article>
        </section>
      ) : null}

      {!loading && tab==="duplicates" ? (
        <section className="console-panel">
          <div className="panel-heading"><h2>Duplicate review queue</h2><span>{duplicates.length} matches</span></div>
          {duplicates.length ? duplicates.slice(0,duplicateLimit).map((match) => (
            <article className="review-row" key={match.id}>
              <button type="button" className="duplicate-victim-summary" onClick={() => setDuplicateModal(match)}>
                <strong>{match.primaryVictim.name}</strong>
                <span>Potential match: {match.candidateVictim.name}</span>
                <span className="duplicate-open-label">Click to compare claims</span>
              </button>
              <span className="status">{match.similarityScore}% · {match.classification.replaceAll("_"," ")}</span>
              <div className="review-actions">
                <button type="button" className="export-button" onClick={() => action({action:"resolve_duplicate",matchId:match.id,classification:"UNIQUE_VICTIM",analyst:"Analyst",reason:"Dismissed as unique after review"})}>Keep separate</button>
                <button type="button" className="danger-button" onClick={() => action({action:"merge_victims",canonicalId:match.primaryVictim.id,duplicateId:match.candidateVictim.id,analyst:"Analyst",reason:"Manually merged after duplicate review"})}>Merge records</button>
              </div>
            </article>
          )) : <div className="empty-chart">No duplicate matches awaiting review</div>}
          {duplicates.length > duplicateLimit ? (
            <button type="button" className="export-button load-more-button" onClick={() => setDuplicateLimit((limit)=>limit+50)}>
              Load 50 more
            </button>
          ) : null}
          {duplicateModal ? (
            <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target===event.currentTarget) setDuplicateModal(null);
            }}>
              <section className="review-modal duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-modal-title">
                <div className="panel-heading review-modal-header">
                  <div>
                    <div className="eyebrow">DUPLICATE COMPARISON</div>
                    <h2 id="duplicate-modal-title">Compare claims</h2>
                  </div>
                  <button type="button" className="export-button" onClick={() => setDuplicateModal(null)}>Close</button>
                </div>
                <div className="duplicate-comparison-grid">
                  {[duplicateModal.primaryVictim,duplicateModal.candidateVictim].map((victim,index) => (
                    <article className="duplicate-claim-card" key={victim.id}>
                      <div className="panel-heading"><h3>{index===0?"Primary record":"Potential duplicate"}</h3><span>{victim.id}</span></div>
                      <dl>
                        <div><dt>Victim</dt><dd>{victim.name}</dd></div>
                        <div><dt>Target/domain</dt><dd>{victim.targetedDomain ?? victim.domain ?? "Not identified"}</dd></div>
                        <div><dt>Country</dt><dd>{victim.country ?? "Unknown"}</dd></div>
                        <div><dt>Ransomware group</dt><dd>{victim.ransomwareGroup?.name ?? "Unknown"}</dd></div>
                        <div><dt>First reported</dt><dd>{victim.firstReportedAt ? String(victim.firstReportedAt).slice(0,10) : "Unknown"}</dd></div>
                        <div className="duplicate-description"><dt>Description</dt><dd>{victim.description ?? "No source description available."}</dd></div>
                      </dl>
                      <a className="export-button" href={`/victims/${victim.id}`} target="_blank" rel="noreferrer">Open victim profile</a>
                    </article>
                  ))}
                </div>
                <div className="duplicate-modal-actions">
                  <button type="button" className="export-button" onClick={() => {
                    void action({action:"resolve_duplicate",matchId:duplicateModal.id,classification:"UNIQUE_VICTIM",analyst:"Analyst",reason:"Dismissed as unique after claim comparison"});
                    setDuplicateModal(null);
                  }}>Keep separate</button>
                  <button type="button" className="danger-button" onClick={() => {
                    void action({action:"merge_victims",canonicalId:duplicateModal.primaryVictim.id,duplicateId:duplicateModal.candidateVictim.id,analyst:"Analyst",reason:"Manually merged after claim comparison"});
                    setDuplicateModal(null);
                  }}>Merge records</button>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && tab==="verification" ? (
        <section className="console-panel">
          <div className="panel-heading"><h2>Victim verification queue</h2><span>{verification.length} records</span></div>
          {verification.length ? verification.slice(0,verificationLimit).map((victim) => (
            <div key={victim.id}>
              <article className="review-row">
                <div><strong>{victim.name}</strong><span>Status: {victim.verificationStatus.replaceAll("_"," ")}</span></div>
                <span className="status">{victim.confidenceScore}% confidence</span>
                <div className="review-actions">
                  <a className="export-button" href={`/victims/${victim.id}`}>Open profile</a>
                  <button type="button" className="export-button" onClick={() => setEditingVictimId(editingVictimId===victim.id?"":victim.id)}>Edit entry</button>
                  <button type="button" className="search-button" onClick={() => action({action:"verify_victim",victimId:victim.id,status:"VERIFIED",legitimacyStatus:"LEGITIMATE_ORGANISATION",incidentStatus:"CORROBORATED_INCIDENT",confidenceScore:90,analyst:"Analyst",reason:"Manual analyst verification"})}>Mark verified</button>
                  <button type="button" className="danger-button" onClick={() => action({action:"verify_victim",victimId:victim.id,status:"DISPUTED",legitimacyStatus:"DISPUTED",incidentStatus:"DISPUTED_CLAIM",confidenceScore:20,analyst:"Analyst",reason:"Manual analyst dispute"})}>Mark disputed</button>
                </div>
              </article>
              {editingVictimId===victim.id ? (
                <form className="classification-form victim-edit-form" onSubmit={(event) => saveVictimEdit(event,victim.id)}>
                  <div className="admin-form-grid">
                    <label>Organisation name<input name="name" defaultValue={victim.name} required /></label>
                    <label>Domain<input name="domain" defaultValue={victim.domain ?? ""} /></label>
                    <label>Country<input name="country" defaultValue={victim.country ?? ""} /></label>
                    <label>Region<input name="region" defaultValue={victim.region ?? ""} /></label>
                    <label>Verification status
                      <select name="verificationStatus" defaultValue={victim.verificationStatus}>
                        <option value="VERIFIED">Verified</option>
                        <option value="PARTIALLY_VERIFIED">Partially Verified</option>
                        <option value="UNVERIFIED">Unverified</option>
                        <option value="DISPUTED">Disputed</option>
                        <option value="REMOVED">Removed</option>
                        <option value="UNDER_REVIEW">Under Review</option>
                      </select>
                    </label>
                    <label>Legitimacy
                      <select name="legitimacyStatus" defaultValue={victim.legitimacyStatus ?? "UNKNOWN"}>
                        <option value="LEGITIMATE_ORGANISATION">Legitimate organisation</option>
                        <option value="NOT_CONFIRMED">Not confirmed</option>
                        <option value="DISPUTED">Disputed</option>
                        <option value="UNKNOWN">Unknown</option>
                      </select>
                    </label>
                    <label>Incident status
                      <select name="incidentStatus" defaultValue={victim.incidentStatus ?? "UNVERIFIED_CLAIM"}>
                        <option value="CORROBORATED_INCIDENT">Corroborated incident</option>
                        <option value="UNVERIFIED_CLAIM">Unverified claim</option>
                        <option value="DISPUTED_CLAIM">Disputed claim</option>
                        <option value="RETRACTED">Retracted</option>
                        <option value="UNDER_REVIEW">Under review</option>
                      </select>
                    </label>
                    <label>Confidence score<input name="confidenceScore" type="number" min="0" max="100" defaultValue={victim.confidenceScore} /></label>
                    <label>Analyst name<input name="analyst" required /></label>
                  </div>
                  <label>Company description<textarea name="description" rows={5} defaultValue={victim.description ?? ""} /></label>
                  <label>Edit reason<textarea name="reason" rows={3} required /></label>
                  <div className="review-actions">
                    <button type="button" className="export-button" onClick={() => setEditingVictimId("")}>Cancel</button>
                    <button type="submit" className="search-button">Save entry</button>
                  </div>
                </form>
              ) : null}
            </div>
          )) : <div className="empty-chart">No victim verification records awaiting review</div>}
          {verification.length > verificationLimit ? (
            <button type="button" className="export-button load-more-button" onClick={() => setVerificationLimit((limit)=>limit+50)}>
              Load 50 more
            </button>
          ) : null}
        </section>
      ) : null}

      {!loading && tab==="classification" ? (
        <section className="console-panel">
          <div className="panel-heading"><h2>Victim classification and verification</h2><span>{reviewCounts.classification.toLocaleString()} pending victims</span></div>
          {classifications.length ? (
            (() => {
              const filteredVictims = classifications.filter((victim) =>
                `${victim.name} ${victim.targetedDomain ?? ""} ${victim.description ?? ""}`
                  .toLowerCase()
                  .includes(gicsVictimQuery.toLowerCase()),
              );
              const modalVictim = classifications.find((victim) => victim.id===selectedVictimId);
              return (
                <div>
                  <label>Search victims: 
                    <input
                      value={gicsVictimQuery}
                      onChange={(event) => setGicsVictimQuery(event.target.value)}
                      placeholder=" Name, domain or source description"
                    />
                  </label>
                  <div className="gics-victim-list gics-victim-card-list">
                    {filteredVictims.length ? filteredVictims.map((victim) => (
                      <button
                        type="button"
                        key={victim.id}
                        className="gics-victim-option gics-victim-card"
                        onClick={() => {
                          setSelectedVictimId(victim.id);
                          setGicsQuery("");
                          setSelectedGics(null);
                        }}
                      >
                        <strong>{victim.name}</strong>
                        <span>{victim.targetedDomain ?? victim.domain ?? "Domain not identified"} · {victim.country ?? "Country unknown"}</span>
                        {victim.description ? <p>{victim.description}</p> : <p>No source description available.</p>}
                        <span className="gics-open-label">Review and classify →</span>
                      </button>
                    )) : <div className="empty-chart">No matching victims</div>}
                  </div>
                  {reviewCounts.classification > classifications.length ? (
                    <button type="button" className="export-button load-more-button" onClick={() => void loadMoreClassifications()} disabled={loadingMoreClassifications}>
                      {loadingMoreClassifications ? "Loading…" : `Load more victims (${classifications.length.toLocaleString()} of ${reviewCounts.classification.toLocaleString()})`}
                    </button>
                  ) : null}
                  {modalVictim ? (
                    <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => {
                      if (event.target===event.currentTarget) setSelectedVictimId("");
                    }}>
                      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="gics-modal-title">
                        <div className="panel-heading review-modal-header">
                          <div>
                            <div className="eyebrow">GICS & VERIFICATION</div>
                            <h2 id="gics-modal-title">{modalVictim.name}</h2>
                          </div>
                          <button type="button" className="export-button" onClick={() => setSelectedVictimId("")}>Close</button>
                        </div>
                        <div className="review-modal-body">
                          <div className="victim-review-summary">
                            <div><span>Target domain</span><strong>{modalVictim.targetedDomain ?? modalVictim.domain ?? "Not identified"}</strong></div>
                            <div><span>Country</span><strong>{modalVictim.country ?? "Unknown"}</strong></div>
                            <div className="source-description">
                              <span>Source description</span>
                              <p>{modalVictim.description ?? "No source description available."}</p>
                            </div>
                          </div>
                          <form className="classification-form gics-modal-form" onSubmit={(event) => {
                            event.preventDefault();
                            const form = new FormData(event.currentTarget);
                            if (!selectedGics) return;
                            void action({
                              action:"classify_and_verify",
                              victimId:modalVictim.id,
                              subIndustryCode:selectedGics.subIndustryCode,
                              country:String(form.get("country") ?? "").trim() || null,
                              confidence:"MEDIUM",
                              analyst:String(form.get("analyst")),
                              reason:String(form.get("reason")),
                            }).then((succeeded) => {
                              if (succeeded) setSelectedVictimId("");
                            });
                          }}>
                            <label>Country
                              <input name="country" defaultValue={modalVictim.country ?? ""} placeholder="Enter a country name or ISO code" />
                              <span className="field-hint">Updates the canonical victim record; original source disclosures are preserved.</span>
                            </label>
                            <label>Search sub-industry
                              <input
                                value={gicsQuery}
                                onChange={(event) => setGicsQuery(event.target.value)}
                                placeholder="Code or sub-industry name"
                              />
                            </label>
                            <div className="gics-subindustry-list gics-subindustry-modal-list">
                              {taxonomy.filter((row) =>
                                `${row.subIndustryCode} ${row.subIndustryName} ${row.industryName} ${row.industryGroupName} ${row.sectorName}`
                                  .toLowerCase()
                                  .includes(gicsQuery.toLowerCase()),
                              ).slice(0,100).map((row) => (
                                <button
                                  type="button"
                                  key={row.subIndustryCode}
                                  className={`gics-subindustry-option ${selectedGics?.subIndustryCode===row.subIndustryCode?"active":""}`}
                                  onClick={() => setSelectedGics(row)}
                                >
                                  <strong>{row.subIndustryCode}</strong>
                                  <span>{row.subIndustryName}</span>
                                </button>
                              ))}
                            </div>
                            {selectedGics ? (
                              <div className="gics-cascade" aria-label="Automatically derived GICS hierarchy">
                                <div><span>Sector</span><strong>{selectedGics.sectorCode} · {selectedGics.sectorName}</strong></div>
                                <div><span>Industry group</span><strong>{selectedGics.industryGroupCode} · {selectedGics.industryGroupName}</strong></div>
                                <div><span>Industry</span><strong>{selectedGics.industryCode} · {selectedGics.industryName}</strong></div>
                                <div><span>Sub-industry</span><strong>{selectedGics.subIndustryCode} · {selectedGics.subIndustryName}</strong></div>
                              </div>
                            ) : null}
                            <label>Analyst name<input name="analyst" required /></label>
                            <label>Classification and verification evidence<textarea name="reason" rows={4} required /></label>
                            <button className="search-button" type="submit" disabled={!selectedGics}>Apply sub-industry and verify victim</button>
                          </form>
                        </div>
                      </section>
                    </div>
                  ) : null}
                </div>
              );
            })()
          ) : null}
        </section>
      ) : null}

      {!loading && tab==="ingestion" ? (
        <section className="console-panel">
          <div className="panel-heading"><h2>Ingestion monitoring</h2><span>{runs.length} recent runs</span></div>
          {runs.length ? runs.map((run) => (
            <article className="review-row" key={run.id}>
              <div><strong>{run.sourceName}</strong><span>{new Date(run.startedAt).toLocaleString()}</span></div>
              <span className={`status ${run.status==="SUCCESS"?"verified":run.status==="FAILED"?"unverified":""}`}>{run.status}</span>
              <div className="review-actions">
                {run.metadata?.reconciliation ? (
                  <span className="status">
                    {run.metadata.reconciliation.recordsRetrieved ?? run.recordsRead} retrieved ·{" "}
                    {run.metadata.reconciliation.newDisclosures ?? 0} new disclosures ·{" "}
                    {run.metadata.reconciliation.existingDisclosures ?? 0} existing ·{" "}
                    {run.metadata.reconciliation.updatedDisclosures ?? 0} updated ·{" "}
                    {run.metadata.reconciliation.canonicalVictimsMatched ?? 0} canonical matches ·{" "}
                    {run.metadata.reconciliation.repeatedSourceIdentifiers ?? 0} repeated IDs ·{" "}
                    {run.metadata.reconciliation.rejectedRecords ?? 0} rejected ·{" "}
                    {run.metadata.reconciliation.ingestionErrors ?? run.errorCount} errors
                  </span>
                ) : (
                  <span className="status">{run.recordsRead} records · {run.errorCount} errors</span>
                )}
              </div>
              {run.metadata?.reconciliation?.warnings?.length ? (
                <ul className="ingestion-warnings">
                  {run.metadata.reconciliation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
            </article>
          )) : <div className="empty-chart">No ingestion runs recorded</div>}
        </section>
      ) : null}

      {!loading && tab==="manual" ? (
        <section className="console-panel">
          <div className="panel-heading"><h2>Manual victim entry</h2><span>Audit trail enabled</span></div>
          <form className="admin-form" onSubmit={createVictim}>
            <div className="admin-form-grid">
              <label>Organisation name<input name="name" required /></label>
              <label>Target/domain<input name="domain" placeholder="example.com" /></label>
              <label>Country<input name="country" /></label>
              <label>Region<input name="region" /></label>
              <label>Ransomware group<input name="ransomwareGroup" /></label>
              <label>First reported<input name="firstReportedAt" type="datetime-local" required /></label>
              <label>Organisation type<input name="organisationType" /></label>
              <label>Analyst name<input name="analyst" required /></label>
            </div>
            <label>Company description<textarea name="description" rows={5} /></label>
            <label>Reason for manual entry<textarea name="reason" rows={3} required /></label>
            <button className="search-button" type="submit">Create canonical victim</button>
          </form>
        </section>
      ) : null}
      {!loading && tab==="merges" ? (
        <section className="console-panel">
          <div className="panel-heading"><h2>Merge history</h2><span>{mergeHistory.length} recorded merges</span></div>
          {mergeHistory.length ? mergeHistory.map((entry) => {
            const value = typeof entry.newValue==="object" && entry.newValue!==null
              ? entry.newValue as Record<string,unknown>
              : {};
            return (
              <article className="review-row" key={entry.id}>
                <div>
                  <strong>{entry.victim.name}</strong>
                  <span>{entry.reason ?? "Duplicate merge"}</span>
                  {typeof value.retainedClaimCount==="number" ? (
                    <span>{value.retainedClaimCount} source claim(s) retained</span>
                  ) : null}
                </div>
                <span className="status">{entry.analyst}</span>
                <div className="review-actions">
                  <a className="export-button" href={`/victims/${entry.victim.id}`}>Open canonical victim</a>
                  <span className="status">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              </article>
            );
          }) : <div className="empty-chart">No merge operations have been recorded</div>}
        </section>
      ) : null}
    </div>
  );
}
