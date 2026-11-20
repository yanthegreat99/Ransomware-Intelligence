import { getDb } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

const loadIndustryAnalytics = unstable_cache(
  async () => {
    const data = await getDb().orm.public.CanonicalVictim
      .groupBy("gicsSectorName", "gicsIndustryGroupName", "gicsIndustryName", "gicsSubIndustryName")
      .orderBy((victim) => victim.gicsSectorName.desc())
      .limit(100)
      .aggregate((aggregate) => ({ count: aggregate.count() }));
    return data.map((row) => ({ ...row, _count: { _all: row.count } }));
  },
  ["public-industry-analytics-v1"],
  { revalidate: 300 },
);

export const dynamic = "force-dynamic";

export default async function IndustriesPage() {
  let rows: Array<{ gicsSectorName: string | null; gicsIndustryGroupName: string | null; gicsIndustryName: string | null; gicsSubIndustryName: string | null; _count: { _all: number } }> = [];
  try {
    rows = await loadIndustryAnalytics();
  } catch {}
  return (
    <div className="page directory-page">
      <div className="eyebrow">GICS CLASSIFICATION ANALYTICS</div><h1>Targeted industries</h1>
      <div className="table-wrap" style={{marginTop:18}}>
        <table><thead><tr><th>Sector</th><th>Industry group</th><th>Industry</th><th>Sub-industry</th><th>Victims</th></tr></thead><tbody>
          {rows.length ? rows.map((row,index) => <tr key={index}><td>{row.gicsSectorName ?? "Unclassified"}</td><td>{row.gicsIndustryGroupName ?? "-"}</td><td>{row.gicsIndustryName ?? "-"}</td><td>{row.gicsSubIndustryName ?? "-"}</td><td>{row._count._all}</td></tr>) : <tr><td colSpan={5}>No GICS classifications available.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
