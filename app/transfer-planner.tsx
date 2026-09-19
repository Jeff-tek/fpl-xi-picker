"use client";

import { useMemo, useState } from "react";
import type { Bootstrap, FplFixture } from "../lib/fpl";
import { price as fplPrice } from "../lib/fpl";
import type { Scored } from "../lib/select";
import { pickCaptaincy, pickXi, scorePlayer } from "../lib/select";

const CHIPS = ["—", "WC", "FH", "BB", "TC"] as const;

interface Props {
  boot: Bootstrap;
  initialSquadIds: number[];
  bank: number | null;
  gwIds: number[];
  gwFixtures: FplFixture[][];
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

export default function TransferPlanner({ boot, initialSquadIds, bank, gwIds, gwFixtures }: Props) {
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
  const budget = outEl ? fplPrice(outEl) + funds : funds;

  const candidates: Scored[] = useMemo(() => {
    if (!outEl || !gwFixtures[activeGw]) return [];
    const owned = new Set(squadIds);
    return boot.elements
      .filter((e) => e.element_type === outEl.element_type && !owned.has(e.id) && fplPrice(e) <= budget + 1e-9)
      .flatMap((e) => [scorePlayer(e, gwFixtures[activeGw] ?? [], gwIds[activeGw], teamsById, codesById)])
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [outEl, boot, squadIds, budget, gwFixtures, activeGw, gwIds, teamsById, codesById]);

  const applyTransfer = (): void => {
    const inn = inSel ? Number(inSel) : NaN;
    if (!outEl || !byId.get(inn)) return;
    const cost = priceM(inn, byId) - priceM(outId, byId);
    if (cost > funds + 1e-9) return;
    setSquadIds((ids) => ids.map((id) => (id === outId ? inn : id)));
    setFunds((f) => Math.round((f - cost) * 10) / 10);
    if (fts > 0) setFts((n) => n - 1);
    else setHits((n) => n + 1);
    setLog((l) => [...l, { gw: gwIds[activeGw], out: outId, inn }]);
    setOutSel("");
    setInSel("");
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
          <select id="plan-out" value={outSel} onChange={(e) => { setOutSel(e.target.value); setInSel(""); }}>
            <option value="">— pick —</option>
            {squadIds.map((id) => (
              <option key={id} value={id}>{webName(id, byId)} · £{priceM(id, byId).toFixed(1)}m</option>
            ))}
          </select>
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
      <p className="bankline">Prices are current (selling-price walk not yet tracked — bank math assumes buy ≈ sell). FH squads reset the next GW — plan accordingly.</p>
    </section>
  );
}
