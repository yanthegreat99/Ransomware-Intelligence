import { getDb } from "@/lib/prisma";
import { or } from "@prisma/orm-postgres/orm-client";
import { normalizeCountry } from "@/lib/countries";
import { continentForCountry } from "@/lib/continents";

export const dynamic = "force-dynamic";

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?:string; continent?:string; group?:string; industry?:string; verification?:string; year?:string; from?:string; to?:string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  let query = db.orm.public.CanonicalVictim;
  const verificationStatuses = ["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "DISPUTED", "REMOVED", "UNDER_REVIEW"] as const;
  if (params.verification && verificationStatuses.includes(params.verification as typeof verificationStatuses[number])) {
    query = query.where((victim) =>
      victim.verificationStatus.eq(params.verification as typeof verificationStatuses[number]),
    );
  }
  if (params.group) {
    const groups = await db.orm.public.RansomwareGroup
      .where((group) => group.name.ilike(`%${params.group}%`))
      .select("id")
      .all();
    query = query.where((victim) => victim.ransomwareGroupId.in(groups.map((group) => group.id)));
  }
  if (params.industry) {
    query = query.where((victim) => victim.gicsSectorName.ilike(`%${params.industry}%`));
  }
  if (params.country) {
    const normalized = normalizeCountry(params.country);
    query = query.where((victim) => normalized
      ? or(victim.countryCode.eq(normalized.alpha2), victim.country.eq(normalized.name))
      : victim.country.ilike(`%${params.country}%`));
  }
  if (params.continent) {
    const continent = params.continent;
    const continentCodes = [
      "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW",
      "AF","AM","AZ","BH","BD","BT","BN","KH","CN","CY","GE","IN","ID","IR","IQ","IL","JP","JO","KZ","KW","KG","LA","LB","MY","MV","MN","MM","NP","KP","OM","PK","PS","PH","QA","SA","SG","KR","LK","SY","TW","TJ","TH","TL","TR","TM","AE","UZ","VN","YE",
      "AL","AD","AT","BY","BE","BA","BG","HR","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","MD","MC","ME","NL","MK","NO","PL","PT","RO","RU","SM","RS","SK","SI","ES","SE","CH","UA","GB","VA",
      "AG","BS","BB","BZ","CA","CR","CU","DM","DO","SV","GD","GT","HT","HN","JM","MX","NI","PA","KN","LC","VC","TT","US",
      "AR","BO","BR","CL","CO","EC","GY","PY","PE","SR","UY","VE",
      "AU","FJ","KI","MH","FM","NR","NZ","PW","PG","WS","SB","TO","TV","VU",
      "AQ","BV","TF","HM","GS",
    ];
    const continentByCode = new Map<string,string>();
    const africaCodes = continentCodes.slice(0,53);
    const asiaCodes = continentCodes.slice(53,104);
    const europeCodes = continentCodes.slice(104,149);
    const northCodes = continentCodes.slice(149,173);
    const southCodes = continentCodes.slice(173,185);
    const oceaniaCodes = continentCodes.slice(185,199);
    const antarcticaCodes = continentCodes.slice(199);
    for (const code of africaCodes) continentByCode.set(code,"Africa");
    for (const code of asiaCodes) continentByCode.set(code,"Asia");
    for (const code of europeCodes) continentByCode.set(code,"Europe");
    for (const code of northCodes) continentByCode.set(code,"North America");
    for (const code of southCodes) continentByCode.set(code,"South America");
    for (const code of oceaniaCodes) continentByCode.set(code,"Oceania");
    for (const code of antarcticaCodes) continentByCode.set(code,"Antarctica");
    const validCodes=[...continentByCode].filter(([,value])=>value===continent).map(([code])=>code);
    if (validCodes.length) query = query.where((victim) => victim.countryCode.in(validCodes));
  }

  let rows: Array<{ country:string; code:string|null; count:number; continent:string|null }> = [];
  let totalVictims = 0;
  let todayVictims = 0;
  let topGroup = "None";
  let topIndustry = "Unclassified";
  let activeCountries = 0;

  try {
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    let dateQuery = query;
    if (params.year) {
      const year = Number(params.year);
      if (Number.isInteger(year)) {
        dateQuery = dateQuery
          .where((victim) => victim.firstReportedAt.gte(new Date(`${year}-01-01T00:00:00.000Z`)))
          .where((victim) => victim.firstReportedAt.lt(new Date(`${year + 1}-01-01T00:00:00.000Z`)));
      }
    }
    if (params.from) dateQuery = dateQuery.where((victim) => victim.firstReportedAt.gte(new Date(`${params.from}T00:00:00.000Z`)));
    if (params.to) dateQuery = dateQuery.where((victim) => victim.firstReportedAt.lte(new Date(`${params.to}T23:59:59.999Z`)));
    const count = async (result: PromiseLike<{ total: number }>) => (await result).total;
    const [total, todayCount, countryData, groupData, industryData] = await Promise.all([
      count(dateQuery.aggregate((aggregate) => ({ total: aggregate.count() }))),
      count(query.where((victim) => victim.firstReportedAt.gte(today)).aggregate((aggregate) => ({ total: aggregate.count() }))),
      dateQuery.where((victim) => victim.country.isNotNull())
        .groupBy("countryCode", "country")
        .aggregate((aggregate) => ({ count: aggregate.count() })),
      dateQuery.groupBy("ransomwareGroupId").aggregate((aggregate) => ({ count: aggregate.count() })),
      dateQuery.groupBy("gicsSectorName").aggregate((aggregate) => ({ count: aggregate.count() })),
    ]);
    totalVictims = total;
    todayVictims = todayCount;

    const totals = new Map<string,{country:string;code:string|null;count:number;continent:string|null}>();
    for (const row of countryData) {
      const normalized = normalizeCountry(row.countryCode ?? row.country);
      if (!normalized) continue;
      const existing = totals.get(normalized.alpha2);
      totals.set(normalized.alpha2,{
        country:normalized.name,
        code:normalized.alpha2,
        count:(existing?.count ?? 0)+row.count,
        continent:continentForCountry(normalized.alpha2),
      });
    }
    rows = [...totals.values()].sort((a,b)=>b.count-a.count);
    activeCountries = rows.length;

    const groupId = groupData.sort((left, right) => right.count - left.count)[0]?.ransomwareGroupId;
    if (groupId) {
      const group = await db.orm.public.RansomwareGroup.select("name").first({ id: groupId });
      topGroup = group?.name ?? "Unknown";
    }
    topIndustry = industryData.sort((left, right) => right.count - left.count)[0]?.gicsSectorName ?? "Unclassified";
  } catch {}

  const currentParams = new URLSearchParams();
  for (const [key,value] of Object.entries(params)) if (value) currentParams.set(key,value);
  const currentYear = new Date().getUTCFullYear();

  return (
    <div className="page directory-page">
      <header className="topbar">
        <div><div className="eyebrow">GEOGRAPHIC ANALYTICS</div><h1>Targeted countries</h1></div>
      </header>
      <form className="directory-tools country-filters">
        <input name="country" defaultValue={params.country ?? ""} placeholder="Country or ISO code" />
        <select name="continent" defaultValue={params.continent ?? ""}>
          <option value="">All continents</option>
          <option value="Africa">Africa</option>
          <option value="Asia">Asia</option>
          <option value="Europe">Europe</option>
          <option value="North America">North America</option>
          <option value="South America">South America</option>
          <option value="Oceania">Oceania</option>
          <option value="Antarctica">Antarctica</option>
        </select>
        <input name="group" defaultValue={params.group ?? ""} placeholder="Ransomware group" />
        <input name="industry" defaultValue={params.industry ?? ""} placeholder="GICS sector" />
        <select name="verification" defaultValue={params.verification ?? ""}>
          <option value="">All verification statuses</option>
          <option value="VERIFIED">Verified</option>
          <option value="PARTIALLY_VERIFIED">Partially verified</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="DISPUTED">Disputed</option>
          <option value="UNDER_REVIEW">Under review</option>
        </select>
        <select name="year" defaultValue={params.year ?? ""}>
          <option value="">All years</option>
          {Array.from({length:8},(_,index)=>currentYear-index).map((year)=><option value={String(year)} key={year}>{year}</option>)}
        </select>
        <input name="from" type="date" defaultValue={params.from ?? ""} />
        <input name="to" type="date" defaultValue={params.to ?? ""} />
        <button className="search-button" type="submit">Apply filters</button>
      </form>
      <section className="metric-grid country-statistics">
        <article className="metric-card"><div><span>Filtered victims</span><strong>{totalVictims.toLocaleString()}</strong></div></article>
        <article className="metric-card"><div><span>Reported today</span><strong>{todayVictims.toLocaleString()}</strong></div></article>
        <article className="metric-card"><div><span>Active countries</span><strong>{activeCountries.toLocaleString()}</strong></div></article>
        <article className="metric-card"><div><span>Top ransomware group</span><strong className="metric-text">{topGroup}</strong></div></article>
        <article className="metric-card"><div><span>Top GICS sector</span><strong className="metric-text">{topIndustry}</strong></div></article>
      </section>
      <div className="table-wrap" style={{marginTop:10}}>
        <table>
          <thead><tr><th>Country</th><th>Continent</th><th>ISO code</th><th>Canonical victims</th><th>Share</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((row)=>{
              const share=totalVictims ? (row.count/totalVictims)*100 : 0;
              return (
                <tr key={row.code ?? row.country}>
                  <td><a href={`/countries?country=${encodeURIComponent(row.code ?? row.country)}&${currentParams.toString()}`}>{row.country}</a></td>
                  <td>{row.continent ?? "Other"}</td>
                  <td>{row.code ?? "-"}</td>
                  <td>{row.count.toLocaleString()}</td>
                  <td>{share.toFixed(1)}%</td>
                </tr>
              );
            }) : <tr><td colSpan={5}>No geographic records match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
