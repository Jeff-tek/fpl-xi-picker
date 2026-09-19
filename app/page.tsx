"use client";

import { useState } from "react";
import type { Bootstrap, FplFixture, FplPick } from "../lib/fpl";
import { shirtUrl } from "../lib/fpl";
import type { Scored } from "../lib/select";
import { pickCaptaincy, pickXi, scorePlayer, summarizeXi } from "../lib/select";

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

// Official FPL 66px shirt PNG with an initial-letter CSS fallback.
function Shirt({
  teamCode,
  teamName,
  isGk,
  className,
}: {
  teamCode: number;
  teamName: string;
  isGk: boolean;
  className: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span
      className={`${className}${loaded ? " shirt--loaded" : ""}`}
      data-initial={teamName.charAt(0)}
    >
      <img
        src={shirtUrl(teamCode, isGk)}
        alt={`${teamName} shirt`}
        width={66}
        height={66}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          e.currentTarget.hidden = true;
        }}
      />
    </span>
  );
}

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
        <Shirt
          className="card-shirt"
          teamCode={p.teamCode}
          teamName={p.teamName}
          isGk={p.type === 1}
        />
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

const PITCH_ROWS: ReadonlyArray<{
  type: number;
  label: string;
  cls: string;
}> = [
  { type: 4, label: "Forwards", cls: "pitch-row--fwd" },
  { type: 3, label: "Midfielders", cls: "pitch-row--mid" },
  { type: 2, label: "Defenders", cls: "pitch-row--def" },
  { type: 1, label: "Goalkeeper", cls: "pitch-row--gkp" },
];

// FPL carries no left/right/centre data — spread by score, best in the middle.
const spread = (players: Scored[]): Scored[] => {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const out: Scored[] = [];
  sorted.forEach((p, i) => {
    if (i % 2 === 0) out.push(p);
    else out.unshift(p);
  });
  return out;
};

const formationLabel = (xi: Scored[]): string => {
  const count = (t: number) => xi.filter((p) => p.type === t).length;
  return `${count(2)}-${count(3)}-${count(4)}`;
};

function PitchMarker({
  p,
  isCaptain,
  isVice,
}: {
  p: Scored;
  isCaptain: boolean;
  isVice: boolean;
}) {
  return (
    <li className="pitch-slot">
      <button
        type="button"
        className={`pitch-marker${isCaptain ? " pitch-marker--captain" : isVice ? " pitch-marker--vice" : ""}`}
        title={`${p.name} · ${p.teamName} · ${fixtureLabel(p)} · ${scoreLabel(p.score)} pts`}
      >
        <Shirt
          className="pitch-marker-shirt"
          teamCode={p.teamCode}
          teamName={p.teamName}
          isGk={p.type === 1}
        />
        <span className="pitch-marker-name">
          {isCaptain && <span className="badge badge-c">C</span>}
          {isVice && <span className="badge badge-vc">VC</span>}
          <span className="pitch-marker-label">{p.name}</span>
        </span>
        <span className="pitch-marker-score">{scoreLabel(p.score)}</span>
      </button>
    </li>
  );
}

function PitchView({
  xi,
  captain,
  vice,
}: {
  xi: Scored[];
  captain: number;
  vice: number;
}) {
  return (
    <figure className="pitch-figure">
      <figcaption className="pitch-caption">
        Formation · {formationLabel(xi)}
      </figcaption>
      <div className="pitch">
        <div className="pitch-halfway" aria-hidden="true" />
        <div className="pitch-circle" aria-hidden="true" />
        <div className="pitch-spot" aria-hidden="true" />
        <div className="pitch-box pitch-box--top" aria-hidden="true" />
        <div className="pitch-box pitch-box--bottom" aria-hidden="true" />
        <div className="pitch-goal pitch-goal--top" aria-hidden="true" />
        <div className="pitch-goal pitch-goal--bottom" aria-hidden="true" />
        {PITCH_ROWS.map((row) => {
          const players = spread(xi.filter((p) => p.type === row.type));
          if (players.length === 0) return null;
          return (
            <ol
              className={`pitch-row ${row.cls}`}
              aria-label={row.label}
              key={row.type}
            >
              {players.map((p) => (
                <PitchMarker
                  key={p.id}
                  p={p}
                  isCaptain={p.id === captain}
                  isVice={p.id === vice}
                />
              ))}
            </ol>
          );
        })}
      </div>
    </figure>
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
    verdict: string[];
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
      const codesById = new Map(boot.teams.map((t) => [t.id, t.code]));
      const squad = picks.picks.flatMap((p) => {
        const el = byId.get(p.element);
        return el ? [scorePlayer(el, fixtures, next.id, teamsById, codesById)] : [];
      });
      const xi = pickXi(squad);
      if (xi.length === 0) throw new Error("Could not form a legal XI from this squad.");
      const xiIds = new Set(xi.map((s) => s.id));
      const bench = squad
        .filter((s) => !xiIds.has(s.id))
        .sort((a, b) => b.score - a.score);
      const { captain, vice } = pickCaptaincy(xi);
      setResult({
        gw: next.id,
        xi,
        bench,
        captain: captain.id,
        vice: vice.id,
        verdict: summarizeXi(xi, captain, vice),
      });
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
          <section className="verdict" aria-label="Standout pick">
            <h3>Standout pick</h3>
            <p>{result.verdict.join(" ")}</p>
          </section>
          <PitchView
            xi={result.xi}
            captain={result.captain}
            vice={result.vice}
          />
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