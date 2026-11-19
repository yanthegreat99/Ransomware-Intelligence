import { cookies } from "next/headers";
import AdminWorkspace from "@/components/AdminWorkspace";
import AdminConsole from "@/components/AdminConsole";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const authenticated = verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!authenticated) {
    return (
      <div className="page admin-page">
        <div className="eyebrow">PROTECTED ANALYST WORKSPACE</div><h1>Review and administration</h1>
        <AdminWorkspace authenticated={false} />
      </div>
    );
  }
  return (
    <div className="page admin-page">
      <AdminConsole />
    </div>
  );
}
