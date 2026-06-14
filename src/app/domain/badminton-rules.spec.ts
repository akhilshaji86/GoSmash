import {
  getCourtAssignments,
  getCourtPlayerViews,
  getBadmintonWinner,
  getScoreState,
  getServiceCourt,
  getServingSide,
  pointWouldFinish,
} from './badminton-rules';
import { MatchRecord, PointEvent, TeamSide } from './models';

describe('badminton rules', () => {
  it('requires 21 points and a two-point lead before the 30-point cap', () => {
    expect(getBadmintonWinner(20, 0, 21)).toBeUndefined();
    expect(getBadmintonWinner(20, 19, 21)).toBeUndefined();
    expect(getBadmintonWinner(21, 20, 21)).toBeUndefined();
    expect(getBadmintonWinner(21, 19, 21)).toBe('teamA');
    expect(getBadmintonWinner(22, 20, 21)).toBe('teamA');
    expect(getBadmintonWinner(28, 29, 21)).toBeUndefined();
    expect(getBadmintonWinner(29, 29, 21)).toBeUndefined();
    expect(getBadmintonWinner(30, 29, 21)).toBe('teamA');
    expect(getBadmintonWinner(29, 30, 21)).toBe('teamB');
  });

  it('detects deuce and game point states', () => {
    expect(getScoreState(match(20, 20)).phase).toBe('deuce');
    expect(getScoreState(match(20, 18)).phase).toBe('game-point');
    expect(getScoreState(match(11, 8)).phase).toBe('rally');
  });

  it('uses the rally winner as the next serving side', () => {
    const matchRecord = match(2, 1, 'teamB', [
      point(1, 'teamA', 1, 0),
      point(2, 'teamB', 1, 1),
      point(3, 'teamA', 2, 1),
    ]);

    expect(getServingSide(matchRecord)).toBe('teamA');
    expect(getServiceCourt(matchRecord)).toBe('right');
  });

  it('uses the selected opening server before the first point', () => {
    const matchRecord = match(0, 0, 'teamB');

    expect(getServingSide(matchRecord)).toBe('teamB');
    expect(getServiceCourt(matchRecord)).toBe('right');
  });

  it('serves from right on an even singles score and left on an odd singles score', () => {
    expect(getServiceCourt(match(0, 0, 'teamA'))).toBe('right');
    expect(getServiceCourt(match(1, 0, 'teamA', [point(1, 'teamA', 1, 0)]))).toBe('left');
    expect(getServiceCourt(match(2, 1, 'teamA', [point(1, 'teamA', 1, 0), point(2, 'teamB', 1, 1), point(3, 'teamA', 2, 1)]))).toBe('right');
  });

  it('shows one singles player per side and moves them by service court', () => {
    const opening = match(0, 0, 'teamA');
    const afterPoint = match(1, 0, 'teamA', [point(1, 'teamA', 1, 0)]);

    expect(getCourtPlayerViews(opening, 'teamA')).toEqual([
      {
        playerName: 'Arjun',
        serviceCourt: 'right',
        visualLane: 'bottom',
        role: 'server',
      },
    ]);
    expect(getCourtPlayerViews(opening, 'teamB')).toEqual([
      {
        playerName: 'Rahul',
        serviceCourt: 'right',
        visualLane: 'top',
        role: 'receiver',
      },
    ]);
    expect(getCourtPlayerViews(afterPoint, 'teamA')[0].visualLane).toBe('top');
    expect(getCourtPlayerViews(afterPoint, 'teamB')[0].visualLane).toBe('bottom');
  });

  it('knows whether the next rally ends the match', () => {
    expect(pointWouldFinish(match(20, 19), 'teamA')).toBe(true);
    expect(pointWouldFinish(match(20, 20), 'teamA')).toBe(false);
    expect(pointWouldFinish(match(29, 28), 'teamA')).toBe(true);
  });

  it('rotates doubles courts only when the serving side wins', () => {
    const matchRecord = {
      ...match(1, 1, 'teamA', [point(1, 'teamA', 1, 0), point(2, 'teamB', 1, 1)]),
      format: 'doubles' as const,
      teamAPlayers: ['A1', 'A2'],
      teamBPlayers: ['B1', 'B2'],
    };

    const courts = getCourtAssignments(matchRecord);
    const teamAPlayers = getCourtPlayerViews(matchRecord, 'teamA');

    expect(courts.teamA.right).toBe('A2');
    expect(courts.teamA.left).toBe('A1');
    expect(courts.teamB.right).toBe('B1');
    expect(courts.teamB.left).toBe('B2');
    expect(getServingSide(matchRecord)).toBe('teamB');
    expect(getServiceCourt(matchRecord)).toBe('left');
    expect(teamAPlayers).toHaveLength(2);
  });

  it('follows BWF doubles service rotation after service changes sides', () => {
    const matchRecord = {
      ...match(2, 2, 'teamA', [
        point(1, 'teamA', 1, 0),
        point(2, 'teamB', 1, 1),
        point(3, 'teamB', 1, 2),
        point(4, 'teamA', 2, 2),
      ]),
      format: 'doubles' as const,
      teamAPlayers: ['A1', 'A2'],
      teamBPlayers: ['B1', 'B2'],
    };

    const courts = getCourtAssignments(matchRecord);

    expect(getServingSide(matchRecord)).toBe('teamA');
    expect(getServiceCourt(matchRecord)).toBe('right');
    expect(courts.teamA.right).toBe('A2');
    expect(courts.teamA.left).toBe('A1');
    expect(courts.teamB.right).toBe('B2');
    expect(courts.teamB.left).toBe('B1');
    expect(getCourtPlayerViews(matchRecord, 'teamA').find((player) => player.role === 'server')?.playerName).toBe('A2');
    expect(getCourtPlayerViews(matchRecord, 'teamB').find((player) => player.role === 'receiver')?.playerName).toBe('B2');
  });
});

function match(
  teamAScore: number,
  teamBScore: number,
  openingServer: TeamSide = 'teamA',
  pointEvents: PointEvent[] = [],
): MatchRecord {
  return {
    id: 'm1',
    location: 'Open court',
    format: 'singles',
    status: 'recording',
    targetPoints: 21,
    openingServer,
    teamAPlayers: ['Arjun'],
    teamBPlayers: ['Rahul'],
    teamAScore,
    teamBScore,
    playedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    pointEvents,
  };
}

function point(seq: number, side: TeamSide, teamAScore: number, teamBScore: number): PointEvent {
  return {
    id: `p${seq}`,
    matchId: 'm1',
    seq,
    side,
    reason: 'opponent_mistake',
    mistakeBy: side === 'teamA' ? 'teamB' : 'teamA',
    teamAScore,
    teamBScore,
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
}
