"use client";

import { useState } from "react";
import type { Bootstrap, FplFixture, FplPick } from "../lib/fpl";
import type { Scored } from "../lib/select";
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

const LINES: Record<number, string> = {
  1: "Goalkeepers",
  2: "Defenders",
  3: "Midfielders",
  4: "Forwards",
};

const scoreLabel = (s: number): string =>
  Number.isFinite(s) ? s.toFixed(1) : "—";

const fdrClass = (diff: number | null): string =>
  diff === null ? "fdr-none" : `fdr-${diff}`;

const fixtureLabel = (p: Scored): string =>
  p.diff === null
    ? "No fixture"
    : `${p.home ? "H" : "A"} vs ${p.opp} · FDR ${p.diff}`;

function PlayerCard({
  p,
  isCaptain,
  isVice,
}: {
  p: Scored;
  isCaptain: boolean;
  isVice: boolean;
}) {
  return (
    <li
      className={`card${isCaptain ? " card--captain" : isVice ? " card--vice" : ""}`}
    >
      <div className="card-head">
        {isCaptain && <span className="badge badge-c">C</span>}
        {isVice && <span className="badge badge-vc">VC</span>}
        <span className="card-name">{p.name}</span>
        <span className="card-team">{p.teamName}</span>
        <span className="card-score">{scoreLabel(p.score)}</span>
      </div>
      <div className="chips">
        <span className="chip">
          £<strong>{p.price.toFixed(1)}m</strong>
        </span>
        <span className="chip">
          <strong>{p.selectedPct.toFixed(1)}%</strong> owned
        </span>
        <span className="chip">
          Form <strong>{p.form.toFixed(1)}</strong>
        </span>
        <span className="chip">
          PPG <strong>{p.ppg.toFixed(1)}</strong>
        </span>
        <span className="chip">
          xGI <strong>{p.xgi.toFixed(2)}</strong>
        </span>
        <span className="chip">
          ICT <strong>{p.ict.toFixed(1)}</strong>
        </span>
        <span className={`pill-fdr ${fdrClass(p.diff)}`}>
          {fixtureLabel(p)}
        </span>
        {p.avail < 1 && p.avail > 0 && (
          <span className="flag-warn">{Math.round(p.avail * 100)}%</span>
        )}
        {p.avail === 0 && <span className="flag-out">Ruled out</span>}
      </div>
      <ul className="reasons">
        {p.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </li>
  );
}

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
    <main className="main">
      <header className="header">
        <h1>FPL Team Analysis</h1>
        <p>Free FPL API only. Next gameweek. Heuristic scores, not true xP.</p>
      </header>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void analyze();
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="entry-id">
            FPL Entry ID
          </label>
          <input
            id="entry-id"
            value={entryId}
            onChange={(e) => setEntryId(e.target.value)}
            placeholder="e.g. 1330334"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      {loading && (
        <p className="status" role="status">
          Fetching squad and fixtures…
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !result && (
        <p className="hint">
          Enter your FPL Entry ID to see the best XI for the next gameweek,
          with captain and vice-captain picks.
        </p>
      )}

      {result && (
        <section
          className="results"
          aria-label={`Gameweek ${result.gw} best XI`}
        >
          <h2 className="gw-title">Gameweek {result.gw} — Best XI</h2>
          {[1, 2, 3, 4].map((t) => {
            const players = result.xi.filter((p) => p.type === t);
            if (players.length === 0) return null;
            return (
              <div className="line" key={t}>
                <h3>
                  {LINES[t]} · {players.length}
                </h3>
                <ol className="grid">
                  {players.map((p) => (
                    <PlayerCard
                      key={p.id}
                      p={p}
                      isCaptain={p.id === result.captain}
                      isVice={p.id === result.vice}
                    />
                  ))}
                </ol>
              </div>
            );
          })}
          {result.bench.length > 0 && (
            <div className="line">
              <h3>Bench · {result.bench.length}</h3>
              <ol className="bench">
                {result.bench.map((p) => (
                  <li key={p.id}>
                    <strong>{p.name}</strong> {p.teamName}
                    {p.avail < 1 && p.avail > 0 && (
                      <span className="flag-warn">
                        {Math.round(p.avail * 100)}%
                      </span>
                    )}
                    {p.avail === 0 && (
                      <span className="flag-out">Ruled out</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </main>
  );
}