import type { Bootstrap, FplFixture } from "./fpl";
import { price as fplPrice } from "./fpl";
import type { Scored } from "./select";
import { scorePlayer } from "./select";

export interface WeakRanked {
  id: number;
  total: number;
  perGw: number[];
  scoredActive: Scored | null;
  price: number;
  avail: number;
  diff: number | null;
}

export interface ReplacementCandidate {
  player: Scored;
  delta: number;
}

export interface Suggestion {
  outId: number;
  outName: string;
  outTotal: number;
  outPrice: number;
  sellM: number;
  budgetM: number;
  candidates: ReplacementCandidate[];
}

const horizonScores = (
  el: Bootstrap["elements"][number],
  gwFixtures: FplFixture[][],
  gwIds: number[],
  teamsById: Map<number, string>,
  codesById: Map<number, number>,
): { perGw: number[]; total: number; avail: number; diff: number | null } => {
  const perGw = gwIds.map((gw, i) => scorePlayer(el, gwFixtures[i] ?? [], gw, teamsById, codesById).score);
  const total = perGw.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const first = scorePlayer(el, gwFixtures[0] ?? [], gwIds[0], teamsById, codesById);
  return { perGw, total, avail: first.avail, diff: first.diff };
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
  const rows: WeakRanked[] = squadIds
    .map((id) => byId.get(id))
    .filter((e): e is Bootstrap["elements"][number] => e !== undefined)
    .map((el) => {
      const h = horizonScores(el, gwFixtures, gwIds, teamsById, codesById);
      const scoredActive =
        gwIds[0] !== undefined ? scorePlayer(el, gwFixtures[0] ?? [], gwIds[0], teamsById, codesById) : null;
      return {
        id: el.id,
        total: h.total,
        perGw: h.perGw,
        scoredActive,
        price: fplPrice(el),
        avail: h.avail,
        diff: h.diff,
      };
    })
    .sort((a, b) => {
      if (a.avail === 0 && b.avail !== 0) return -1;
      if (b.avail === 0 && a.avail !== 0) return 1;
      if (a.avail < 1 && b.avail === 1) return -1;
      if (b.avail < 1 && a.avail === 1) return 1;
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
  const gw = gwIds[activeGw];
  const fixtures = gwFixtures[activeGw] ?? [];
  const outScored =
    outEl && gw !== undefined ? scorePlayer(outEl, fixtures, gw, teamsById, codesById) : null;
  const outScore = outScored?.score ?? weak.perGw[activeGw] ?? weak.total;

  const candidates: ReplacementCandidate[] = boot.elements
    .filter((e) => e.element_type === outType && !owned.has(e.id) && fplPrice(e) <= budgetM + 1e-9)
    .map((e) => {
      const s = gw !== undefined ? scorePlayer(e, fixtures, gw, teamsById, codesById) : scorePlayer(e, [], 0, teamsById, codesById);
      return { player: s, delta: s.score - outScore };
    })
    .filter((c) => Number.isFinite(c.delta) && c.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);

  return {
    outId: weak.id,
    outName: outEl?.web_name ?? `#${weak.id}`,
    outTotal: weak.total,
    outPrice: weak.price,
    sellM: budgetM - (0),
    budgetM,
    candidates,
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
