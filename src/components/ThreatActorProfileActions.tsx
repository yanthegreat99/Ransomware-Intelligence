"use client";

import { useState } from "react";

export default function ThreatActorProfileActions({ groupId }: { groupId: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshProfile() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/groups/${groupId}/refresh`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Profile refresh failed");
      setMessage(`Refreshed ${data.locations?.length ?? 0} associated location(s)`);
      window.location.reload();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Profile refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="search-button" type="button" onClick={refreshProfile} disabled={busy}>
        {busy ? "Refreshing..." : "Refresh RansomLook profile"}
      </button>
      {message ? <div className="form-success">{message}</div> : null}
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  );
}
