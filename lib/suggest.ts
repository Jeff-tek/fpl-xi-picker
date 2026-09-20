import type { Bootstrap, FplFixture } from "./fpl";
import { price as fplPrice } from "./fpl";
import type { Scored } from "./select";
import { pickXi, scorePlayer } from "./select";

export interface WeakRanked {
  id: number;
  total: number;
  perGw: number[];
  scoredActive: Scored | null;
  price: number;
  avail: number;
  diff: number | null;
  avgDiff: number | null;
  blanks: number;
  inXiCount: number;
  form: number;
  netTransfers: number;
  ownedPct: number;
}

export interface ReplacementCandidate {
  player: Scored;
  delta: number;
  hDelta: number;
  perGw: number[];
  blanks: number;
  avgDiff: number | null;
  netTransfers: number;
  ownedPct: number;
  momentum: "hot" | "warm" | "cold";
  isConcentrated: boolean;
}

export interface Suggestion {
  outId: number;
  outName: string;
  outTotal: number;
  outPerGw: number[];
  outPrice: number;
  outBlanks: number;
  outAvgDiff: number | null;
  sellM: number;
  budgetM: number;
  candidates: ReplacementCandidate[];
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "NaN"));
  return Number.isFinite(n) ? n : 0;
};

const netTransfersFor = (el: Bootstrap["elements"][number]): number => {
  const r = el as unknown as Record<string, unknown>;
  return toNum(r.transfers_in_event) - toNum(r.transfers_out_event);
};

const ownedPctFor = (el: Bootstrap["elements"][number]): number =>
  toNum((el as unknown as Record<string, unknown>).selected_by_percent);

const momentumFor = (net: number): "hot" | "warm" | "cold" => {
  if (net > 50000) return "hot";
  if (net > 10000) return "warm";
  return "cold";
};

const horizonScores = (
  el: Bootstrap["elements"][number],
  gwFixtures: FplFixture[][],
  gwIds: number[],
  teamsById: Map<number, string>,
  codesById: Map<number, number>,
): { perGw: number[]; perGwScored: Scored[]; total: number; avail: number; diff: number | null; avgDiff: number | null; blanks: number; form: number } => {
  const perGwScored = gwIds.map((gw, i) => scorePlayer(el, gwFixtures[i] ?? [], gw, teamsById, codesById));
  const perGw = perGwScored.map((s) => s.score);
  const total = perGw.reduce((a, b) => a + (Number.isFinite(b) ? b : -10), 0);
  const first = perGwScored[0];
  const diffs = perGwScored.map((s) => s.diff).filter((d): d is number => d !== null);
  const avgDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  const blanks = perGwScored.filter((s) => s.diff === null).length;
  return { perGw, perGwScored, total, avail: first?.avail ?? 1, diff: first?.diff ?? null, avgDiff, blanks, form: first?.form ?? 0 };
};

export const rankWeak = (
  squadIds: number[],
  boot: Bootstrap,
  gwFixtures: FplFixture[][],
  gwIds: number[],
  teamsById: Map<number, string>,
  codesById: Map<number, number>,
  limit = 4,
): WeakRanked[] => {
  const byId = new Map(boot.elements.map((e) => [e.id, e]));
  const xiPerGw = gwIds.map((gw, i) => {
    const all = boot.elements.map((e) => scorePlayer(e, gwFixtures[i] ?? [], gw, teamsById, codesById));
    return new Set(pickXi(all).map((s) => s.id));
  });
  const rows: WeakRanked[] = squadIds
    .map((id) => byId.get(id))
    .filter((e): e is Bootstrap["elements"][number] => e !== undefined)
    .map((el) => {
      const h = horizonScores(el, gwFixtures, gwIds, teamsById, codesById);
      const inXiCount = xiPerGw.reduce((c, set) => c + (set.has(el.id) ? 1 : 0), 0);
      const scoredActive = h.perGwScored[0] ?? null;
      return {
        id: el.id,
        total: h.total - h.blanks * 3 - (inXiCount === 0 ? 1.5 : 0),
        perGw: h.perGw,
        scoredActive,
        price: fplPrice(el),
        avail: h.avail,
        diff: h.diff,
        avgDiff: h.avgDiff,
        blanks: h.blanks,
        inXiCount,
        form: h.form,
        netTransfers: netTransfersFor(el),
        ownedPct: ownedPctFor(el),
      };
    })
    .sort((a, b) => {
      if (a.avail === 0 && b.avail !== 0) return -1;
      if (b.avail === 0 && a.avail !== 0) return 1;
      if (a.avail < 0.75 && b.avail >= 0.75) return -1;
      if (b.avail < 0.75 && a.avail >= 0.75) return 1;
      if (a.blanks !== b.blanks) return b.blanks - a.blanks;
      if (a.inXiCount !== b.inXiCount) return a.inXiCount - b.inXiCount;
      return a.total - b.total;
    });
  return rows.slice(0, limit);
};

export const suggestReplacements = (
  weak: WeakRanked,
  boot: Bootstrap,
  squadIds: number[],
  budgetM: number,
  gwFixtures: FplFixture[][],
  gwIds: number[],
  teamsById: Map<number, string>,
  codesById: Map<number, number>,
  activeGw = 0,
  limit = 3,
): Suggestion => {
  const byId = new Map(boot.elements.map((e) => [e.id, e]));
  const outEl = byId.get(weak.id);
  const outType = outEl?.element_type;
  const owned = new Set(squadIds);
  const outHorizon = weak.perGw.reduce((a, b) => a + (Number.isFinite(b) ? b : -10), 0);

  const candidates: ReplacementCandidate[] = boot.elements
    .filter((e) => e.element_type === outType && !owned.has(e.id) && fplPrice(e) <= budgetM + 1e-9)
    .map((e) => {
      const h = horizonScores(e, gwFixtures, gwIds, teamsById, codesById);
      const activeScore = h.perGw[activeGw] ?? h.perGw[0] ?? 0;
      const outActive = weak.perGw[activeGw] ?? weak.perGw[0] ?? 0;
      const hDelta = h.total - outHorizon - h.blanks * 4;
      const delta = activeScore - outActive;
      const maxPerGw = Math.max(...h.perGw.map((v, i) => h.perGw[i] - (weak.perGw[i] ?? 0)));
      const isConcentrated = hDelta > 0 && maxPerGw > hDelta * 0.7;
      const net = netTransfersFor(e);
      return {
        player: h.perGwScored[activeGw] ?? h.perGwScored[0],
        delta,
        hDelta,
        perGw: h.perGw,
        blanks: h.blanks,
        avgDiff: h.avgDiff,
        netTransfers: net,
        ownedPct: ownedPctFor(e),
        momentum: momentumFor(net),
        isConcentrated,
      } as ReplacementCandidate;
    })
    .filter((c) => Number.isFinite(c.hDelta) && c.hDelta > 0.3 && c.blanks === 0)
    .sort((a, b) => {
      if (a.hDelta !== b.hDelta) return b.hDelta - a.hDelta;
      if (a.delta !== b.delta) return b.delta - a.delta;
      const mRank = (m: string) => (m === "hot" ? 2 : m === "warm" ? 1 : 0);
      return mRank(b.momentum) - mRank(a.momentum);
    })
    .slice(0, limit);

  const fallback: ReplacementCandidate[] =
    candidates.length === 0
      ? boot.elements
          .filter((e) => e.element_type === outType && !owned.has(e.id) && fplPrice(e) <= budgetM + 1e-9)
          .map((e) => {
            const h = horizonScores(e, gwFixtures, gwIds, teamsById, codesById);
            const activeScore = h.perGw[activeGw] ?? 0;
            const outActive = weak.perGw[activeGw] ?? 0;
            return {
              player: h.perGwScored[activeGw] ?? h.perGwScored[0],
              delta: activeScore - outActive,
              hDelta: h.total - outHorizon,
              perGw: h.perGw,
              blanks: h.blanks,
              avgDiff: h.avgDiff,
              netTransfers: netTransfersFor(e),
              ownedPct: ownedPctFor(e),
              momentum: momentumFor(netTransfersFor(e)),
              isConcentrated: false,
            } as ReplacementCandidate;
          })
          .filter((c) => c.hDelta > 0)
          .sort((a, b) => b.hDelta - a.hDelta)
          .slice(0, limit)
      : [];

  const final = candidates.length ? candidates : fallback;

  return {
    outId: weak.id,
    outName: outEl?.web_name ?? `#${weak.id}`,
    outTotal: weak.total,
    outPerGw: weak.perGw,
    outPrice: weak.price,
    outBlanks: weak.blanks,
    outAvgDiff: weak.avgDiff,
    sellM: budgetM,
    budgetM,
    candidates: final,
  };
};

export const buildSuggestions = (
  squadIds: number[],
  boot: Bootstrap,
  gwFixtures: FplFixture[][],
  gwIds: number[],
  teamsById: Map<number, string>,
  codesById: Map<number, number>,
  sellById: Map<number, number>,
  bankM: number,
  activeGw = 0,
): Suggestion[] => {
  const weak = rankWeak(squadIds, boot, gwFixtures, gwIds, teamsById, codesById, 4);
  return weak
    .map((w) => {
      const sellM = sellById.get(w.id) ?? w.price;
      const budgetM = sellM + bankM;
      const s = suggestReplacements(w, boot, squadIds, budgetM, gwFixtures, gwIds, teamsById, codesById, activeGw, 3);
      return { ...s, sellM, budgetM };
    })
    .filter((s) => s.candidates.length > 0);
};

export const crowdTop11 = (boot: Bootstrap): Array<{ id: number; name: string; ownedPct: number; net: number }> =>
  [...boot.elements]
    .sort((a, b) => ownedPctFor(b) - ownedPctFor(a))
    .slice(0, 11)
    .map((e) => ({ id: e.id, name: (e as unknown as { web_name: string }).web_name, ownedPct: ownedPctFor(e), net: netTransfersFor(e) }));
