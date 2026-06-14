import { MatchRecord, MatchStatus, TeamSide } from './models';

export type ServiceCourt = 'right' | 'left';

export type ScorePhase = 'rally' | 'game-point' | 'deuce' | 'final';

export interface BadmintonScoreState {
  phase: ScorePhase;
  status: MatchStatus;
  targetPoints: number;
  maxPoints: number;
  lead: number;
  leadingSide?: TeamSide;
  winner?: TeamSide;
}

export type CourtAssignments = Record<TeamSide, Record<ServiceCourt, string>>;

export type VisualCourtLane = 'top' | 'bottom';

export type CourtPlayerRole = 'server' | 'receiver' | 'none';

export interface CourtPlayerView {
  playerName: string;
  serviceCourt: ServiceCourt;
  visualLane: VisualCourtLane;
  role: CourtPlayerRole;
}

const DEFAULT_TARGET_POINTS = 21;
const BADMINTON_POINT_CAP_OFFSET = 9;

export function normalizeTargetPoints(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) return DEFAULT_TARGET_POINTS;
  return Math.max(1, Math.round(value));
}

export function maxBadmintonPoints(targetPoints: number | undefined): number {
  return normalizeTargetPoints(targetPoints) + BADMINTON_POINT_CAP_OFFSET;
}

export function getBadmintonWinner(
  teamAScore: number,
  teamBScore: number,
  targetPoints: number | undefined = DEFAULT_TARGET_POINTS,
): TeamSide | undefined {
  if (teamAScore === teamBScore) return undefined;

  const target = normalizeTargetPoints(targetPoints);
  const cap = maxBadmintonPoints(target);
  const leadingSide: TeamSide = teamAScore > teamBScore ? 'teamA' : 'teamB';
  const highScore = Math.max(teamAScore, teamBScore);
  const lowScore = Math.min(teamAScore, teamBScore);
  const lead = highScore - lowScore;

  if (highScore >= cap) return leadingSide;
  if (highScore >= target && lead >= 2) return leadingSide;

  return undefined;
}

export function getScoreState(match: MatchRecord): BadmintonScoreState {
  const winner = getBadmintonWinner(match.teamAScore, match.teamBScore, match.targetPoints) ?? match.winner;
  const targetPoints = normalizeTargetPoints(match.targetPoints);
  const maxPoints = maxBadmintonPoints(match.targetPoints);
  const lead = Math.abs(match.teamAScore - match.teamBScore);
  const leadingSide =
    match.teamAScore === match.teamBScore ? undefined : match.teamAScore > match.teamBScore ? 'teamA' : 'teamB';

  if (winner || match.status === 'final') {
    return {
      phase: 'final',
      status: 'final',
      targetPoints,
      maxPoints,
      lead,
      leadingSide,
      winner,
    };
  }

  if (match.teamAScore >= targetPoints - 1 && match.teamBScore >= targetPoints - 1 && lead < 2) {
    return {
      phase: 'deuce',
      status: 'recording',
      targetPoints,
      maxPoints,
      lead,
      leadingSide,
    };
  }

  const teamAOnGamePoint = getBadmintonWinner(match.teamAScore + 1, match.teamBScore, targetPoints) === 'teamA';
  const teamBOnGamePoint = getBadmintonWinner(match.teamAScore, match.teamBScore + 1, targetPoints) === 'teamB';

  return {
    phase: teamAOnGamePoint || teamBOnGamePoint ? 'game-point' : 'rally',
    status: 'recording',
    targetPoints,
    maxPoints,
    lead,
    leadingSide,
  };
}

export function getServingSide(match: MatchRecord): TeamSide {
  return match.pointEvents.at(-1)?.side ?? match.openingServer ?? 'teamA';
}

export function getServiceCourt(match: MatchRecord, side: TeamSide = getServingSide(match)): ServiceCourt {
  return sideScore(match, side) % 2 === 0 ? 'right' : 'left';
}

export function getCourtAssignments(match: MatchRecord): CourtAssignments {
  const assignments: CourtAssignments = {
    teamA: initialCourtAssignment(match.teamAPlayers, match.format === 'singles'),
    teamB: initialCourtAssignment(match.teamBPlayers, match.format === 'singles'),
  };

  if (match.format === 'singles') return assignments;

  let servingSide = match.openingServer ?? 'teamA';

  for (const event of match.pointEvents) {
    if (event.side === servingSide) {
      assignments[event.side] = {
        right: assignments[event.side].left,
        left: assignments[event.side].right,
      };
    }

    servingSide = event.side;
  }

  return assignments;
}

export function getCourtPlayerViews(match: MatchRecord, side: TeamSide): CourtPlayerView[] {
  const servingSide = getServingSide(match);
  const serviceCourt = getServiceCourt(match, servingSide);
  const roleFor = (court: ServiceCourt): CourtPlayerRole => {
    if (court !== serviceCourt) return 'none';
    return side === servingSide ? 'server' : 'receiver';
  };

  if (match.format === 'singles') {
    return [
      {
        playerName: (side === 'teamA' ? match.teamAPlayers : match.teamBPlayers)[0] ?? 'Player',
        serviceCourt,
        visualLane: getVisualCourtLane(side, serviceCourt),
        role: roleFor(serviceCourt),
      },
    ];
  }

  const assignments = getCourtAssignments(match)[side];
  return (['right', 'left'] as const).map((court) => ({
    playerName: assignments[court],
    serviceCourt: court,
    visualLane: getVisualCourtLane(side, court),
    role: roleFor(court),
  }));
}

export function getVisualCourtLane(side: TeamSide, court: ServiceCourt): VisualCourtLane {
  if (side === 'teamA') return court === 'right' ? 'bottom' : 'top';
  return court === 'right' ? 'top' : 'bottom';
}

export function sideScore(match: MatchRecord, side: TeamSide): number {
  return side === 'teamA' ? match.teamAScore : match.teamBScore;
}

export function pointWouldFinish(match: MatchRecord, side: TeamSide): boolean {
  const nextA = match.teamAScore + (side === 'teamA' ? 1 : 0);
  const nextB = match.teamBScore + (side === 'teamB' ? 1 : 0);
  return getBadmintonWinner(nextA, nextB, match.targetPoints) === side;
}

function initialCourtAssignment(players: readonly string[], singles: boolean): Record<ServiceCourt, string> {
  const right = players[0] ?? 'Player';
  const left = singles ? right : players[1] ?? right;
  return { right, left };
}
