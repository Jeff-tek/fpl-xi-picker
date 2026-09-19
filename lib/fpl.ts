// Pure types + helpers for the free official FPL API.
// Base: https://fantasy.premierleague.com/api/
// Money in tenths (£7.5m => now_cost 75). Decimals often strings.

export type ElementType = 1 | 2 | 3 | 4; // GKP, DEF, MID, FWD

export interface FplElement {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  element_type: ElementType;
  team: number;
  now_cost: number;
  form: string;
  points_per_game: string;
  selected_by_percent: string;
  chance_of_playing_this_round: number | null;
  chance_of_playing_next_round: number | null;
  status: string;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  ict_index: string;
  transfers_in_event: number;
  transfers_out_event: number;
  minutes: number;
  bonus: number;
  clean_sheets: number;
  goals_conceded: number;
}

// Understat (free, no key) — per-player xG/xA, matched by name.
export interface UnderstatPlayer {
  id: string;
  player_name: string;
  team_title: string;
  xG: string;
  xA: string;
  npxG: string;
  minutes: string;
  apps: string;
}

export const understatPer90 = (
  u: UnderstatPlayer | undefined,
): { npxG90: number; xA90: number; minsReliability: number } => {
  if (!u) return { npxG90: 0, xA90: 0, minsReliability: 0.5 };
  const mins = num(u.minutes);
  const apps = Math.max(1, num(u.apps));
  const per90 = mins > 0 ? 90 / mins : 0;
  const mpg = mins / apps;
  return {
    npxG90: num(u.npxG) * per90,
    xA90: num(u.xA) * per90,
    minsReliability: mpg >= 75 ? 1 : mpg >= 60 ? 0.8 : mpg >= 30 ? 0.5 : 0.25,
  };
};

// Blended true-xP proxy: FPL form/ppg + Understat per-90 + fixture ease + minutes.
export const xPtsFor = (
  p: FplElement,
  u: UnderstatPlayer | undefined,
  ease: number,
  avail: number,
): number => {
  const { npxG90, xA90, minsReliability } = understatPer90(u);
  const base =
    num(p.form) * 0.35 +
    num(p.points_per_game) * 0.25 +
    npxG90 * 0.9 +
    xA90 * 0.7 +
    num(p.bonus) * 0.02 +
    ease * 0.6 +
    minsReliability * 0.5;
  return avail === 0 ? -Infinity : base * (0.25 + 0.75 * avail);
};

export const matchUnderstat = (
  p: FplElement,
  list: UnderstatPlayer[],
): UnderstatPlayer | undefined => {
  const key = `${p.first_name} ${p.second_name}`.toLowerCase().trim();
  const web = p.web_name.toLowerCase().trim();
  return (
    list.find((u) => u.player_name.toLowerCase().trim() === key) ??
    list.find((u) => u.player_name.toLowerCase().includes(web)) ??
    list.find((u) => web.includes(u.player_name.toLowerCase().split(" ").slice(-1)[0] ?? "§"))
  );
};

export interface FplTeam {
  id: number;
  code: number;
  name: string;
  short_name: string;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface FplEvent {
  id: number;
  name: string;
  is_next: boolean;
  is_current: boolean;
  finished: boolean;
  deadline_time: string;
}

export interface FplFixture {
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string;
}

export interface FplPick {
  element: number;
  position: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
}

export interface Bootstrap {
  elements: FplElement[];
  teams: FplTeam[];
  events: FplEvent[];
}

export const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "NaN"));
  return Number.isFinite(n) ? n : 0;
};

export const displayName = (p: FplElement): string => p.web_name;

export const price = (p: FplElement): number => p.now_cost / 10;

// Availability 0..1 from chance of playing (null/0 => 0, 100 => 1).
export const availability = (p: FplElement): number => {
  const c =
    p.chance_of_playing_next_round ?? p.chance_of_playing_this_round;
  if (c === null || c === undefined) return p.status === "a" ? 1 : 0;
  if (c === 0) return 0;
  return Math.min(1, Math.max(0, c / 100));
};

// Fixture difficulty 2 (easiest) .. 5 (hardest) for a team in an event.
export const difficultyFor = (
  fixtures: FplFixture[],
  eventId: number,
  teamId: number,
): number | null => {
  const f = fixtures.find(
    (x) => x.event === eventId && (x.team_h === teamId || x.team_a === teamId),
  );
  if (!f) return null;
  return f.team_h === teamId ? f.team_h_difficulty : f.team_a_difficulty;
};

export const isHome = (
  fixtures: FplFixture[],
  eventId: number,
  teamId: number,
): boolean | null => {
  const f = fixtures.find(
    (x) => x.event === eventId && (x.team_h === teamId || x.team_a === teamId),
  );
  if (!f) return null;
  return f.team_h === teamId;
};

// Official FPL shirt asset (66px PNG). GK kits use the `_1` variant.
export const shirtUrl = (teamCode: number, isGk: boolean): string =>
  `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}${isGk ? "_1" : ""}-66.png`;
