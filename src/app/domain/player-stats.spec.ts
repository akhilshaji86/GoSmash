import { MatchRecord, PointEvent, ShotType, TeamSide, opponentSide } from './models';
import { buildPlayerStats } from './player-stats';
import { buildLeaderboard } from './rating';

describe('buildPlayerStats', () => {
  it('counts shot wins and mistakes for a player', () => {
    const matchRecord = match(['Arjun'], ['Rahul'], [
      point('m1', 1, 'teamA', 'smash', 1, 0),
      point('m1', 2, 'teamB', null, 1, 1),
      point('m1', 3, 'teamA', 'drop', 2, 1),
      point('m1', 4, 'teamA', null, 3, 1),
    ]);

    const stats = buildPlayerStats([matchRecord], buildLeaderboard([matchRecord]), 'Arjun');

    expect(stats.matches).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.shotPointsWon).toBe(2);
    expect(stats.pointsFromOpponentMistakes).toBe(1);
    expect(stats.mistakesMade).toBe(1);
    expect(stats.mistakeRate).toBe(100);
    expect(stats.shotBreakdown.find((shot) => shot.type === 'smash')?.points).toBe(1);
    expect(stats.shotBreakdown.find((shot) => shot.type === 'smash')?.share).toBe(50);
  });

  it('credits doubles shot breakdown to the player who hit the scoring shot', () => {
    const matchRecord = match(
      ['Arjun', 'Basil'],
      ['Rahul', 'Akhil'],
      [
        point('m1', 1, 'teamA', 'smash', 1, 0, 'Basil'),
        point('m1', 2, 'teamA', 'drop', 2, 0, 'Arjun'),
        point('m1', 3, 'teamB', 'clear', 2, 1, 'Akhil'),
      ],
      'doubles',
    );

    const arjunStats = buildPlayerStats([matchRecord], buildLeaderboard([matchRecord]), 'Arjun');
    const basilStats = buildPlayerStats([matchRecord], buildLeaderboard([matchRecord]), 'Basil');

    expect(arjunStats.shotPointsWon).toBe(1);
    expect(arjunStats.shotBreakdown.find((shot) => shot.type === 'drop')?.points).toBe(1);
    expect(arjunStats.shotBreakdown.find((shot) => shot.type === 'smash')?.points).toBe(0);
    expect(basilStats.shotPointsWon).toBe(1);
    expect(basilStats.shotBreakdown.find((shot) => shot.type === 'smash')?.points).toBe(1);
  });

  it('credits a doubles fault mistake only to the player who made it', () => {
    const matchRecord = match(
      ['Arjun', 'Basil'],
      ['Rahul', 'Akhil'],
      [
        {
          id: 'm1-1',
          matchId: 'm1',
          seq: 1,
          side: 'teamB',
          reason: 'opponent_mistake',
          shotType: 'fault',
          mistakeBy: 'teamA',
          mistakePlayer: 'Arjun',
          teamAScore: 0,
          teamBScore: 1,
          occurredAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      'doubles',
    );

    const arjunStats = buildPlayerStats([matchRecord], buildLeaderboard([matchRecord]), 'Arjun');
    const basilStats = buildPlayerStats([matchRecord], buildLeaderboard([matchRecord]), 'Basil');

    expect(arjunStats.mistakesMade).toBe(1);
    expect(basilStats.mistakesMade).toBe(0);
  });
});

function match(
  teamAPlayers: string[],
  teamBPlayers: string[],
  pointEvents: PointEvent[],
  format: MatchRecord['format'] = 'singles',
): MatchRecord {
  return {
    id: 'm1',
    location: 'Open court',
    format,
    status: 'final',
    targetPoints: 21,
    openingServer: 'teamA',
    teamAPlayers,
    teamBPlayers,
    teamAScore: 3,
    teamBScore: 1,
    winner: 'teamA',
    playedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    pointEvents,
  };
}

function point(
  matchId: string,
  seq: number,
  side: TeamSide,
  shotType: ShotType | null,
  teamAScore: number,
  teamBScore: number,
  scorerPlayer?: string,
): PointEvent {
  return {
    id: `${matchId}-${seq}`,
    matchId,
    seq,
    side,
    reason: shotType ? 'shot' : 'opponent_mistake',
    shotType: shotType ?? undefined,
    scorerPlayer,
    mistakeBy: shotType ? undefined : opponentSide(side),
    teamAScore,
    teamBScore,
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
}
