import { buildLeaderboard } from './rating';
import { MatchRecord } from './models';

describe('buildLeaderboard', () => {
  it('ranks players from completed matches only', () => {
    const matches: MatchRecord[] = [
      match('Kakkanad', ['Arjun'], ['Rahul'], 21, 18, '2026-01-01T00:00:00.000Z'),
      match('Open court', ['Rahul'], ['Nikhil'], 20, 22, '2026-01-02T00:00:00.000Z'),
      { ...match('League night', ['Maya'], ['Devika'], 18, 21, '2026-01-03T00:00:00.000Z'), status: 'recording', winner: undefined },
    ];

    const leaderboard = buildLeaderboard(matches);

    expect(leaderboard.find((entry) => entry.playerName === 'Arjun')?.wins).toBe(1);
    expect(leaderboard.find((entry) => entry.playerName === 'Nikhil')?.wins).toBe(1);
    expect(leaderboard.some((entry) => entry.playerName === 'Maya')).toBe(false);
  });

  it('uses manually ended partial games when a leading side is recorded', () => {
    const matches: MatchRecord[] = [
      match('Kakkanad', ['Arjun'], ['Rahul'], 10, 8, '2026-01-01T00:00:00.000Z'),
    ];

    const leaderboard = buildLeaderboard(matches);

    expect(leaderboard.find((entry) => entry.playerName === 'Arjun')?.wins).toBe(1);
    expect(leaderboard.find((entry) => entry.playerName === 'Rahul')?.losses).toBe(1);
    expect(leaderboard.find((entry) => entry.playerName === 'Arjun')?.pointsFor).toBe(10);
  });
});

function match(
  location: string,
  teamAPlayers: string[],
  teamBPlayers: string[],
  teamAScore: number,
  teamBScore: number,
  playedAt: string,
): MatchRecord {
  return {
    id: crypto.randomUUID(),
    location,
    format: 'singles',
    status: 'final',
    targetPoints: 21,
    openingServer: 'teamA',
    teamAPlayers,
    teamBPlayers,
    teamAScore,
    teamBScore,
    winner: teamAScore > teamBScore ? 'teamA' : 'teamB',
    playedAt,
    createdAt: playedAt,
    pointEvents: [],
  };
}
