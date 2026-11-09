// Moment categories. One generic set, plus game-specific labels the AI can use
// to be more precise ("Ace", "Baron steal", "Perfect").

export const CATEGORIES = [
  "Multi-kill",
  "Clutch",
  "Objective",
  "Team fight",
  "Outplay",
  "Caster hype",
  "Crowd",
  "Replay",
  "Fail",
  "Action",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type GameProfileId = "generic" | "cs2" | "valorant" | "lol" | "dota2" | "fighting" | "rocket-league";

export interface GameProfile {
  id: GameProfileId;
  name: string;
  genre: "Tactical shooter" | "MOBA" | "Fighting" | "Sports" | "Any";
  /** Plain-language labels the AI may attach, mapped to a generic category. */
  labels: Record<string, Category>;
  /** Extra things to ignore for this game, in plain words. */
  ignore: string[];
}

const COMMON_IGNORE = [
  "analyst desk or studio segments with no gameplay",
  "ads, sponsor reads, countdown or intermission screens",
  "menus, loading screens, lobbies, pick/ban or agent select",
  "scoreboards, maps or stats overlays with nothing happening",
  "loud audio while nothing is happening on screen",
];

export const GAME_PROFILES: Record<GameProfileId, GameProfile> = {
  generic: {
    id: "generic",
    name: "Any game",
    genre: "Any",
    labels: {
      "Multi-kill": "Multi-kill",
      Clutch: "Clutch",
      Objective: "Objective",
      "Team fight": "Team fight",
      Outplay: "Outplay",
      "Caster hype": "Caster hype",
      "Crowd pop": "Crowd",
      Replay: "Replay",
      Fail: "Fail",
    },
    ignore: COMMON_IGNORE,
  },
  cs2: {
    id: "cs2",
    name: "Counter-Strike 2",
    genre: "Tactical shooter",
    labels: {
      Ace: "Multi-kill",
      "4K": "Multi-kill",
      "3K": "Multi-kill",
      "1vX clutch": "Clutch",
      "Bomb plant": "Objective",
      Defuse: "Objective",
      "Ninja defuse": "Clutch",
      "AWP flick": "Outplay",
      "Knife kill": "Outplay",
      "Eco win": "Outplay",
      "Round win": "Objective",
    },
    ignore: [...COMMON_IGNORE, "buy menu or freeze time", "spectator flying around with no fight"],
  },
  valorant: {
    id: "valorant",
    name: "Valorant",
    genre: "Tactical shooter",
    labels: {
      Ace: "Multi-kill",
      "4K": "Multi-kill",
      "3K": "Multi-kill",
      "1vX clutch": "Clutch",
      "Spike plant": "Objective",
      Defuse: "Objective",
      "Ult play": "Outplay",
      "Operator flick": "Outplay",
      "Round win": "Objective",
    },
    ignore: [...COMMON_IGNORE, "buy phase", "agent select"],
  },
  lol: {
    id: "lol",
    name: "League of Legends",
    genre: "MOBA",
    labels: {
      Pentakill: "Multi-kill",
      Quadrakill: "Multi-kill",
      "Team fight": "Team fight",
      Baron: "Objective",
      "Baron steal": "Outplay",
      Dragon: "Objective",
      "Elder dragon": "Objective",
      "Tower dive": "Outplay",
      Inhibitor: "Objective",
      "Nexus kill": "Objective",
      Gank: "Outplay",
      Shutdown: "Clutch",
    },
    ignore: [...COMMON_IGNORE, "laning with no fights", "players recalling or farming"],
  },
  dota2: {
    id: "dota2",
    name: "Dota 2",
    genre: "MOBA",
    labels: {
      Rampage: "Multi-kill",
      "Ultra kill": "Multi-kill",
      "Team fight": "Team fight",
      Roshan: "Objective",
      "Aegis steal": "Outplay",
      "Barracks": "Objective",
      "Throne kill": "Objective",
      "Buyback": "Clutch",
      Gank: "Outplay",
    },
    ignore: [...COMMON_IGNORE, "laning with no fights", "farming in the jungle"],
  },
  fighting: {
    id: "fighting",
    name: "Fighting games",
    genre: "Fighting",
    labels: {
      Perfect: "Outplay",
      Comeback: "Clutch",
      "Super finish": "Outplay",
      "Big combo": "Outplay",
      "Parry or read": "Outplay",
      "Match point win": "Clutch",
      "Set win": "Objective",
    },
    ignore: [...COMMON_IGNORE, "character select", "round intro animations"],
  },
  "rocket-league": {
    id: "rocket-league",
    name: "Rocket League",
    genre: "Sports",
    labels: {
      Goal: "Objective",
      "Overtime goal": "Clutch",
      Save: "Clutch",
      "Aerial goal": "Outplay",
      "Demo": "Outplay",
    },
    ignore: [...COMMON_IGNORE, "kickoff countdown", "goal replay with nothing new"],
  },
};

export function profileFor(id: string | null | undefined): GameProfile {
  return GAME_PROFILES[(id as GameProfileId) ?? "generic"] ?? GAME_PROFILES.generic;
}

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}
