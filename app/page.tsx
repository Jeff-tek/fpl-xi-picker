"use client";

import { useEffect, useState } from "react";
import type { Bootstrap, FplElement, FplFixture, FplPick, UnderstatPlayer } from "../lib/fpl";
import { matchUnderstat, shirtUrl, xPtsFor } from "../lib/fpl";
import type { Scored } from "../lib/select";
import {
  isDifferential,
  isHitWorthIt,
  pickCaptaincy,
  pickCaptaincyTop3,
  pickXi,
  rateTeam,
  scorePlayer,
  summarizeXi,
} from "../lib/select";
import TransferPlanner from "./transfer-planner";
import LiveMatchday from "./live-matchday";

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

const TABS = [
  { id: "xi", label: "Best XI" },
  { id: "captain", label: "Captain" },
  { id: "fixtures", label: "Fixtures" },
  { id: "prices", label: "Prices" },
  { id: "planner", label: "Planner" },
  { id: "live", label: "Live" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface EntryTransfer {
  element_in: number;
  element_out: number;
  event: number;
}

const scoreLabel = (s: number): string =>
  Number.isFinite(s) ? s.toFixed(1) : "—";

const countdownLabel = (deadlineIso: string, now: number): string => {
  const ms = new Date(deadlineIso).getTime() - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "Deadline passed — lineups locked";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const parts = [
    d > 0 ? `${d}d` : null,
    `${h}h`,
    `${m}m`,
  ].filter((x): x is string => x !== null);
  return `Deadline in ${new Intl.ListFormat("en", { style: "narrow" }).format(parts)}`;
};

function DeadlineCountdown() {
  const [next, setNext] = useState<{ id: number; deadline_time: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    fetch("/api/fpl/bootstrap-static/")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j) return;
        const ev = (j.events as Array<{ id: number; is_next: boolean; deadline_time: string }>).find((e) => e.is_next);
        if (ev) setNext({ id: ev.id, deadline_time: ev.deadline_time });
      })
      .catch(() => undefined);
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  if (!next) return null;
  return (
    <p className="deadline" role="status">
      <span className="livedot" aria-hidden="true" />
      GW{next.id} · {countdownLabel(next.deadline_time, now)}
    </p>
  );
}

const fdrClass = (diff: number | null): string =>
  diff === null ? "fdr-none" : `fdr-${diff}`;

const fixtureLabel = (p: Scored): string =>
  p.diff === null
    ? "No fixture"
    : `${p.home ? "H" : "A"} vs ${p.opp} · FDR ${p.diff}`;

interface EntryHistory {
  current?: Array<{
    bank?: number;
    event_transfers?: number;
    event_transfers_cost?: number;
    points?: number;
  }>;
}

interface PriceMove {
  name: string;
  teamName: string;
  priceM: number;
  net: number;
}

const netTransfers = (el: FplElement): number => {
  const rec = el as unknown as Record<string, unknown>;
  const inn = typeof rec.transfers_in_event === "number" ? rec.transfers_in_event : 0;
  const out = typeof rec.transfers_out_event === "number" ? rec.transfers_out_event : 0;
  return inn - out;
};

const priceWatch = (boot: Bootstrap, teamsById: Map<number, string>): { risers: PriceMove[]; fallers: PriceMove[] } => {
  const moves = boot.elements.map((el) => ({
    name: el.web_name,
    teamName: teamsById.get(el.team) ?? "",
    priceM: el.now_cost / 10,
    net: netTransfers(el),
  }));
  const sorted = [...moves].sort((a, b) => b.net - a.net);
  return { risers: sorted.slice(0, 5), fallers: sorted.slice(-5).reverse() };
};

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
  diff = false,
}: {
  p: Scored;
  isCaptain: boolean;
  isVice: boolean;
  diff?: boolean;
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
        {diff && <span className="badge badge-diff">DIFF</span>}
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
  const [teamQuery, setTeamQuery] = useState("");
  const [diffOnly, setDiffOnly] = useState(false);
  const [tab, setTab] = useState<TabId>("xi");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    gw: number;
    xi: ReturnType<typeof pickXi>;
    bench: ReturnType<typeof pickXi>;
    squad: ReturnType<typeof pickXi>;
    captain: number;
    vice: number;
    top3: ReturnType<typeof pickXi>;
    verdict: string[];
    rating: { rate: number; grade: string };
    gwIds: number[];
    gwFixtures: FplFixture[][];
    teamsById: Map<number, string>;
    boot: Bootstrap;
    history: EntryHistory | null;
    transfers: EntryTransfer[] | null;
    usedXpts: boolean;
    entryId: string;
  } | null>(null);

  const resolveEntryId = async (id: string, q: string, boot: Bootstrap): Promise<string> => {
    if (id) return id;
    try {
      const r = await fetch(`/api/fpl-search?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        const body = (await r.json()) as { id?: number };
        if (typeof body.id === "number") return String(body.id);
      }
    } catch {
      // fall through to client-side match
    }
    const ql = q.toLowerCase();
    const hit = boot.elements.find(
      (e) =>
        e.web_name.toLowerCase().includes(ql) ||
        `${e.first_name} ${e.second_name}`.toLowerCase().includes(ql),
    );
    if (hit) throw new Error(`"${q}" matched player ${hit.web_name} — enter your numeric Entry ID (My Team → URL number), not a player name.`);
    throw new Error(`Team search unavailable — enter your numeric Entry ID directly.`);
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const id = entryId.trim();
      const q = teamQuery.trim();
      if (!id && !q) throw new Error("Enter your FPL Entry ID or a team name.");
      const boot = await get<Bootstrap>("bootstrap-static/");
      const resolvedId = await resolveEntryId(id, q, boot);
      const next =
        boot.events.find((e) => e.is_next) ??
        boot.events.find((e) => e.is_current) ??
        boot.events[0];
      const fixtures = await get<FplFixture[]>("fixtures/?event=" + next.id);
      const picks = await get<{ picks: FplPick[] }>(
        `entry/${resolvedId}/event/${next.id}/picks/`,
      ).catch(async () => {
        const cur = boot.events.find((e) => e.is_current);
        if (!cur || cur.id === next.id) throw new Error("Picks not available for this Entry ID / gameweek.");
        return get<{ picks: FplPick[] }>(`entry/${resolvedId}/event/${cur.id}/picks/`);
      });
      const byId = new Map(boot.elements.map((e) => [e.id, e]));
      const teamsById = new Map(boot.teams.map((t) => [t.id, t.short_name]));
      const codesById = new Map(boot.teams.map((t) => [t.id, t.code]));
      const gwIds = [next.id, next.id + 1, next.id + 2, next.id + 3, next.id + 4];
      const [gwFixtures, history, understat, transfers] = await Promise.all([
        Promise.all(gwIds.map((g) => get<FplFixture[]>(`fixtures/?event=${g}`).catch(() => [] as FplFixture[]))),
        (async (): Promise<EntryHistory | null> => {
          try {
            const r = await fetch(`/api/fpl/entry/${resolvedId}/history/`);
            if (!r.ok) return null;
            return (await r.json()) as EntryHistory;
          } catch {
            return null;
          }
        })(),
        (async (): Promise<UnderstatPlayer[] | null> => {
          try {
            const r = await fetch("/api/understat?season=2024");
            if (!r.ok) return null;
            const j = (await r.json()) as Record<string, UnderstatPlayer[]>;
            const first = Object.values(j)[0];
            return Array.isArray(first) ? (Object.values(j).flat() as UnderstatPlayer[]) : null;
          } catch {
            return null;
          }
        })(),
        (async (): Promise<EntryTransfer[] | null> => {
          try {
            const r = await fetch(`/api/fpl/entry/${resolvedId}/transfers/`);
            if (!r.ok) return null;
            return (await r.json()) as EntryTransfer[];
          } catch {
            return null;
          }
        })(),
      ]);
      const usedXpts = Array.isArray(understat) && understat.length > 0;
      const squad = picks.picks.flatMap((p) => {
        const el = byId.get(p.element);
        if (!el) return [];
        const s = scorePlayer(el, fixtures, next.id, teamsById, codesById);
        if (usedXpts) {
          const u = matchUnderstat(el, understat as UnderstatPlayer[]);
          const xp = xPtsFor(el, u, s.ease, s.avail);
          if (Number.isFinite(xp)) {
            const blended = s.score * 0.5 + xp * 0.5;
            return [{ ...s, score: s.score === -Infinity ? s.score : blended, reasons: u ? [...s.reasons, `xP blend ${(xp as number).toFixed(1)} (Understat npxG/xA).`] : s.reasons }];
          }
        }
        return [s];
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
        squad,
        captain: captain.id,
        vice: vice.id,
        top3: pickCaptaincyTop3(xi),
        verdict: summarizeXi(xi, captain, vice),
        rating: rateTeam(xi, squad),
        gwIds,
        gwFixtures,
        teamsById,
        boot,
        history,
        transfers,
        usedXpts,
        entryId: resolvedId,
      });
      setTab("xi");
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
        <p>Free FPL API + Understat only. Next 5 gameweeks. Blended xP, not bookmaker odds.</p>
        <DeadlineCountdown />
      </header>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void analyze();
        }}
      >
        <a className="skip" href="#results">Skip to results</a>
        <div className="field">
          <label className="field-label" htmlFor="entry-id">
            FPL Entry ID
          </label>
          <input
            id="entry-id"
            name="entry-id"
            value={entryId}
            onChange={(e) => setEntryId(e.target.value)}
            placeholder="e.g. 1330334…"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="team-query">
            Team name (fallback)
          </label>
          <input
            id="team-query"
            name="team-query"
            value={teamQuery}
            onChange={(e) => setTeamQuery(e.target.value)}
            placeholder="e.g. Arsenal — ID preferred…"
            autoComplete="off"
            spellCheck={false}
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
          id="results"
          className="results"
          aria-label={`Gameweek ${result.gw} best XI`}
        >
          <h2 className="gw-title">Gameweek {result.gw} — Best XI</h2>
          <nav className="tabs" role="tablist" aria-label="Analysis sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tab${tab === t.id ? " tab--active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {tab === "xi" && (
            <>
          <PitchView
            xi={result.xi}
            captain={result.captain}
            vice={result.vice}
          />
          <section className="verdict" aria-label="Standout pick">
            <h3>Standout pick</h3>
            <p>{result.verdict.join(" ")}</p>
          </section>
          <section className="verdict" aria-label="Team rating">
            <h3>
              Squad rating · {result.rating.grade} ({result.rating.rate}/99)
              {result.usedXpts ? " · xP blend on" : " · heuristic (Understat offline)"}
            </h3>
            <div className="ratebar" role="img" aria-label={`Rated ${result.rating.rate} out of 99`}>
              <div className="ratebar-fill" style={{ width: `${result.rating.rate}%` }} />
            </div>
          </section>
            </>
          )}
          {tab === "captain" && (
          <section className="line" aria-label="Captain ranking">
            <h3>Armband ranking · top 3</h3>
            <ol className="grid">
              {result.top3.map((p, i) => {
                const gap = i < result.top3.length - 1 ? p.score - result.top3[i + 1].score : 0;
                return (
                  <li key={p.id} className={`card${i === 0 ? " card--captain" : i === 1 ? " card--vice" : ""}`}>
                    <div className="card-head">
                      <span className={`badge${i === 0 ? " badge-c" : i === 1 ? " badge-vc" : " badge-vc"}`}>
                        {i === 0 ? "C" : i === 1 ? "VC" : "3rd"}
                      </span>
                      <span className="card-name">{p.name}</span>
                      <span className="card-team">{p.teamName}</span>
                      <span className="card-score">{scoreLabel(p.score)}</span>
                    </div>
                    <div className="chips">
                      <span className={`pill-fdr ${fdrClass(p.diff)}`}>{fixtureLabel(p)}</span>
                      {isDifferential(p, result.xi) && <span className="badge badge-diff">DIFF</span>}
                      {i < result.top3.length - 1 && <span className="chip">+{gap.toFixed(1)} vs next</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          )}
          {tab === "fixtures" && (
          <section className="line" aria-label="Fixture ticker">
            <h3>Next 5 fixtures</h3>
            <div className="ticker-wrap">
              <table className="ticker">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    {result.gwIds.map((g) => (
                      <th key={g} scope="col">GW{g}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(result.squad.map((s) => s.team))]
                    .map((t) => ({ t, label: result.teamsById.get(t) ?? `T${t}` }))
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map(({ t, label }) => (
                      <tr key={t}>
                        <th scope="row">{label}</th>
                        {result.gwIds.map((g, i) => {
                          const f = (result.gwFixtures[i] ?? []).find(
                            (x) => x.event === g && (x.team_h === t || x.team_a === t),
                          );
                          if (!f) return <td key={g}>—</td>;
                          const home = f.team_h === t;
                          const opp = result.teamsById.get(home ? f.team_a : f.team_h) ?? "?";
                          const diff = home ? f.team_h_difficulty : f.team_a_difficulty;
                          return (
                            <td key={g}>
                              <span className={`pill-fdr ${fdrClass(diff)}`}>
                                {home ? "H" : "A"} {opp} {diff}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          )}
          {tab === "xi" && (
            <>
          {[1, 2, 3, 4].map((t) => {
            const players = result.xi.filter((p) => p.type === t);
            if (players.length === 0) return null;
            const shown = diffOnly ? players.filter((p) => isDifferential(p, result.xi)) : players;
            if (diffOnly && shown.length === 0) return null;
            return (
              <div className="line" key={t}>
                <h3>
                  {LINES[t]} · {shown.length}
                  <button type="button" className="toggle" onClick={() => setDiffOnly((v) => !v)} aria-pressed={diffOnly}>
                    {diffOnly ? "Show all" : "Differentials only"}
                  </button>
                </h3>
                <ol className="grid">
                  {shown.map((p) => (
                    <PlayerCard
                      key={p.id}
                      p={p}
                      isCaptain={p.id === result.captain}
                      isVice={p.id === result.vice}
                      diff={isDifferential(p, result.xi)}
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
            </>
          )}
          {tab === "prices" && (
            <>
          {(() => {
            const { risers, fallers } = priceWatch(result.boot, result.teamsById);
            const cur = result.history?.current?.[result.history.current.length - 1];
            const bank = typeof cur?.bank === "number" ? cur.bank / 10 : null;
            const transfers = cur?.event_transfers ?? null;
            const cost = cur?.event_transfers_cost ?? null;
            const hits = typeof cost === "number" ? cost / 4 : null;
            const gain =
              typeof cur?.points === "number"
                ? result.xi.reduce((s, p) => s + p.score, 0) - cur.points
                : null;
            const worth = hits !== null ? isHitWorthIt(hits, gain) : null;
            return (
              <>
                <div className="line">
                  <h3>Price watch · net transfers this GW</h3>
                  <div className="split">
                    <div>
                      <h4>Risers</h4>
                      <ol className="moves">
                        {risers.map((m) => (
                          <li key={m.name}>
                            <strong>{m.name}</strong> {m.teamName} · £{m.priceM.toFixed(1)}m · +{m.net.toLocaleString()}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <h4>Fallers</h4>
                      <ol className="moves">
                        {fallers.map((m) => (
                          <li key={m.name}>
                            <strong>{m.name}</strong> {m.teamName} · £{m.priceM.toFixed(1)}m · {m.net.toLocaleString()}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
                <div className="line">
                  <h3>Bank &amp; hits</h3>
                  <p className="bankline">
                    {bank !== null ? `£${bank.toFixed(1)}m in bank` : "Bank unknown (history offline)"}
                    {transfers !== null ? ` · ${transfers} transfers` : ""}
                    {hits !== null && hits > 0 ? ` · ${hits} hits (−${hits * 4} pts)` : " · no hits"}
                    {worth === true ? " · hits look worth it" : worth === false ? ` · hits pay off only above +${(hits as number) * 4} pts` : ""}
                  </p>
                </div>
              </>
            );
          })()}
            </>
          )}
          {tab === "planner" && (
          <TransferPlanner
            boot={result.boot}
            initialSquadIds={result.squad.map((s) => s.id)}
            bank={(() => {
              const cur = result.history?.current?.[result.history.current.length - 1];
              return typeof cur?.bank === "number" ? cur.bank / 10 : null;
            })()}
            transfers={result.transfers}
            gwIds={result.gwIds.slice(0, 3)}
            gwFixtures={result.gwFixtures.slice(0, 3)}
          />
          )}
          {tab === "live" && (
            <LiveMatchday entryId={result.entryId} boot={result.boot} />
          )}
        </section>
      )}
    </main>
  );
}