import Link from "next/link";
import { getDb } from "@/lib/prisma";
import { or } from "@prisma/orm-postgres/orm-client";

type VerificationStatus = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "DISPUTED" | "REMOVED" | "UNDER_REVIEW";

export default async function VictimsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; verification?: string; group?: string; industry?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 50;
  let victims: Array<{
    id: string;
    name: string;
    domain: string | null;
    country: string | null;
    firstReportedAt: Date;
    verificationStatus: string;
    duplicateStatus: string;
    ransomwareGroup: { name: string } | null;
  }> = [];
  let total = 0;
  try {
    const db = getDb();
    let query = db.orm.public.CanonicalVictim;
    if (params.q) {
      query = query.where((victim) =>
        or(victim.name.ilike(`%${params.q}%`), victim.domain.ilike(`%${params.q}%`)),
      );
    }
    if (params.country) query = query.where({ country: params.country });
    if (params.verification && ["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "DISPUTED", "REMOVED", "UNDER_REVIEW"].includes(params.verification)) {
      query = query.where((victim) =>
        victim.verificationStatus.eq(params.verification as VerificationStatus),
      );
    }
    if (params.group) {
      const groups = await db.orm.public.RansomwareGroup
        .where((group) => group.name.ilike(`%${params.group}%`))
        .select("id")
        .all();
      query = query.where((victim) =>
        victim.ransomwareGroupId.in(groups.map((group) => group.id)),
      );
    }
    if (params.industry) query = query.where({ gicsSectorName: params.industry });
    if (params.from) query = query.where((victim) => victim.firstReportedAt.gte(new Date(params.from!)));
    if (params.to) query = query.where((victim) => victim.firstReportedAt.lte(new Date(`${params.to}T23:59:59.999Z`)));
    const [resultItems, resultTotal] = await Promise.all([
      query
        .include("ransomwareGroup")
        .orderBy(params.sort === "name"
          ? (victim) => victim.name.asc()
          : params.sort === "oldest"
            ? (victim) => victim.firstReportedAt.asc()
            : params.sort === "updated"
              ? (victim) => victim.lastUpdatedAt.desc()
              : (victim) => victim.firstReportedAt.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all(),
      query.aggregate((aggregate) => ({ total: aggregate.count() })).then((result) => result.total),
    ]);
    victims = resultItems;
    total = resultTotal;
  } catch {
    victims = [];
  }
  const currentParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) currentParams.set(key, value);
  }
  const exportParams = new URLSearchParams(currentParams);
  exportParams.delete("page");
  const pages = Math.ceil(total / pageSize);
  const previousParams = new URLSearchParams(currentParams);
  previousParams.set("page", String(Math.max(1, page - 1)));
  const nextParams = new URLSearchParams(currentParams);
  nextParams.set("page", String(Math.min(pages || 1, page + 1)));

  return (
    <div className="page directory-page">
        <header className="topbar"><div><div className="eyebrow">CANONICAL DATABASE</div><h1>Victim intelligence</h1></div></header>
        <form className="directory-tools">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search victim, domain or identifier" />
          <input name="country" defaultValue={params.country ?? ""} placeholder="Country" />
          <input name="group" defaultValue={params.group ?? ""} placeholder="Ransomware group" />
          <input name="industry" defaultValue={params.industry ?? ""} placeholder="GICS sector" />
          <input name="from" type="date" defaultValue={params.from ?? ""} />
          <input name="to" type="date" defaultValue={params.to ?? ""} />
          <select name="verification" defaultValue={params.verification ?? ""}>
            <option value="">All verification statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="PARTIALLY_VERIFIED">Partially verified</option>
            <option value="UNVERIFIED">Unverified</option>
            <option value="DISPUTED">Disputed</option>
            <option value="UNDER_REVIEW">Under review</option>
          </select>
          <select name="sort" defaultValue={params.sort ?? "newest"}>
            <option value="newest">Newest reported</option>
            <option value="oldest">Oldest reported</option>
            <option value="updated">Recently updated</option>
            <option value="name">Organisation name</option>
          </select>
          <button className="search-button" type="submit">Search</button>
          <a className="export-button" href={`/api/victims?format=csv&${exportParams.toString()}`}>CSV</a>
          <a className="export-button" href={`/api/victims?format=json&${exportParams.toString()}`}>JSON</a>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Organisation</th><th>Ransomware group</th><th>Country</th><th>Reported</th><th>Verification</th><th>Duplicate status</th></tr></thead>
            <tbody>
              {victims.length ? victims.map((victim) => (
                <tr key={victim.id}>
                  <td><Link href={`/victims/${victim.id}`}>{victim.name}</Link><br /><span style={{color:"#91a0b5"}}>{victim.domain ?? "Domain unavailable"}</span></td>
                  <td>{victim.ransomwareGroup?.name ?? "Unknown"}</td>
                  <td>{victim.country ?? "Unknown"}</td>
                  <td>{victim.firstReportedAt.toISOString().slice(0,10)}</td>
                  <td><span className={`status ${victim.verificationStatus === "VERIFIED" ? "verified" : "unverified"}`}>{victim.verificationStatus.replaceAll("_"," ")}</span></td>
                  <td>{victim.duplicateStatus.replaceAll("_"," ")}</td>
                </tr>
              )) : (
                <tr><td colSpan={6}>No canonical victim records are available. Configure the database and run ingestion.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="filters" style={{ marginTop:12, justifyContent:"space-between" }}>
          <span style={{ color:"#91a0b5", fontSize:12, alignSelf:"center" }}>
            {total.toLocaleString()} records · Page {page} of {pages || 1}
          </span>
          <div>
            <a className="export-button" href={`/victims?${previousParams.toString()}`} style={{ marginRight:6 }}>Previous</a>
            <a className="export-button" href={`/victims?${nextParams.toString()}`}>Next</a>
          </div>
        </div>
    </div>
  );
}
