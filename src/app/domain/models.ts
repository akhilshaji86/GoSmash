export type MatchFormat = 'singles' | 'doubles';

export type TeamSide = 'teamA' | 'teamB';

export type MatchStatus = 'recording' | 'final';

export type GameSessionStatus = 'open' | 'full' | 'cancelled' | 'closed';

export type JoinRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export type ShotType = 'smash' | 'clear' | 'drop' | 'net' | 'lob' | 'fault';

export type PointReason = 'shot' | 'opponent_mistake';

export interface ShotOption {
  type: ShotType;
  label: string;
  shortLabel: string;
}

export interface PointEvent {
  id: string;
  matchId: string;
  seq: number;
  side: TeamSide;
  reason: PointReason;
  shotType?: ShotType;
  scorerPlayer?: string;
  mistakePlayer?: string;
  mistakeBy?: TeamSide;
  serverSide?: TeamSide;
  serverCourt?: 'right' | 'left';
  serverPlayer?: string;
  receiverPlayer?: string;
  teamAScore: number;
  teamBScore: number;
  occurredAt: string;
}

export interface MatchRecord {
  id: string;
  gameId?: string;
  seriesId?: string;
  setNumber?: number;
  location: string;
  format: MatchFormat;
  status: MatchStatus;
  targetPoints: number;
  openingServer: TeamSide;
  teamAPlayers: string[];
  teamBPlayers: string[];
  teamAScore: number;
  teamBScore: number;
  winner?: TeamSide;
  playedAt: string;
  createdAt: string;
  pointEvents: PointEvent[];
}

export interface CreateMatchInput {
  gameId?: string;
  seriesId?: string;
  setNumber?: number;
  location: string;
  format: MatchFormat;
  targetPoints: number;
  openingServer: TeamSide;
  teamAPlayers: string[];
  teamBPlayers: string[];
}

export interface GameJoinRequest {
  id: string;
  playerName: string;
  status: JoinRequestStatus;
  decisionNote?: string;
  requestedAt: string;
  decidedAt?: string;
}

export interface GameSession {
  id: string;
  location: string;
  scheduledAt: string;
  playersRequired: number;
  hostName: string;
  status: GameSessionStatus;
  approvedPlayers: string[];
  requests: GameJoinRequest[];
  createdAt: string;
}

export interface CreateGameInput {
  location: string;
  scheduledAt: string;
  playersRequired: number;
  hostName: string;
}

export interface AddPointInput {
  reason: PointReason;
  shotType?: ShotType;
  scorerPlayer?: string;
  mistakePlayer?: string;
  mistakeBy?: TeamSide;
}

export interface LeaderboardEntry {
  playerName: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  winRate: number;
  lastPlayedAt: string;
}

export interface AppState {
  matches: MatchRecord[];
  games: GameSession[];
  leaderboard: LeaderboardEntry[];
}

export const SHOT_OPTIONS: readonly ShotOption[] = [
  { type: 'smash', label: 'Smash', shortLabel: 'Sm' },
  { type: 'drop', label: 'Drop Shot', shortLabel: 'Dr' },
  { type: 'clear', label: 'Clear', shortLabel: 'Cl' },
  { type: 'net', label: 'Net Shot', shortLabel: 'Nt' },
  { type: 'lob', label: 'Trick Shot', shortLabel: 'Tr' },
  { type: 'fault', label: 'Fault', shortLabel: 'Ft' },
];

export const DEFAULT_LOCATION = 'Open play';

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function parsePlayers(value: string): string[] {
  return value
    .split(/[,+/]/)
    .map(normalizePlayerName)
    .filter(Boolean);
}

export function teamLabel(players: readonly string[]): string {
  return players.join(' / ');
}

export function opponentSide(side: TeamSide): TeamSide {
  return side === 'teamA' ? 'teamB' : 'teamA';
}

export function shotLabel(type: ShotType): string {
  return SHOT_OPTIONS.find((option) => option.type === type)?.label ?? type;
}
