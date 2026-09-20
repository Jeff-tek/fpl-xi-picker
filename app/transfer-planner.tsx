"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bootstrap, FplFixture } from "../lib/fpl";
import { price as fplPrice } from "../lib/fpl";
import type { Scored } from "../lib/select";
import { pickCaptaincy, pickXi, scorePlayer } from "../lib/select";
import { buildSuggestions, crowdTop11 } from "../lib/suggest";

const CHIPS = ["—", "WC", "FH", "BB", "TC"] as const;

interface EntryTransfer {
  element_in: number;
  element_out: number;
  event: number;
}

interface Props {
  boot: Bootstrap;
  initialSquadIds: number[];
  bank: number | null;
  transfers: EntryTransfer[] | null;
  gwIds: number[];
  gwFixtures: FplFixture[][];
  entryId: string;
}

interface PlannedTransfer {
  gw: number;
  out: number;
  inn: number;
}

const priceM = (id: number, byId: Map<number, Bootstrap["elements"][number]>): number => {
  const el = byId.get(id);
  return el ? fplPrice(el) : 0;
};

const webName = (id: number, byId: Map<number, Bootstrap["elements"][number]>): string =>
  byId.get(id)?.web_name ?? `#${id}`;

export default function TransferPlanner({ boot, initialSquadIds, bank, transfers, gwIds, gwFixtures, entryId }: Props) {
  const byId = useMemo(() => new Map(boot.elements.map((e) => [e.id, e])), [boot]);
  const teamsById = useMemo(() => new Map(boot.teams.map((t) => [t.id, t.short_name])), [boot]);
  const codesById = useMemo(() => new Map(boot.teams.map((t) => [t.id, t.code])), [boot]);

  const [squadIds, setSquadIds] = useState<number[]>(initialSquadIds);
  const [funds, setFunds] = useState<number>(bank ?? 0);
  const [fts, setFts] = useState(1);
  const [hits, setHits] = useState(0);
  const [log, setLog] = useState<PlannedTransfer[]>([]);
  const [activeGw, setActiveGw] = useState(0);
  const [outSel, setOutSel] = useState("");
  const [inSel, setInSel] = useState("");
  const [chips, setChips] = useState<Record<number, string>>({});
  const [sellPrice, setSellPrice] = useState<number | null>(null);
  const [sellById, setSellById] = useState<Map<number, number>>(new Map());

  const horizon = [0, 1, 2].filter((i) => gwIds[i] !== undefined);

  const scoredPerGw = useMemo(
    () =>
      horizon.map((i) =>
        squadIds.flatMap((id) => {
          const el = byId.get(id);
          return el ? [scorePlayer(el, gwFixtures[i] ?? [], gwIds[i], teamsById, codesById)] : [];
        }),
      ),
    [horizon, squadIds, byId, gwFixtures, gwIds, teamsById, codesById],
  );

  const xiPerGw = useMemo(() => scoredPerGw.map((s) => pickXi(s)), [scoredPerGw]);
  const totals = useMemo(
    () => xiPerGw.map((xi) => xi.reduce((s, p) => s + (Number.isFinite(p.score) ? p.score : 0), 0)),
    [xiPerGw],
  );
  const grandTotal = totals.reduce((a, b) => a + b, 0) - hits * 4;

  const outId = outSel ? Number(outSel) : NaN;
  const outEl = byId.get(outId);

  useEffect(() => {
    setSellPrice(null);
    if (!outEl) return;
    let live = true;
    const current = outEl.now_cost;
    const run = async (): Promise<void> => {
      if (entryId) {
        try {
          const r = await fetch(
            `/api/fpl/selling-price?entryId=${encodeURIComponent(entryId)}&elementId=${outEl.id}&currentCost=${current}`,
          );
          if (r.ok) {
            const j = (await r.json()) as { sell?: number };
            if (live && typeof j.sell === "number") {
              setSellPrice(j.sell / 10);
              return;
            }
          }
        } catch {
          // fallback
        }
      }
      try {
        const r = await fetch(`/api/fpl/element-summary/${outEl.id}/`);
        const j = r.ok ? ((await r.json()) as { history?: Array<{ round?: number; event?: number; value: number }> }) : null;
        if (!live || !j) return;
        const boughtEvent = (() => {
          const buys = (transfers ?? []).filter((t) => t.element_in === outEl.id);
          return buys.length > 0 ? Math.max(...buys.map((t) => t.event)) : 1;
        })();
        const hist = j.history ?? [];
        const bought =
          hist.find((h) => (h.round ?? h.event) === boughtEvent)?.value ??
          hist.find((h) => (h.round ?? 999) <= boughtEvent)?.value ??
          current;
        const sell = current <= bought ? current : bought + Math.floor((current - bought) / 2);
        setSellPrice(sell / 10);
      } catch {
        if (live) setSellPrice(null);
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [outEl, transfers, entryId]);

  const proceeds = sellPrice ?? (outEl ? fplPrice(outEl) : 0);
  const budget = outEl ? proceeds + funds : funds;

  const candidates: Scored[] = useMemo(() => {
    if (!outEl || !gwFixtures[activeGw]) return [];
    const owned = new Set(squadIds);
    return boot.elements
      .filter((e) => e.element_type === outEl.element_type && !owned.has(e.id) && fplPrice(e) <= budget + 1e-9)
      .flatMap((e) => [scorePlayer(e, gwFixtures[activeGw] ?? [], gwIds[activeGw], teamsById, codesById)])
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [outEl, boot, squadIds, budget, gwFixtures, activeGw, gwIds, teamsById, codesById]);

  const bankM = funds;
  const suggestions = useMemo(
    () => buildSuggestions(squadIds, boot, gwFixtures, gwIds, teamsById, codesById, sellById, bankM, activeGw),
    [squadIds, boot, gwFixtures, gwIds, teamsById, codesById, sellById, bankM, activeGw],
  );
  const crowd = useMemo(() => crowdTop11(boot), [boot]);

  useEffect(() => {
    if (!entryId || squadIds.length === 0) return;
    const weakIds = buildSuggestions(squadIds, boot, gwFixtures, gwIds, teamsById, codesById, new Map(), bankM, activeGw)
      .map((s) => s.outId)
      .slice(0, 4);
    const missing = weakIds.filter((id) => !sellById.has(id));
    if (missing.length === 0) return;
    let live = true;
    const run = async (): Promise<void> => {
      for (const id of missing) {
        const el = byId.get(id);
        if (!el) continue;
        try {
          const r = await fetch(
            `/api/fpl/selling-price?entryId=${encodeURIComponent(entryId)}&elementId=${id}&currentCost=${el.now_cost}`,
          );
          if (!r.ok) continue;
          const j = (await r.json()) as { sell?: number };
          if (!live || typeof j.sell !== "number") continue;
          const sellTenths: number = j.sell;
          setSellById((m) => {
            const next = new Map(m);
            next.set(id, sellTenths / 10);
            return next;
          });
        } catch {
          // ignore, fallback to current price in suggest
        }
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [entryId, squadIds, boot, gwFixtures, gwIds, teamsById, codesById, bankM, activeGw, byId, sellById]);

  const applyTransfer = (): void => {
    const inn = inSel ? Number(inSel) : NaN;
    if (!outEl || !byId.get(inn)) return;
    const cost = priceM(inn, byId) - proceeds;
    if (cost > funds + 1e-9) return;
    setSquadIds((ids) => ids.map((id) => (id === outId ? inn : id)));
    setFunds((f) => Math.round((f - cost) * 10) / 10);
    if (fts > 0) setFts((n) => n - 1);
    else setHits((n) => n + 1);
    setLog((l) => [...l, { gw: gwIds[activeGw], out: outId, inn }]);
    setOutSel("");
    setInSel("");
    setSellPrice(null);
  };

  const applySuggestion = (out: number, inn: number): void => {
    const oEl = byId.get(out);
    const iEl = byId.get(inn);
    if (!oEl || !iEl) return;
    const sellM = sellById.get(out) ?? fplPrice(oEl);
    const cost = fplPrice(iEl) - sellM;
    if (cost > funds + 1e-9) return;
    setSquadIds((ids) => ids.map((id) => (id === out ? inn : id)));
    setFunds((f) => Math.round((f - cost) * 10) / 10);
    if (fts > 0) setFts((n) => n - 1);
    else setHits((n) => n + 1);
    setLog((l) => [...l, { gw: gwIds[activeGw], out, inn }]);
    setOutSel("");
    setInSel("");
    setSellPrice(null);
  };

  const reset = (): void => {
    setSquadIds(initialSquadIds);
    setFunds(bank ?? 0);
    setFts(1);
    setHits(0);
    setLog([]);
    setChips({});
    setOutSel("");
    setInSel("");
    setSellPrice(null);
    setSellById(new Map());
  };

  return (
    <section className="line" aria-label="Transfer planner">
      <h3>
        Transfer planner · 3 GWs · {grandTotal.toFixed(1)} pts projected{hits > 0 ? ` (incl. −${hits * 4} hits)` : ""}
      </h3>
      <div className="planbar">
        <span className="chip">Bank <strong>£{funds.toFixed(1)}m</strong></span>
        <span className="chip">
          FT <strong>{fts}</strong>
          <button type="button" className="mini" onClick={() => setFts((n) => Math.min(5, n + 1))} aria-label="Add free transfer">+</button>
          <button type="button" className="mini" onClick={() => setFts((n) => Math.max(0, n - 1))} aria-label="Remove free transfer">−</button>
        </span>
        <span className="chip">Hits <strong>{hits}</strong> (−{hits * 4})</span>
        <button type="button" className="toggle" onClick={reset}>Reset plan</button>
      </div>
      {suggestions.length > 0 && (
        <div className="suggestions" role="region" aria-label="Suggested transfers">
          <h4 className="suggestions-title">Suggested moves · 3GW horizon (GW{gwIds.join("/")})</h4>
          <ul className="suggestions-list">
            {suggestions.map((s) => (
              <li key={s.outId} className="suggestion">
                <div className="suggestion-out">
                  <span className="suggestion-sell">
                    Sell <strong>{s.outName}</strong> · £{s.sellM.toFixed(1)}m → budget £{s.budgetM.toFixed(1)}m
                    {s.outBlanks > 0 && <span className="flag-warn"> {s.outBlanks} blank</span>}
                    {s.outAvgDiff !== null && <span className={`pill-fdr fdr-${Math.round(s.outAvgDiff)}`}> avg FDR {s.outAvgDiff.toFixed(1)}</span>}
                  </span>
                  <span className="chip chip--muted">
                    3GW {s.outTotal.toFixed(1)} ({s.outPerGw.map((v) => v.toFixed(1)).join("·")})
                  </span>
                </div>
                <ul className="suggestion-candidates">
                  {s.candidates.map((c) => (
                    <li key={c.player.id} className="suggestion-cand">
                      <span>
                        <strong>{c.player.name}</strong> · {c.player.teamName} · £{c.player.price.toFixed(1)}m
                        <span className="chip"> 3GW +{c.hDelta.toFixed(1)} ({c.perGw.map((v) => v.toFixed(1)).join("·")})</span>
                        <span className="delta"> GW{activeGw !== undefined ? gwIds[activeGw] : ""} +{c.delta.toFixed(1)}</span>
                        {c.avgDiff !== null && <span className={`pill-fdr fdr-${Math.round(c.avgDiff)}`}> avg FDR {c.avgDiff.toFixed(1)}</span>}
                        {c.blanks > 0 && <span className="flag-warn"> blank</span>}
                        {c.isConcentrated && <span className="chip chip--muted"> 1GW spike</span>}
                        <span className={`chip ${c.momentum === "hot" ? "chip--hot" : c.momentum === "warm" ? "chip--warm" : ""}`}>
                          {c.momentum === "hot" ? "▲ hot" : c.momentum === "warm" ? "▲ warm" : "momentum cold"} · {c.netTransfers > 0 ? `+${(c.netTransfers / 1000).toFixed(0)}k` : `${(c.netTransfers / 1000).toFixed(0)}k`} · {c.ownedPct.toFixed(1)}% owned
                        </span>
                        {c.momentum === "hot" && c.player.price <= 6 && <span className="badge badge-diff">VALUE</span>}
                      </span>
                      <button type="button" className="btn btn--small" onClick={() => applySuggestion(s.outId, c.player.id)}>
                        Apply
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="hint">
            Ranked by 3GW horizon gain (not single GW). Blank-heavy candidates filtered out; 1GW spikes flagged. Momentum (net transfers) is the strongest public price-rise signal — shown as hot/warm/cold, not a guarantee (official predictor updates every 15m, thresholds ~100% at midnight, max +0.1/day · +0.3/GW). Cheap hot risers with form keep delivering and let the bank compound.
          </p>
        </div>
      )}
      <details className="crowd" style={{ margin: "8px 0" }}>
        <summary>Crowd top 11 by ownership — for comparison</summary>
        <ul className="chips" style={{ flexWrap: "wrap" }}>
          {crowd.map((c) => (
            <li key={c.id} className="chip">
              {c.name} · {c.ownedPct.toFixed(1)}% · net {(c.net / 1000).toFixed(0)}k
            </li>
          ))}
        </ul>
      </details>
      <div className="ticker-wrap">
        <table className="ticker">
          <thead>
            <tr>
              <th scope="col">GW</th>
              <th scope="col">XI total</th>
              <th scope="col">C / VC</th>
              <th scope="col">Chip</th>
            </tr>
          </thead>
          <tbody>
            {horizon.map((i) => {
              const xi = xiPerGw[i] ?? [];
              let cvc = "—";
              try {
                const { captain, vice } = pickCaptaincy(xi);
                cvc = `${captain.name} / ${vice.name}`;
              } catch {
                cvc = "No legal XI";
              }
              return (
                <tr key={gwIds[i]} className={i === activeGw ? "row-active" : undefined}>
                  <th scope="row">
                    <button type="button" className="gwlink" onClick={() => setActiveGw(i)}>
                      GW{gwIds[i]}
                    </button>
                  </th>
                  <td>{totals[i]?.toFixed(1) ?? "—"}</td>
                  <td>{cvc}</td>
                  <td>
                    <select
                      value={chips[gwIds[i]] ?? "—"}
                      onChange={(e) => setChips((c) => ({ ...c, [gwIds[i]]: e.target.value }))}
                      aria-label={`Chip for GW${gwIds[i]}`}
                    >
                      {CHIPS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="planform">
        <div className="field">
          <label className="field-label" htmlFor="plan-out">Sell (GW{gwIds[activeGw]})</label>
          <select id="plan-out" value={outSel} onChange={(e) => { setOutSel(e.target.value); setInSel(""); setSellPrice(null); }}>
            <option value="">— pick —</option>
            {squadIds.map((id) => (
              <option key={id} value={id}>{webName(id, byId)} · £{priceM(id, byId).toFixed(1)}m</option>
            ))}
          </select>
          {outEl && (
            <span className="chip">Sell £{proceeds.toFixed(1)}m{sellPrice === null ? " (current — resolving…)" : " (true selling)"}</span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="plan-in">Buy · budget £{budget.toFixed(1)}m</label>
          <select id="plan-in" value={inSel} onChange={(e) => setInSel(e.target.value)} disabled={!outEl}>
            <option value="">— pick —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.teamName} · £{c.price.toFixed(1)}m · {c.score.toFixed(1)}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn" disabled={!outEl || !inSel} onClick={applyTransfer}>
          Apply {fts > 0 ? "(FT)" : "(−4)"}
        </button>
      </div>
      {log.length > 0 && (
        <ol className="moves">
          {log.map((t, i) => (
            <li key={i}>GW{t.gw}: {webName(t.out, byId)} → {webName(t.inn, byId)}</li>
          ))}
        </ol>
      )}
      <p className="bankline">Selling prices resolved per player (bought + half profit). Buys pay current price. FH squads reset the next GW — plan accordingly.</p>
    </section>
  );
}
