"use client";

import { useState } from "react";
import type { Bootstrap, FplFixture, FplPick } from "../lib/fpl";
import { pickCaptaincy, pickXi, scorePlayer } from "../lib/select";

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(`/api/fpl/${path}`);
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Failed ${path}: ${r.status}`);
  }
  return r.json() as Promise<T>;
};

export default function Home() {
  const [entryId, setEntryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    gw: number;
    xi: ReturnType<typeof pickXi>;
    bench: ReturnType<typeof pickXi>;
    captain: number;
    vice: number;
  } | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const id = entryId.trim();
      if (!id) throw new Error("Enter your FPL Entry ID.");
      const boot = await get<Bootstrap>("bootstrap-static/");
      const next =
        boot.events.find((e) => e.is_next) ??
        boot.events.find((e) => e.is_current) ??
        boot.events[0];
      const fixtures = await get<FplFixture[]>("fixtures/?event=" + next.id);
      const picks = await get<{ picks: FplPick[] }>(
        `entry/${id}/event/${next.id}/picks/`,
      ).catch(async () => {
        const cur = boot.events.find((e) => e.is_current);
        if (!cur || cur.id === next.id) throw new Error("Picks not available for this Entry ID / gameweek.");
        return get<{ picks: FplPick[] }>(`entry/${id}/event/${cur.id}/picks/`);
      });
      const byId = new Map(boot.elements.map((e) => [e.id, e]));
      const teamsById = new Map(boot.teams.map((t) => [t.id, t.short_name]));
      const squad = picks.picks.flatMap((p) => {
        const el = byId.get(p.element);
        return el ? [scorePlayer(el, fixtures, next.id, teamsById)] : [];
      });
      const xi = pickXi(squad);
      if (xi.length === 0) throw new Error("Could not form a legal XI from this squad.");
      const xiIds = new Set(xi.map((s) => s.id));
      const bench = squad
        .filter((s) => !xiIds.has(s.id))
        .sort((a, b) => b.score - a.score);
      const { captain, vice } = pickCaptaincy(xi);
      setResult({ gw: next.id, xi, bench, captain: captain.id, vice: vice.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>FPL Team Analysis</h1>
      <p>Free FPL API only. Next gameweek. Heuristic scores, not true xP.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={entryId}
          onChange={(e) => setEntryId(e.target.value)}
          placeholder="FPL Entry ID (e.g. 1330334)"
          inputMode="numeric"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={analyze} disabled={loading}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {result && (
        <section>
          <h2>Gameweek {result.gw} — Best XI</h2>
          <ol>
            {result.xi.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                {p.id === result.captain && " (C)"}
                {p.id === result.vice && " (VC)"}
                <ul>
                  {p.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <h3>Bench (in order)</h3>
          <ol>
            {result.bench.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
