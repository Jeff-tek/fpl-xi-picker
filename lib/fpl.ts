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

export interface LiveStats {
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  clearances_blocks_interceptions: number;
  recoveries: number;
  tackles: number;
}

export interface LiveElement {
  id: number;
  stats: LiveStats;
}

export const asLiveStats = (s: Partial<LiveStats> | null | undefined): LiveStats => ({
  minutes: s?.minutes ?? 0,
  goals_scored: s?.goals_scored ?? 0,
  assists: s?.assists ?? 0,
  clean_sheets: s?.clean_sheets ?? 0,
  goals_conceded: s?.goals_conceded ?? 0,
  own_goals: s?.own_goals ?? 0,
  penalties_saved: s?.penalties_saved ?? 0,
  penalties_missed: s?.penalties_missed ?? 0,
  yellow_cards: s?.yellow_cards ?? 0,
  red_cards: s?.red_cards ?? 0,
  saves: s?.saves ?? 0,
  bonus: s?.bonus ?? 0,
  bps: s?.bps ?? 0,
  clearances_blocks_interceptions: s?.clearances_blocks_interceptions ?? 0,
  recoveries: s?.recoveries ?? 0,
  tackles: s?.tackles ?? 0,
});

export const DEFCON_THRESHOLD: Record<number, number> = { 1: 10, 2: 10, 3: 12, 4: 12 };

export const defconProgress = (s: LiveStats, type: number): { actions: number; threshold: number; reached: boolean } => {
  const actions =
    s.clearances_blocks_interceptions + s.tackles + (type === 2 ? 0 : s.recoveries);
  const threshold = DEFCON_THRESHOLD[type] ?? 12;
  return { actions, threshold, reached: actions >= threshold };
};

// Estimate of official FPL points from live stats (bonus provisional until matches end).
export const computeLivePoints = (s: LiveStats, type: ElementType): number => {
  if (s.minutes <= 0) return 0;
  let pts = 1 + (s.minutes >= 60 ? 1 : 0);
  pts += s.goals_scored * (type === 3 ? 5 : type === 4 ? 4 : 6);
  pts += s.assists * 3;
  if (s.minutes >= 60 && s.goals_conceded === 0) pts += type === 1 || type === 2 ? 4 : type === 3 ? 1 : 0;
  if (type === 1) pts += Math.floor(s.saves / 3);
  if (type === 1 || type === 2) pts -= Math.floor(s.goals_conceded / 2);
  pts += s.penalties_saved * 5;
  pts -= s.penalties_missed * 2;
  pts -= s.own_goals * 2;
  pts -= s.yellow_cards;
  pts -= s.red_cards * 3;
  pts += s.bonus;
  if (defconProgress(s, type).reached) pts += 2;
  return pts;
};
