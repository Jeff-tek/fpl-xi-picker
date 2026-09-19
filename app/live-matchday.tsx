"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Bootstrap, FplPick, LiveElement } from "../lib/fpl";
import { asLiveStats, computeLivePoints, defconProgress } from "../lib/fpl";

interface FixtureState {
  team_h: number;
  team_a: number;
  started: boolean;
  finished: boolean;
}

interface StandingRow {
  entry: number;
  entry_name: string;
  player_name: string;
  rank: number;
  total: number;
}

const livePointsWithArmband = (
  picks: FplPick[],
  liveById: Map<number, ReturnType<typeof asLiveStats>>,
  typeById: Map<number, number>,
): { rows: Array<{ id: number; pts: number; mult: number }>; total: number } => {
  const cap = picks.find((p) => p.is_captain);
  const vice = picks.find((p) => p.is_vice_captain);
  const capMins = cap ? (liveById.get(cap.element)?.minutes ?? 0) : 0;
  const rows = picks.map((p) => {
    const st = liveById.get(p.element) ?? asLiveStats(null);
    let mult = p.multiplier ?? 1;
    if (cap && vice && capMins === 0) {
      if (p.element === vice.element) mult = 2;
      else if (p.element === cap.element) mult = 1;
    }
    const pts = computeLivePoints(st, (typeById.get(p.element) ?? 3) as 1 | 2 | 3 | 4) * mult;
    return { id: p.element, pts, mult };
  });
  return { rows, total: rows.reduce((a, r) => a + r.pts, 0) };
};

export default function LiveMatchday({ entryId, boot }: { entryId: string; boot: Bootstrap }) {
  const gw = useMemo(
    () =>
      boot.events.find((e) => e.is_current)?.id ??
      boot.events.find((e) => e.is_next)?.id ??
      boot.events[0]?.id,
    [boot],
  );
  const byId = useMemo(() => new Map(boot.elements.map((e) => [e.id, e])), [boot]);
  const teamsById = useMemo(() => new Map(boot.teams.map((t) => [t.id, t.short_name])), [boot]);

  const [live, setLive] = useState<LiveElement[] | null>(null);
  const [fixtures, setFixtures] = useState<FixtureState[] | null>(null);
  const [picks, setPicks] = useState<FplPick[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [leagueId, setLeagueId] = useState("");
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [leagueRows, setLeagueRows] = useState<Array<StandingRow & { livePts: number | null }> | null>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [liveJ, fixJ, picksJ] = await Promise.all([
        fetch(`/api/fpl/event/${gw}/live/`).then((r) => {
          if (!r.ok) throw new Error(`Live data unavailable (${r.status}).`);
          return r.json() as Promise<{ elements: LiveElement[] }>;
        }),
        fetch(`/api/fpl/fixtures/?event=${gw}`).then((r) =>
          r.ok ? (r.json() as Promise<FixtureState[]>) : [],
        ),
        fetch(`/api/fpl/entry/${entryId}/event/${gw}/picks/`).then((r) =>
          r.ok ? (r.json() as Promise<{ picks: FplPick[] }>) : null,
        ),
      ]);
      setLive(liveJ.elements);
      setFixtures(fixJ);
      setPicks(picksJ?.picks ?? null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live load failed.");
    } finally {
      setLoading(false);
    }
  }, [gw, entryId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [load]);

  const liveById = useMemo(() => {
    const m = new Map<number, ReturnType<typeof asLiveStats>>();
    (live ?? []).forEach((el) => m.set(el.id, asLiveStats(el.stats)));
    return m;
  }, [live]);
  const typeById = useMemo(() => new Map(boot.elements.map((e) => [e.id, e.element_type])), [boot]);

  const user = useMemo(
    () => (picks ? livePointsWithArmband(picks, liveById, typeById) : null),
    [picks, liveById, typeById],
  );

  const bonusWatch = useMemo(() => {
    if (!live || !fixtures) return [];
    const startedTeams = new Set<number>();
    fixtures.forEach((f) => {
      if (f.started) {
        startedTeams.add(f.team_h);
        startedTeams.add(f.team_a);
      }
    });
    const fixtureOf = (team: number): number =>
      fixtures.findIndex((f) => f.started && (f.team_h === team || f.team_a === team));
    return live
      .filter((el) => {
        const p = byId.get(el.id);
        return p && startedTeams.has(p.team) && asLiveStats(el.stats).minutes > 0;
      })
      .sort((a, b) => asLiveStats(b.stats).bps - asLiveStats(a.stats).bps)
      .slice(0, 8)
      .map((el) => {
        const p = byId.get(el.id);
        const st = asLiveStats(el.stats);
        const fx = fixtureOf(p?.team ?? -1);
        const inFixture = live
          .filter((o) => byId.get(o.id)?.team !== undefined && fixtureOf(byId.get(o.id)?.team ?? -2) === fx)
          .sort((a, b) => asLiveStats(b.stats).bps - asLiveStats(a.stats).bps);
        const rank = inFixture.findIndex((o) => o.id === el.id);
        return {
          id: el.id,
          name: p?.web_name ?? `#${el.id}`,
          team: teamsById.get(p?.team ?? -1) ?? "",
          bps: st.bps,
          bonus: st.bonus,
          proj: fx >= 0 && rank >= 0 && rank <= 2 ? 3 - rank : 0,
        };
      });
  }, [live, fixtures, byId, teamsById]);

  const defconWatch = useMemo(() => {
    if (!picks) return [];
    return picks
      .map((p) => {
        const el = byId.get(p.element);
        const st = liveById.get(p.element) ?? asLiveStats(null);
        const prog = defconProgress(st, el?.element_type ?? 3);
        return { id: p.element, name: el?.web_name ?? `#${p.element}`, ...prog, mins: st.minutes };
      })
      .filter((r) => r.mins > 0)
      .sort((a, b) => b.actions / b.threshold - a.actions / a.threshold)
      .slice(0, 6);
  }, [picks, liveById, byId]);

  const compareLeague = async (): Promise<void> => {
    const id = leagueId.trim();
    if (!id) return;
    setLeagueLoading(true);
    try {
      const r = await fetch(`/api/fpl/leagues-classic/${id}/standings/?page_standing=1`);
      if (!r.ok) throw new Error(`League not found (${r.status}).`);
      const j = (await r.json()) as {
        league: { name: string };
        standings: { results: StandingRow[] };
      };
      setLeagueName(j.league.name);
      const idx = j.standings.results.findIndex((s) => String(s.entry) === entryId);
      const group =
        idx >= 0
          ? j.standings.results.slice(Math.max(0, idx - 2), idx + 3)
          : j.standings.results.slice(0, 5);
      const settled = await Promise.allSettled(
        group.map(async (s) => {
          const pr = await fetch(`/api/fpl/entry/${s.entry}/event/${gw}/picks/`);
          if (!pr.ok) return { ...s, livePts: null as number | null };
          const pj = (await pr.json()) as { picks: FplPick[] };
          return { ...s, livePts: livePointsWithArmband(pj.picks, liveById, typeById).total };
        }),
      );
      setLeagueRows(
        settled
          .map((s) => (s.status === "fulfilled" ? s.value : null))
          .filter((x): x is StandingRow & { livePts: number | null } => x !== null)
          .sort((a, b) => (b.livePts ?? -1) - (a.livePts ?? -1)),
      );
    } catch (e) {
      setLeagueRows(null);
      setLeagueName(e instanceof Error ? e.message : "League load failed.");
    } finally {
      setLeagueLoading(false);
    }
  };

  const anyStarted = (fixtures ?? []).some((f) => f.started);

  return (
    <section className="line" aria-label="Live matchday">
      <h3>
        <span className="livedot" aria-hidden="true" />
        Live · GW{gw}
        {updatedAt ? ` · updated ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(updatedAt))}` : ""}
        <button type="button" className="toggle" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </h3>
      <div aria-live="polite">
        {error && <p className="alert" role="alert">{error}</p>}
        {!error && fixtures && !anyStarted && (
          <p className="bankline">No matches in progress right now — figures below are the last completed state. Auto-refreshes every minute.</p>
        )}
        {user && (
          <p className="bankline">
            Your live total: <strong>{user.total.toFixed(0)} pts</strong>
            {picks ? ` (${picks.length} players)` : ""}
          </p>
        )}
      </div>
      {bonusWatch.length > 0 && (
        <>
          <h4>Bonus watch · top BPS in live fixtures</h4>
          <div className="ticker-wrap">
            <table className="ticker">
              <thead>
                <tr><th scope="col">Player</th><th scope="col">BPS</th><th scope="col">Bonus</th><th scope="col">Proj</th></tr>
              </thead>
              <tbody>
                {bonusWatch.map((b) => (
                  <tr key={b.id}>
                    <th scope="row">{b.name} <span className="faint">{b.team}</span></th>
                    <td>{b.bps}</td>
                    <td>{b.bonus}</td>
                    <td>{b.proj > 0 ? `+${b.proj} likely` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {defconWatch.length > 0 && (
        <>
          <h4>DefCon watch · your squad</h4>
          <ol className="moves">
            {defconWatch.map((d) => (
              <li key={d.id}>
                <strong>{d.name}</strong> {d.actions}/{d.threshold}
                {d.reached ? <span className="flag-ok">+2 secured</span> : <span className="faint"> ({(d.threshold - d.actions)} to go)</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      <h4>Mini-league compare</h4>
      <div className="planform">
        <div className="field">
          <label className="field-label" htmlFor="league-id">Classic league ID</label>
          <input
            id="league-id"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder="e.g. 524637…"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button type="button" className="btn" disabled={leagueLoading || !leagueId.trim()} onClick={() => void compareLeague()}>
          {leagueLoading ? "Comparing…" : "Compare"}
        </button>
      </div>
      {leagueName && <p className="bankline">{leagueName}</p>}
      {leagueRows && (
        <div className="ticker-wrap">
          <table className="ticker">
            <thead>
              <tr><th scope="col">Manager</th><th scope="col">Overall</th><th scope="col">Live GW</th></tr>
            </thead>
            <tbody>
              {leagueRows.map((s) => (
                <tr key={s.entry} className={String(s.entry) === entryId ? "row-active" : undefined}>
                  <th scope="row">{s.player_name} <span className="faint">{s.entry_name}</span></th>
                  <td>{s.total.toLocaleString("en-GB")}</td>
                  <td>{s.livePts === null ? "—" : s.livePts.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="bankline">Estimates only — bonus stays provisional until matches end, DefCon counts are from live event data.</p>
    </section>
  );
}
