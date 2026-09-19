import {
  FplElement,
  FplFixture,
  availability,
  difficultyFor,
  displayName,
  isHome,
  num,
  price,
} from "./fpl";

export interface Scored {
  id: number;
  name: string;
  type: number;
  team: number;
  score: number;
  reasons: string[];
  // Detail fields surfaced in the UI (heuristic inputs, not predictions).
  teamName: string;
  price: number; // £m
  selectedPct: number;
  avail: number; // 0..1 chance of playing
  form: number;
  ppg: number;
  xgi: number;
  ict: number;
  opp: string;
  home: boolean | null;
  diff: number | null; // FDR 2 (easiest) .. 5 (hardest)
  ease: number;
}

// Heuristic expected-points proxy for the NEXT gameweek only.
// score = form_w + per90/season baseline + fixture ease + availability gate.
// Labelled as heuristic in the UI — not a true xP model.
export const scorePlayer = (
  p: FplElement,
  fixtures: FplFixture[],
  eventId: number,
  teamsById: Map<number, string>,
): Scored => {
  const reasons: string[] = [];
  const form = num(p.form);
  const ppg = num(p.points_per_game);
  const xgi = num(p.expected_goal_involvements);
  const ict = num(p.ict_index);
  const avail = availability(p);
  const diff = difficultyFor(fixtures, eventId, p.team);
  const home = isHome(fixtures, eventId, p.team);
  const oppId = (() => {
    const f = fixtures.find(
      (x) => x.event === eventId && (x.team_h === p.team || x.team_a === p.team),
    );
    if (!f) return null;
    return f.team_h === p.team ? f.team_a : f.team_h;
  })();
  const opp = oppId ? (teamsById.get(oppId) ?? `Team ${oppId}`) : "TBD";

  // Fixture ease: diff 2 => +2, 3 => +1, 4 => -1, 5 => -2, null => 0.
  const ease =
    diff === null ? 0 : diff <= 2 ? 2 : diff === 3 ? 1 : diff === 4 ? -1 : -2;

  const score = form * 1.0 + ppg * 0.6 + xgi * 0.8 + ict * 0.01 + ease;

  reasons.push(
    `Form ${form.toFixed(1)} (${ppg.toFixed(1)} pts/game baseline).`,
  );
  reasons.push(
    diff === null
      ? `No fixture found for GW — neutral difficulty.`
      : `${home ? "Home" : "Away"} vs ${opp} — FDR ${diff} (${ease >= 0 ? "+" : ""}${ease} ease).`,
  );
  if (xgi > 0) reasons.push(`xGI ${xgi.toFixed(2)} — attacking threat.`);
  if (avail < 1)
    reasons.push(
      `Availability risk: ${Math.round(avail * 100)}% — consider benching.`,
    );
  if (avail === 0) reasons.push(`Ruled out — must bench.`);

  return {
    id: p.id,
    name: displayName(p),
    type: p.element_type,
    team: p.team,
    score: avail === 0 ? -Infinity : score * (0.25 + 0.75 * avail),
    reasons,
    teamName: teamsById.get(p.team) ?? `Team ${p.team}`,
    price: price(p),
    selectedPct: num(p.selected_by_percent),
    avail,
    form,
    ppg,
    xgi,
    ict,
    opp,
    home,
    diff,
    ease,
  };
};

// Pick best XI in a legal formation: 1 GKP, 3-5 DEF, 3-5 MID, 1-3 FWD.
export const pickXi = (scored: Scored[]): Scored[] => {
  const by = (t: number) =>
    scored.filter((s) => s.type === t).sort((a, b) => b.score - a.score);
  const gkps = by(1);
  const defs = by(2);
  const mids = by(3);
  const fwds = by(4);

  const formations: Array<[number, number, number]> = [
    [5, 4, 1],
    [5, 3, 2],
    [4, 4, 2],
    [4, 3, 3],
    [3, 5, 2],
    [3, 4, 3],
    [4, 5, 1],
    [5, 2, 3],
  ];

  let best: Scored[] = [];
  let bestScore = -Infinity;
  for (const [d, m, f] of formations) {
    if (defs.length < d || mids.length < m || fwds.length < f) continue;
    if (gkps.length < 1) continue;
    const xi = [
      gkps[0],
      ...defs.slice(0, d),
      ...mids.slice(0, m),
      ...fwds.slice(0, f),
    ];
    const total = xi.reduce((s, p) => s + p.score, 0);
    if (total > bestScore) {
      bestScore = total;
      best = xi;
    }
  }
  return best;
};

// Captain = highest score, vice = second highest (outfield preferred).
export const pickCaptaincy = (
  xi: Scored[],
): { captain: Scored; vice: Scored } => {
  if (xi.length === 0) throw new Error("Cannot pick captaincy from empty XI.");
  const sorted = [...xi].sort((a, b) => b.score - a.score);
  const outfield = sorted.filter((s) => s.type !== 1);
  const pool = outfield.length >= 2 ? outfield : sorted;
  return { captain: pool[0], vice: pool[1] ?? pool[0] };
};
