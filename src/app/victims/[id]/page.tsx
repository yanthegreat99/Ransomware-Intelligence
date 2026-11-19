import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function VictimProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let victim;
  try {
    victim = await prisma.canonicalVictim.findUnique({
      where: { id },
      include: { ransomwareGroup: true, disclosures: true, evidence: true, classifications: true, edits: { orderBy: { createdAt:"desc" } } },
    });
  } catch {
    notFound();
  }
  if (!victim) notFound();

  return (
    <div className="page profile-page">
      <Link href="/victims" style={{ color:"#70a8ff", fontSize:13 }}>← Victim database</Link>
      <header className="topbar" style={{ marginTop:18 }}>
        <div><div className="eyebrow">VICTIM INTELLIGENCE PROFILE</div><h1>{victim.name}</h1></div>
        <span className={`status ${victim.verificationStatus === "VERIFIED" ? "verified" : "unverified"}`}>{victim.verificationStatus.replaceAll("_"," ")}</span>
      </header>
      <section className="metric-grid" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <article className="metric-card"><div><span>Ransomware group</span><strong>{victim.ransomwareGroup?.name ?? "Unknown"}</strong></div></article>
        <article className="metric-card"><div><span>Country</span><strong>{victim.country ?? "Unknown"}</strong></div></article>
        <article className="metric-card"><div><span>First reported</span><strong>{victim.firstReportedAt.toISOString().slice(0,10)}</strong></div></article>
        <article className="metric-card"><div><span>Confidence</span><strong>{victim.confidenceScore}%</strong></div></article>
      </section>
      <section className="chart-grid">
        <article className="panel organisation-panel"><div className="panel-heading"><h2>Organisation</h2></div>
          <div className="quality-row"><span>Domain</span><strong style={{fontSize:14}}>{victim.domain ?? "Unknown"}</strong></div>
          <div className="quality-row"><span>Targeted domain</span><strong style={{fontSize:14}}>{victim.targetedDomain ?? victim.domain ?? "Not identified"}</strong></div>
          <div className="quality-row"><span>GICS sector</span><strong style={{fontSize:14}}>{victim.gicsSectorName ?? "Unclassified"}</strong></div>
          <div className="quality-row"><span>Legitimacy</span><strong style={{fontSize:14}}>{victim.legitimacyStatus}</strong></div>
          <div className="quality-row"><span>Incident status</span><strong style={{fontSize:14}}>{victim.incidentStatus}</strong></div>
        </article>
        <article className="panel"><div className="panel-heading"><h2>Source disclosures</h2></div>
          {victim.disclosures.length ? victim.disclosures.map((source) => (
            <div className="quality-row" key={source.id}>
              <div>
                <strong style={{display:"block",fontSize:12}}>{source.sourceName}</strong>
                <span style={{display:"block",fontSize:10,marginTop:4}}>
                  Published {source.publishedAt?.toISOString().slice(0,16).replace("T"," ") ?? "Unknown"}
                  · Updated {source.updatedAtSource?.toISOString().slice(0,16).replace("T"," ") ?? "No update"}
                  · Retrieved {source.retrievedAt.toISOString().slice(0,16).replace("T"," ")}
                </span>
              </div>
              {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" style={{color:"#70a8ff"}}>Source</a> : <strong style={{fontSize:12}}>No URL</strong>}
            </div>
          )) : <div className="empty-chart">No source disclosures retained</div>}
        </article>
      </section>
      {victim.description ? (
        <section className="panel description-panel">
          <div className="panel-heading"><h2>Company description</h2><span>Source-derived intelligence</span></div>
          <p>{victim.description}</p>
        </section>
      ) : (
        <section className="panel description-panel description-empty">
          <div className="panel-heading"><h2>Company description</h2></div>
          <p>No company description has been identified or ingested.</p>
        </section>
      )}
      <section className="chart-grid" style={{ marginTop:10 }}>
        <article className="panel">
          <div className="panel-heading"><h2>Verification evidence</h2></div>
          {victim.evidence.length ? victim.evidence.map((item) => (
            <div className="quality-row" key={item.id}>
              <span>{item.sourceName ?? item.evidenceType}</span>
              <strong style={{fontSize:12, color:item.supports?"var(--green)":"var(--red)"}}>{item.supports?"Supports":"Contradicts"}</strong>
            </div>
          )) : <div className="empty-chart">No evidence has been recorded</div>}
        </article>
        <article className="panel">
          <div className="panel-heading"><h2>Data correction history</h2></div>
          {victim.edits.length ? victim.edits.slice(0,20).map((edit) => (
            <div className="quality-row" key={edit.id}>
              <div>
                <strong style={{display:"block",fontSize:12}}>
                  {edit.field==="mergedVictim" || edit.field==="confirmedDuplicate" ? "Duplicate merge" : edit.field}
                </strong>
                {edit.field==="mergedVictim" || edit.field==="confirmedDuplicate" ? (
                  <span style={{display:"block",fontSize:10,marginTop:4}}>
                    Retained source claims: {typeof (edit.newValue as Record<string,unknown>).retainedClaimCount === "number"
                      ? String((edit.newValue as Record<string,unknown>).retainedClaimCount)
                      : "Historical disclosures retained"}
                  </span>
                ) : null}
              </div>
              <strong style={{fontSize:12}}>{edit.analyst} · {edit.createdAt.toISOString().slice(0,10)}</strong>
            </div>
          )) : <div className="empty-chart">No manual corrections recorded</div>}
        </article>
      </section>
    </div>
  );
}
