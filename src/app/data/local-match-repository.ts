import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { getBadmintonWinner, getCourtAssignments, getServiceCourt, getServingSide } from '../domain/badminton-rules';
import { buildLeaderboard } from '../domain/rating';
import {
  AddPointInput,
  AppState,
  CreateGameInput,
  CreateMatchInput,
  DEFAULT_LOCATION,
  GameJoinRequest,
  GameSession,
  MatchRecord,
  PointEvent,
  PointReason,
  ShotType,
  TeamSide,
  normalizePlayerName,
  opponentSide,
} from '../domain/models';
import { MatchRepository } from './match-repository';

const STORAGE_KEY = 'gosmash.v1.match-state';

@Injectable()
export class LocalMatchRepository implements MatchRepository {
  private readonly storage = safeLocalStorage();
  private readonly stateSubject = new BehaviorSubject<AppState>(this.load());

  readonly state$ = this.stateSubject.asObservable();

  async createGame(input: CreateGameInput): Promise<GameSession> {
    const now = new Date().toISOString();
    const hostName = normalizePlayerName(input.hostName);
    const game: GameSession = {
      id: createId(),
      location: normalizeLocation(input.location),
      scheduledAt: input.scheduledAt || now,
      playersRequired: normalizePlayersRequired(input.playersRequired),
      hostName,
      status: 'open',
      approvedPlayers: [hostName],
      requests: [],
      createdAt: now,
    };

    this.commit(this.stateSubject.value.matches, [game, ...this.stateSubject.value.games]);
    return game;
  }

  async requestToJoinGame(gameId: string, playerName: string): Promise<GameSession> {
    const game = this.findGame(gameId);
    if (game.status !== 'open') return game;

    const normalizedPlayer = normalizePlayerName(playerName);
    if (!normalizedPlayer || includesPlayer(game.approvedPlayers, normalizedPlayer)) return game;

    const existingRequest = game.requests.find((request) => request.playerName.toLowerCase() === normalizedPlayer.toLowerCase());
    if (existingRequest?.status === 'pending' || existingRequest?.status === 'approved') return game;

    const now = new Date().toISOString();
    const requests = [
      ...game.requests.filter((request) => request.playerName.toLowerCase() !== normalizedPlayer.toLowerCase()),
      {
        id: createId(),
        playerName: normalizedPlayer,
        status: 'pending',
        requestedAt: now,
      } satisfies GameJoinRequest,
    ];

    return this.replaceGame({
      ...game,
      requests,
    });
  }

  async cancelJoinRequest(gameId: string, playerName: string): Promise<GameSession> {
    const game = this.findGame(gameId);
    const normalizedPlayer = normalizePlayerName(playerName).toLowerCase();
    const now = new Date().toISOString();

    return this.replaceGame({
      ...game,
      requests: game.requests.map((request) =>
        request.status === 'pending' && request.playerName.toLowerCase() === normalizedPlayer
          ? { ...request, status: 'cancelled', decidedAt: now }
          : request,
      ),
    });
  }

  async approveJoinRequest(gameId: string, requestId: string, decisionNote = ''): Promise<GameSession> {
    const game = this.findGame(gameId);
    const request = game.requests.find((item) => item.id === requestId);
    if (!request) return game;

    const now = new Date().toISOString();
    return this.replaceGame({
      ...game,
      approvedPlayers: includesPlayer(game.approvedPlayers, request.playerName)
        ? game.approvedPlayers
        : [...game.approvedPlayers, request.playerName],
      requests: game.requests.map((item) =>
        item.id === requestId ? { ...item, status: 'approved', decisionNote: normalizePlayerName(decisionNote), decidedAt: now } : item,
      ),
    });
  }

  async declineJoinRequest(gameId: string, requestId: string, decisionNote = ''): Promise<GameSession> {
    const game = this.findGame(gameId);
    const now = new Date().toISOString();

    return this.replaceGame({
      ...game,
      requests: game.requests.map((request) =>
        request.id === requestId ? { ...request, status: 'declined', decisionNote: normalizePlayerName(decisionNote), decidedAt: now } : request,
      ),
    });
  }

  async markGameFull(gameId: string): Promise<GameSession> {
    const game = this.findGame(gameId);
    return this.replaceGame({ ...game, status: 'full' });
  }

  async reopenGame(gameId: string): Promise<GameSession> {
    const game = this.findGame(gameId);
    return this.replaceGame({ ...game, status: 'open' });
  }

  async cancelGame(gameId: string): Promise<GameSession> {
    const game = this.findGame(gameId);
    return this.replaceGame({ ...game, status: 'cancelled' });
  }

  async closeGame(gameId: string): Promise<GameSession> {
    const game = this.findGame(gameId);
    return this.replaceGame({ ...game, status: 'closed' });
  }

  async createMatch(input: CreateMatchInput): Promise<MatchRecord> {
    const now = new Date().toISOString();
    const id = createId();
    const match: MatchRecord = {
      id,
      gameId: input.gameId,
      seriesId: input.seriesId ?? id,
      setNumber: normalizeSetNumber(input.setNumber),
      location: normalizeLocation(input.location),
      format: input.format,
      status: 'recording',
      targetPoints: input.targetPoints,
      openingServer: input.openingServer,
      teamAPlayers: input.teamAPlayers.map(normalizePlayerName),
      teamBPlayers: input.teamBPlayers.map(normalizePlayerName),
      teamAScore: 0,
      teamBScore: 0,
      playedAt: now,
      createdAt: now,
      pointEvents: [],
    };

    this.commit([match, ...this.stateSubject.value.matches]);
    return match;
  }

  async setOpeningServer(matchId: string, side: TeamSide): Promise<MatchRecord> {
    const match = this.findMatch(matchId);

    if (match.status === 'final' || match.pointEvents.length > 0) return match;

    return this.replaceMatch({
      ...match,
      openingServer: side,
    });
  }

  async swapOpeningPlayers(matchId: string, side: TeamSide): Promise<MatchRecord> {
    const match = this.findMatch(matchId);

    if (match.status === 'final' || match.pointEvents.length > 0 || match.format !== 'doubles') return match;

    const nextPlayers =
      side === 'teamA'
        ? { teamAPlayers: match.teamAPlayers.slice().reverse() }
        : { teamBPlayers: match.teamBPlayers.slice().reverse() };

    return this.replaceMatch({
      ...match,
      ...nextPlayers,
    });
  }

  async addPoint(matchId: string, side: TeamSide, input: AddPointInput = { reason: 'opponent_mistake' }): Promise<MatchRecord> {
    const match = this.findMatch(matchId);
    if (match.status === 'final' || getBadmintonWinner(match.teamAScore, match.teamBScore, match.targetPoints)) return match;

    const reason = input.reason === 'shot' && input.shotType && input.shotType !== 'fault' ? 'shot' : 'opponent_mistake';
    const shotType = input.shotType;
    const scorerPlayer = normalizePlayerName(input.scorerPlayer ?? '');
    const mistakePlayer = normalizePlayerName(input.mistakePlayer ?? '');
    const serverSide = getServingSide(match);
    const serverCourt = getServiceCourt(match, serverSide);
    const courtAssignments = getCourtAssignments(match);
    const receiverSide = opponentSide(serverSide);
    const teamAScore = match.teamAScore + (side === 'teamA' ? 1 : 0);
    const teamBScore = match.teamBScore + (side === 'teamB' ? 1 : 0);
    const winner = getBadmintonWinner(teamAScore, teamBScore, match.targetPoints);
    const occurredAt = new Date().toISOString();
    const event: PointEvent = {
      id: createId(),
      matchId,
      side,
      reason,
      shotType,
      scorerPlayer: scorerPlayer || undefined,
      mistakePlayer: reason === 'opponent_mistake' ? mistakePlayer || undefined : undefined,
      mistakeBy: reason === 'opponent_mistake' ? input.mistakeBy ?? opponentSide(side) : undefined,
      serverSide,
      serverCourt,
      serverPlayer: courtAssignments[serverSide][serverCourt],
      receiverPlayer: courtAssignments[receiverSide][serverCourt],
      seq: match.pointEvents.length + 1,
      teamAScore,
      teamBScore,
      occurredAt,
    };

    return this.replaceMatch({
      ...match,
      status: 'recording',
      teamAScore,
      teamBScore,
      winner,
      pointEvents: [...match.pointEvents, event],
    });
  }

  async undoLastPoint(matchId: string): Promise<MatchRecord> {
    const match = this.findMatch(matchId);
    if (match.pointEvents.length === 0) return match;

    const nextEvents = match.pointEvents.slice(0, -1);
    const lastEvent = nextEvents.at(-1);
    const teamAScore = lastEvent?.teamAScore ?? 0;
    const teamBScore = lastEvent?.teamBScore ?? 0;
    const winner = getBadmintonWinner(teamAScore, teamBScore, match.targetPoints);

    return this.replaceMatch({
      ...match,
      status: winner ? 'final' : 'recording',
      teamAScore,
      teamBScore,
      winner,
      pointEvents: nextEvents,
    });
  }

  async finalizeMatch(matchId: string): Promise<MatchRecord> {
    const match = this.findMatch(matchId);
    const winner = getBadmintonWinner(match.teamAScore, match.teamBScore, match.targetPoints);
    if (!winner) return match;

    return this.replaceMatch({
      ...match,
      status: 'final',
      winner,
      playedAt: new Date().toISOString(),
    });
  }

  async endMatch(matchId: string): Promise<MatchRecord> {
    const match = this.findMatch(matchId);
    if (match.status === 'final') return match;

    return this.replaceMatch({
      ...match,
      status: 'final',
      winner: match.winner ?? getBadmintonWinner(match.teamAScore, match.teamBScore, match.targetPoints) ?? leadingSide(match),
      playedAt: new Date().toISOString(),
    });
  }

  async deleteMatch(matchId: string): Promise<void> {
    this.commit(this.stateSubject.value.matches.filter((match) => match.id !== matchId));
  }

  async resetDemoData(): Promise<void> {
    this.commit(seedMatches(), seedGames());
  }

  private findGame(gameId: string): GameSession {
    const game = this.stateSubject.value.games.find((item) => item.id === gameId);

    if (!game) {
      throw new Error(`Game ${gameId} was not found.`);
    }

    return game;
  }

  private replaceGame(nextGame: GameSession): GameSession {
    const games = this.stateSubject.value.games.map((game) => (game.id === nextGame.id ? nextGame : game));
    this.commit(this.stateSubject.value.matches, games);
    return nextGame;
  }

  private findMatch(matchId: string): MatchRecord {
    const match = this.stateSubject.value.matches.find((item) => item.id === matchId);

    if (!match) {
      throw new Error(`Match ${matchId} was not found.`);
    }

    return match;
  }

  private replaceMatch(nextMatch: MatchRecord): MatchRecord {
    const matches = this.stateSubject.value.matches.map((match) => (match.id === nextMatch.id ? nextMatch : match));
    this.commit(matches);
    return nextMatch;
  }

  private load(): AppState {
    if (!this.storage) return buildState(seedMatches(), seedGames());

    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return buildState(seedMatches(), seedGames());

    try {
      const parsed = JSON.parse(raw) as { matches?: unknown[]; games?: unknown[] };
      const matches = parsed.matches?.length ? parsed.matches.map(normalizeStoredMatch) : seedMatches();
      const games = parsed.games?.length ? parsed.games.map(normalizeStoredGame) : seedGames();
      return buildState(matches, games);
    } catch {
      return buildState(seedMatches(), seedGames());
    }
  }

  private commit(matches: MatchRecord[], games = this.stateSubject.value.games): void {
    const state = buildState(matches, games);
    this.storage?.setItem(STORAGE_KEY, JSON.stringify({ matches: state.matches, games: state.games }));
    this.stateSubject.next(state);
  }
}

function buildState(matches: MatchRecord[], games: GameSession[]): AppState {
  return {
    matches,
    games,
    leaderboard: buildLeaderboard(matches),
  };
}

function normalizeStoredMatch(value: unknown): MatchRecord {
  const match = value as MatchRecord & {
    cityId?: string;
    location?: string;
    pointEvents?: Partial<PointEvent>[];
  };
  const id = match.id ?? createId();
  const location = normalizeLocation(match.location ?? legacyLocation(match.cityId));
  const openingServer = match.openingServer ?? 'teamA';
  let teamAScore = 0;
  let teamBScore = 0;
  const pointEvents = (match.pointEvents ?? []).map((event, index) => {
    teamAScore = event.teamAScore ?? teamAScore + (event.side === 'teamA' ? 1 : 0);
    teamBScore = event.teamBScore ?? teamBScore + (event.side === 'teamB' ? 1 : 0);
    const reason: PointReason =
      event.reason === 'shot' && event.shotType && event.shotType !== 'fault' ? 'shot' : 'opponent_mistake';

    return {
      id: event.id ?? createId(),
      matchId: event.matchId ?? id,
      seq: event.seq ?? index + 1,
      side: event.side ?? 'teamA',
      reason,
      shotType: event.shotType,
      scorerPlayer: normalizePlayerName(event.scorerPlayer ?? '') || undefined,
      mistakePlayer: normalizePlayerName(event.mistakePlayer ?? '') || undefined,
      mistakeBy: reason === 'opponent_mistake' ? event.mistakeBy ?? opponentSide(event.side ?? 'teamA') : undefined,
      serverSide: event.serverSide,
      serverCourt: event.serverCourt,
      serverPlayer: event.serverPlayer,
      receiverPlayer: event.receiverPlayer,
      teamAScore,
      teamBScore,
      occurredAt: event.occurredAt ?? match.playedAt ?? new Date().toISOString(),
    } satisfies PointEvent;
  });

  const winner = match.winner ?? getBadmintonWinner(match.teamAScore ?? teamAScore, match.teamBScore ?? teamBScore, match.targetPoints);
  const status = match.status === 'final' ? 'final' : 'recording';

  return {
    id,
    gameId: match.gameId,
    seriesId: match.seriesId ?? id,
    setNumber: normalizeSetNumber(match.setNumber),
    location,
    format: match.format ?? 'singles',
    status,
    targetPoints: match.targetPoints ?? 21,
    openingServer,
    teamAPlayers: (match.teamAPlayers ?? []).map(normalizePlayerName),
    teamBPlayers: (match.teamBPlayers ?? []).map(normalizePlayerName),
    teamAScore: match.teamAScore ?? teamAScore,
    teamBScore: match.teamBScore ?? teamBScore,
    winner,
    playedAt: match.playedAt ?? new Date().toISOString(),
    createdAt: match.createdAt ?? match.playedAt ?? new Date().toISOString(),
    pointEvents,
  };
}

function normalizeStoredGame(value: unknown): GameSession {
  const game = value as Partial<GameSession>;
  const now = new Date().toISOString();
  const hostName = normalizePlayerName(game.hostName ?? 'Arjun Nair') || 'Arjun Nair';
  const approvedPlayers = (game.approvedPlayers?.length ? game.approvedPlayers : [hostName])
    .map(normalizePlayerName)
    .filter(Boolean);

  if (!includesPlayer(approvedPlayers, hostName)) {
    approvedPlayers.unshift(hostName);
  }

  return {
    id: game.id ?? createId(),
    location: normalizeLocation(game.location),
    scheduledAt: game.scheduledAt ?? now,
    playersRequired: normalizePlayersRequired(game.playersRequired),
    hostName,
    status: normalizeGameStatus(game.status),
    approvedPlayers,
    requests: (game.requests ?? []).map((request) => ({
      id: request.id ?? createId(),
      playerName: normalizePlayerName(request.playerName) || 'Player',
      status:
        request.status === 'approved' ||
        request.status === 'declined' ||
        request.status === 'pending' ||
        request.status === 'cancelled'
          ? request.status
          : 'pending',
      decisionNote: normalizePlayerName(request.decisionNote ?? ''),
      requestedAt: request.requestedAt ?? now,
      decidedAt: request.decidedAt,
    })),
    createdAt: game.createdAt ?? now,
  };
}

function normalizeSetNumber(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}

function leadingSide(match: Pick<MatchRecord, 'teamAScore' | 'teamBScore'>): TeamSide | undefined {
  if (match.teamAScore === match.teamBScore) return undefined;
  return match.teamAScore > match.teamBScore ? 'teamA' : 'teamB';
}

function legacyLocation(cityId: string | undefined): string {
  if (cityId === 'kochi') return 'Kochi';
  if (cityId === 'tvm') return 'Thiruvananthapuram';
  return DEFAULT_LOCATION;
}

function normalizeLocation(value: string | undefined): string {
  const location = normalizePlayerName(value ?? '');
  return location || DEFAULT_LOCATION;
}

function normalizePlayersRequired(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 4;
  return Math.min(20, Math.max(2, Math.round(value)));
}

function normalizeGameStatus(status: GameSession['status'] | undefined): GameSession['status'] {
  if (status === 'full' || status === 'cancelled' || status === 'closed') return status;
  return 'open';
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function seedMatches(): MatchRecord[] {
  const startedAt = new Date();
  const daysAgo = (days: number) => new Date(startedAt.getTime() - days * 86_400_000).toISOString();

  return [
    finalMatch('Kakkanad Club', 'singles', ['Arjun Nair'], ['Rahul Menon'], 21, 18, daysAgo(1)),
    finalMatch('Open court', 'singles', ['Nikhil Jose'], ['Arjun Nair'], 19, 21, daysAgo(3)),
    finalMatch('Weekend league', 'singles', ['Devika Raj'], ['Kiran S'], 21, 16, daysAgo(2)),
    finalMatch('Community night', 'doubles', ['Kiran S', 'Maya N'], ['Devika Raj', 'Akhil P'], 22, 20, daysAgo(5)),
  ];
}

function seedGames(): GameSession[] {
  const startedAt = new Date();
  const hoursFromNow = (hours: number) => new Date(startedAt.getTime() + hours * 3_600_000).toISOString();

  return [
    {
      id: createId(),
      location: 'Kakkanad Club',
      scheduledAt: hoursFromNow(4),
      playersRequired: 4,
      hostName: 'Arjun Nair',
      status: 'open',
      approvedPlayers: ['Arjun Nair', 'Rahul Menon', 'Nikhil Jose'],
      requests: [
        {
          id: createId(),
          playerName: 'Maya N',
          status: 'pending',
          requestedAt: hoursFromNow(-1),
        },
      ],
      createdAt: hoursFromNow(-3),
    },
    {
      id: createId(),
      location: 'Open court',
      scheduledAt: hoursFromNow(28),
      playersRequired: 4,
      hostName: 'Devika Raj',
      status: 'open',
      approvedPlayers: ['Devika Raj', 'Kiran S', 'Akhil P'],
      requests: [],
      createdAt: hoursFromNow(-8),
    },
  ];
}

function finalMatch(
  location: string,
  format: MatchRecord['format'],
  teamAPlayers: string[],
  teamBPlayers: string[],
  teamAScore: number,
  teamBScore: number,
  playedAt: string,
): MatchRecord {
  const id = createId();
  const winner = teamAScore > teamBScore ? 'teamA' : 'teamB';

  return {
    id,
    seriesId: id,
    setNumber: 1,
    location,
    format,
    status: 'final',
    targetPoints: 21,
    openingServer: 'teamA',
    teamAPlayers,
    teamBPlayers,
    teamAScore,
    teamBScore,
    winner,
    playedAt,
    createdAt: playedAt,
    pointEvents: seedPointEvents(id, teamAScore, teamBScore, winner, playedAt),
  };
}

function seedPointEvents(
  matchId: string,
  teamAScore: number,
  teamBScore: number,
  winner: TeamSide,
  occurredAt: string,
): PointEvent[] {
  const winnerScore = winner === 'teamA' ? teamAScore : teamBScore;
  const loserScore = winner === 'teamA' ? teamBScore : teamAScore;
  const sequence: TeamSide[] = [];

  for (let index = 0; index < Math.max(winnerScore, loserScore); index += 1) {
    if (index < winnerScore) sequence.push(winner);
    if (index < loserScore) sequence.push(opponentSide(winner));
  }

  let a = 0;
  let b = 0;

  return sequence.map((side, index) => {
    a += side === 'teamA' ? 1 : 0;
    b += side === 'teamB' ? 1 : 0;

    const shotType = SHOT_SEQUENCE[index % SHOT_SEQUENCE.length];
    const reason: PointReason = index % 4 === 1 ? 'opponent_mistake' : 'shot';

    return {
      id: createId(),
      matchId,
      seq: index + 1,
      side,
      reason,
      shotType,
      mistakeBy: reason === 'opponent_mistake' ? opponentSide(side) : undefined,
      teamAScore: a,
      teamBScore: b,
      occurredAt,
    };
  });
}

const SHOT_SEQUENCE: ShotType[] = ['smash', 'drop', 'clear', 'net', 'lob'];

function includesPlayer(players: readonly string[], playerName: string): boolean {
  const normalizedPlayer = normalizePlayerName(playerName).toLowerCase();
  return players.some((player) => player.toLowerCase() === normalizedPlayer);
}
