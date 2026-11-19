import DashboardClient from "@/components/DashboardClient";
import { getDashboardRange, loadDashboardData } from "@/lib/dashboard-data";
import type { DashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  let data: DashboardData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadDashboardData(getDashboardRange({ range: "30d" }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown database error";
  }
  if (loadError || !data) {
    return (
      <main className="setup-state">
        <div className="eyebrow">SYSTEM INITIALIZATION</div>
        <h1>Database connection required</h1>
        <p>Configure <code>DATABASE_URL</code> and run the Prisma migration to load real ransomware intelligence.</p>
        <pre>{loadError ?? "Dashboard data was unavailable."}</pre>
      </main>
    );
  }
  return <DashboardClient initialData={data} />;
}
