"use client";

import { useState } from "react";

export default function AdminWorkspace({
  authenticated,
}: {
  authenticated: boolean;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Login failed");
      window.location.reload();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.reload();
  }

  async function createVictim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      domain: String(form.get("domain") ?? "") || undefined,
      country: String(form.get("country") ?? "") || undefined,
      region: String(form.get("region") ?? "") || undefined,
      description: String(form.get("description") ?? "") || undefined,
      organisationType: String(form.get("organisationType") ?? "") || undefined,
      ransomwareGroup: String(form.get("ransomwareGroup") ?? "") || undefined,
      firstReportedAt: new Date(String(form.get("firstReportedAt"))).toISOString(),
      analyst: String(form.get("analyst") ?? ""),
      reason: String(form.get("reason") ?? ""),
      sourceName: "Manual analyst entry",
    };
    try {
      const response = await fetch("/api/admin/victims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Victim creation failed");
      setMessage(`Created canonical victim ${data.victim.name}`);
      event.currentTarget.reset();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Victim creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function runIngestion() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/ingest", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ingestion failed");
      setMessage(`Ingestion triggered: ${data.runs?.length ?? 0} source run(s)`);
    } catch (ingestionError) {
      setError(ingestionError instanceof Error ? ingestionError.message : "Ingestion failed");
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <main className="setup-state" style={{ maxWidth:420 }}>
        <div className="eyebrow">ANALYST AUTHENTICATION</div>
        <h1>Analyst sign in</h1>
        <form onSubmit={login} className="admin-form">
          <label>Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="search-button" type="submit" disabled={busy}>Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <aside className="admin-tools">
      <div className="topbar">
        <div>
          <div className="eyebrow">ANALYST SESSION</div>
          <h2>Operations</h2>
        </div>
        <button className="export-button" type="button" onClick={logout}>Sign out</button>
      </div>
      <div className="admin-actions">
        <button className="search-button" type="button" onClick={runIngestion} disabled={busy}>Run configured ingestion</button>
      </div>
      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <form className="admin-form" onSubmit={createVictim}>
        <h2>Create canonical victim</h2>
        <div className="admin-form-grid">
          <label>Organisation name<input name="name" required /></label>
          <label>Domain<input name="domain" placeholder="example.com" /></label>
          <label>Country<input name="country" /></label>
          <label>Region<input name="region" /></label>
          <label>Ransomware group<input name="ransomwareGroup" /></label>
          <label>First reported<input name="firstReportedAt" type="datetime-local" required /></label>
          <label>Organisation type<input name="organisationType" /></label>
          <label>Analyst name<input name="analyst" required /></label>
        </div>
        <label>Description<textarea name="description" rows={4} /></label>
        <label>Reason for manual entry<textarea name="reason" rows={3} required /></label>
        <button className="search-button" type="submit" disabled={busy}>Create victim</button>
      </form>
    </aside>
  );
}
