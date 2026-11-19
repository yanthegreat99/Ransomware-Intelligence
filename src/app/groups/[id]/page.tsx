import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/prisma";
import ThreatActorProfileActions from "@/components/ThreatActorProfileActions";

export const dynamic = "force-dynamic";

export default async function GroupProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let group;
  try {
    group = await getDb().orm.public.RansomwareGroup
      .include("victims", (victims) =>
        victims.orderBy((victim) => victim.firstReportedAt.desc()).limit(100),
      )
      .include("disclosures", (disclosures) =>
        disclosures.orderBy((disclosure) => disclosure.publishedAt.desc()).limit(20),
      )
      .first({ id });
  } catch {
    notFound();
  }
  if (!group) notFound();

  const countries = new Map<string, number>();
  const sectors = new Map<string, number>();
  for (const victim of group.victims) {
    if (victim.country) countries.set(victim.country, (countries.get(victim.country) ?? 0) + 1);
    if (victim.gicsSectorName) sectors.set(victim.gicsSectorName, (sectors.get(victim.gicsSectorName) ?? 0) + 1);
  }
  const profileUrls = typeof group.profileUrls === "object" && group.profileUrls !== null
    ? group.profileUrls as { ransomwareLook?: string; api?: string }
    : {};
  const knownLocations = Array.isArray(group.knownLocations)
    ? group.knownLocations as Array<{ slug?:string; fqdn?:string; title?:string; available?:boolean; updated?:string; lastScrape?:string }>
    : [];

  return (
    <div className="page profile-page">
      <Link href="/groups" style={{ color:"#70a8ff", fontSize:13 }}>← Ransomware groups</Link>
      <header className="topbar" style={{ marginTop:18 }}>
        <div><div className="eyebrow">RANSOMWARE GROUP PROFILE</div><h1>{group.name}</h1></div>
        <span className="status">{group.operationalStatus}</span>
      </header>
      <ThreatActorProfileActions groupId={group.id} />
      <section className="metric-grid">
        <article className="metric-card"><div><span>First observed</span><strong>{group.firstObserved?.toISOString().slice(0,10) ?? "Unknown"}</strong></div></article>
        <article className="metric-card"><div><span>Last observed</span><strong>{group.lastObserved?.toISOString().slice(0,10) ?? "Unknown"}</strong></div></article>
        <article className="metric-card"><div><span>Canonical victims</span><strong>{group.victims.length}</strong></div></article>
        <article className="metric-card"><div><span>Target countries</span><strong>{countries.size}</strong></div></article>
      </section>
      <section className="chart-grid" style={{ marginTop:10 }}>
        <article className="panel"><div className="panel-heading"><h2>Targeted countries</h2></div>
          {[...countries.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([country,count]) =>
            <div className="quality-row" key={country}><span>{country}</span><strong>{count}</strong></div>
          )}
        </article>
        <article className="panel"><div className="panel-heading"><h2>Targeted GICS sectors</h2></div>
          {[...sectors.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([sector,count]) =>
            <div className="quality-row" key={sector}><span>{sector}</span><strong>{count}</strong></div>
          )}
        </article>
      </section>
      <section className="chart-grid" style={{ marginTop:10 }}>
        <article className="panel">
          <div className="panel-heading"><h2>Leak-site locations</h2><span>RansomLook profile</span></div>
          {knownLocations.length ? knownLocations.map((location,index) => (
            <div className="quality-row" key={`${location.slug ?? location.fqdn ?? index}`}>
              <div>
                <span>{location.title ?? location.fqdn ?? "Leak site"}</span>
                {location.slug ? <div><a href={location.slug} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#70a8ff"}}>{location.slug}</a></div> : null}
              </div>
              <strong style={{fontSize:12,color:location.available?"var(--green)":"var(--red)"}}>{location.available?"Up":"Down"}</strong>
            </div>
          )) : (
            <div className="empty-chart">No associated leak-site locations have been refreshed</div>
          )}
        </article>
        <article className="panel">
          <div className="panel-heading"><h2>Actor intelligence</h2></div>
          <div className="quality-row"><span>Parser status</span><strong style={{fontSize:12}}>{group.parserStatus ?? "Not refreshed"}</strong></div>
          <div className="quality-row"><span>Aliases</span><strong style={{fontSize:12}}>{group.aliases?.length ? group.aliases.join(", ") : "None recorded"}</strong></div>
          {profileUrls.ransomwareLook ? (
            <div className="quality-row"><span>External profile</span><a href={profileUrls.ransomwareLook} target="_blank" rel="noreferrer" style={{fontSize:12}}>RansomLook</a></div>
          ) : (
            <div className="quality-row"><span>External profile</span><strong style={{fontSize:12}}>Not refreshed</strong></div>
          )}
        </article>
      </section>
      <section className="panel" style={{ marginTop:10 }}>
        <div className="panel-heading"><h2>Recent victim disclosures</h2></div>
        {group.victims.length ? group.victims.map((victim) =>
          <div className="quality-row" key={victim.id}>
            <Link href={`/victims/${victim.id}`}>{victim.name}</Link>
            <span>{victim.country ?? "Unknown"} · {victim.firstReportedAt.toISOString().slice(0,10)}</span>
          </div>
        ) : <div className="empty-chart">No canonical victim disclosures</div>}
      </section>
    </div>
  );
}
