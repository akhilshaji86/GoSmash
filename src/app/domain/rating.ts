import { LeaderboardEntry, MatchRecord, TeamSide } from './models';

interface MutableStanding extends LeaderboardEntry {
  rating: number;
}

const DEFAULT_RATING = 1000;

export function buildLeaderboard(matches: readonly MatchRecord[]): LeaderboardEntry[] {
  const standings = new Map<string, MutableStanding>();

  const finalMatches = matches
    .filter((match) => match.status === 'final' && match.winner)
    .slice()
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));

  for (const match of finalMatches) {
    applyMatch(standings, match);
  }

  return [...standings.values()]
    .map((entry) => ({
      ...entry,
      rating: Math.round(entry.rating),
      winRate: entry.matches === 0 ? 0 : Math.round((entry.wins / entry.matches) * 100),
    }))
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointDiff - a.pointDiff;
    });
}

function applyMatch(standings: Map<string, MutableStanding>, match: MatchRecord): void {
  const teamA = match.teamAPlayers.map((name) => ensureStanding(standings, name));
  const teamB = match.teamBPlayers.map((name) => ensureStanding(standings, name));
  const teamARating = average(teamA.map((player) => player.rating));
  const teamBRating = average(teamB.map((player) => player.rating));
  const teamAResult = match.winner === 'teamA' ? 1 : 0;
  const teamBResult = match.winner === 'teamB' ? 1 : 0;
  const teamAExpected = expectedScore(teamARating, teamBRating);
  const teamBExpected = expectedScore(teamBRating, teamARating);

  updateTeam(teamA, match, 'teamA', teamAResult, teamAExpected);
  updateTeam(teamB, match, 'teamB', teamBResult, teamBExpected);
}

function updateTeam(
  players: MutableStanding[],
  match: MatchRecord,
  side: TeamSide,
  result: number,
  expected: number,
): void {
  const won = result === 1;
  const pointsFor = side === 'teamA' ? match.teamAScore : match.teamBScore;
  const pointsAgainst = side === 'teamA' ? match.teamBScore : match.teamAScore;

  for (const player of players) {
    const kFactor = player.matches < 15 ? 36 : 24;

    player.matches += 1;
    player.wins += won ? 1 : 0;
    player.losses += won ? 0 : 1;
    player.pointsFor += pointsFor;
    player.pointsAgainst += pointsAgainst;
    player.pointDiff = player.pointsFor - player.pointsAgainst;
    player.rating += kFactor * (result - expected);
    player.lastPlayedAt = match.playedAt;
  }
}

function ensureStanding(standings: Map<string, MutableStanding>, playerName: string): MutableStanding {
  const key = playerName.toLowerCase();
  const existing = standings.get(key);

  if (existing) return existing;

  const created: MutableStanding = {
    playerName,
    rating: DEFAULT_RATING,
    matches: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDiff: 0,
    winRate: 0,
    lastPlayedAt: '',
  };

  standings.set(key, created);
  return created;
}

function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

function average(values: number[]): number {
  if (values.length === 0) return DEFAULT_RATING;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
