// Medal / achievement catalog for the Minigames backend.
// Medals are derived from a user's aggregate statistics (per game + global).
// Every time stats change the backend re-evaluates; newly earned medals are
// stored once. Each medal declares `check(stats, byGame)` returning true/false.

"use strict";

// Aggregated stats shape fed into every check:
// {
//   gamesPlayed,           // distinct games ever played
//   totalPlaytimeMs,       // summed across games
//   totalScore,
//   totalWins,
//   byGame: { <game>: { plays, wins, playtimeMs, bestScore, totalScore } }
// }

const MEDALS = [
  {
    id: "first_steps",
    name: "First Steps",
    emoji: "👣",
    desc: "Play your first game.",
    check: (s) => s.gamesPlayed >= 1,
  },
  {
    id: "gamer",
    name: "Emerging Gamer",
    emoji: "🎮",
    desc: "Play 5 different games.",
    check: (s) => s.gamesPlayed >= 5,
  },
  {
    id: "loyal_companion",
    name: "Loyal Companion",
    emoji: "🤝",
    desc: "Come back and play on 3 different days.",
    check: (s) => s.playDays >= 3,
  },
  {
    id: "marathon",
    name: "Marathoner",
    emoji: "🏃",
    desc: "Log one full hour of playtime.",
    check: (s) => s.totalPlaytimeMs >= 60 * 60 * 1000,
  },
  {
    id: "centurion",
    name: "Centurion",
    emoji: "💯",
    desc: "Play 100 rounds in total.",
    check: (s) => s.totalPlays >= 100,
  },
  {
    id: "winner",
    name: "Winner Winner",
    emoji: "🏆",
    desc: "Win any game at least once.",
    check: (s) => s.totalWins >= 1,
  },
  {
    id: "sharp_eye",
    name: "Sharp Eye",
    emoji: "🎯",
    desc: "Reach a best score of 1000 or higher in any game.",
    check: (s) => Object.values(s.byGame).some((g) => g.bestScore >= 1000),
  },
  {
    id: "speed_reader",
    name: "Speed Reader",
    emoji: "⚡",
    desc: "Play 20 rounds within a single day.",
    check: (s) => s.roundsInOneDay >= 20,
  },
];

/** Recompute the medal set a user should have for the given stats. */
function evaluateMedals(stats) {
  const earned = [];
  for (const m of MEDALS) {
    try {
      if (m.check(stats)) earned.push(m.id);
    } catch (e) {
      console.error(`[medals] check failed for ${m.id}:`, e);
    }
  }
  return earned;
}

/** Compute the aggregate stats object from raw per-game stats rows. */
function aggregate(statsRows) {
  const byGame = {};
  let totalPlaytimeMs = 0,
    totalScore = 0,
    totalWins = 0,
    totalPlays = 0;
  const playDays = new Set();
  const playsByDay = new Map();

  for (const row of statsRows) {
    byGame[row.game] = {
      plays: row.plays || 0,
      wins: row.wins || 0,
      playtimeMs: row.playtimeMs || 0,
      bestScore: row.bestScore || 0,
      totalScore: row.totalScore || 0,
    };
    totalPlays += row.plays || 0;
    totalWins += row.wins || 0;
    totalPlaytimeMs += row.playtimeMs || 0;
    totalScore += row.totalScore || 0;
    if (row.days && Array.isArray(row.days)) {
      row.days.forEach((d) => playDays.add(d));
    }
    if (row.roundsByDay && typeof row.roundsByDay === "object") {
      for (const [day, n] of Object.entries(row.roundsByDay)) {
        playsByDay.set(day, (playsByDay.get(day) || 0) + n);
      }
    }
  }

  return {
    gamesPlayed: Object.keys(byGame).length,
    totalPlays,
    totalWins,
    totalScore,
    totalPlaytimeMs,
    playDays: playDays.size,
    roundsInOneDay: Math.max(0, ...[...playsByDay.values()]),
    byGame,
  };
}

module.exports = { MEDALS, evaluateMedals, aggregate };