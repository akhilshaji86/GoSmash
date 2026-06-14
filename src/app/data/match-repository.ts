import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { AddPointInput, AppState, CreateGameInput, CreateMatchInput, GameSession, MatchRecord, TeamSide } from '../domain/models';

export interface MatchRepository {
  readonly state$: Observable<AppState>;

  createGame(input: CreateGameInput): Promise<GameSession>;
  requestToJoinGame(gameId: string, playerName: string): Promise<GameSession>;
  cancelJoinRequest(gameId: string, playerName: string): Promise<GameSession>;
  approveJoinRequest(gameId: string, requestId: string, decisionNote?: string): Promise<GameSession>;
  declineJoinRequest(gameId: string, requestId: string, decisionNote?: string): Promise<GameSession>;
  markGameFull(gameId: string): Promise<GameSession>;
  reopenGame(gameId: string): Promise<GameSession>;
  cancelGame(gameId: string): Promise<GameSession>;
  closeGame(gameId: string): Promise<GameSession>;
  createMatch(input: CreateMatchInput): Promise<MatchRecord>;
  setOpeningServer(matchId: string, side: TeamSide): Promise<MatchRecord>;
  swapOpeningPlayers(matchId: string, side: TeamSide): Promise<MatchRecord>;
  addPoint(matchId: string, side: TeamSide, input?: AddPointInput): Promise<MatchRecord>;
  undoLastPoint(matchId: string): Promise<MatchRecord>;
  finalizeMatch(matchId: string): Promise<MatchRecord>;
  endMatch(matchId: string): Promise<MatchRecord>;
  deleteMatch(matchId: string): Promise<void>;
  resetDemoData(): Promise<void>;
}

export const MATCH_REPOSITORY = new InjectionToken<MatchRepository>('MATCH_REPOSITORY');
