import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { MATCH_REPOSITORY, MatchRepository } from './data/match-repository';
import { AddPointInput, AppState, CreateMatchInput, GameSession, MatchRecord, TeamSide } from './domain/models';
import { GosmashStateService } from './gosmash-state.service';

describe('GosmashStateService', () => {
  it('auto-fills the receiving side for a four-player hosted doubles game', () => {
    const service = setupService([
      {
        id: 'game-1',
        location: 'Kochi',
        scheduledAt: '2026-06-07T12:00:00.000Z',
        playersRequired: 4,
        hostName: 'Arjun Nair',
        status: 'open',
        approvedPlayers: ['Arjun Nair', 'Basil Test', 'Anoop Test', 'Akhil P'],
        requests: [],
        createdAt: '2026-06-07T10:00:00.000Z',
      },
    ]);

    service.selectGame('game-1');
    service.toggleMatchPlayer('teamAPlayers', 'Basil Test');
    service.autoFillHostedDoublesRemainder('teamAPlayers');

    expect(service.matchForm.controls.format.value).toBe('doubles');
    expect(service.matchSidePlayers('teamAPlayers')).toEqual(['Arjun Nair', 'Basil Test']);
    expect(service.matchSidePlayers('teamBPlayers')).toEqual(['Akhil P', 'Anoop Test']);
    expect(service.canAutoStartHostedDoublesMatch()).toBe(true);
  });

  it('uses fault as the quick mistake action instead of point', () => {
    const service = setupService([]);

    expect(service.quickScoreOptions.map((option) => option.label)).toEqual([
      'Smash',
      'Drop Shot',
      'Clear',
      'Net Shot',
      'Trick Shot',
      'Fault',
    ]);
  });

  it('records a player fault as the opposite side point', async () => {
    const recorded = { side: null as TeamSide | null, input: undefined as AddPointInput | undefined };
    const service = setupService([], {
      addPoint: async (_matchId, side, input) => {
        recorded.side = side;
        recorded.input = input;
        return {} as MatchRecord;
      },
    }, [recordingMatch()]);

    await service.addQuickPoint('match-1', 'teamA', 'fault', 'Arjun Nair');

    expect(recorded.side).toBe('teamB');
    expect(recorded.input).toEqual({
      reason: 'opponent_mistake',
      shotType: 'fault',
      mistakeBy: 'teamA',
      mistakePlayer: 'Arjun Nair',
    });
  });

  it('locks point entry after a legal finish until the completion decision is made', async () => {
    let pointAdded = false;
    const service = setupService([], {
      addPoint: async () => {
        pointAdded = true;
        return {} as MatchRecord;
      },
    }, [{ ...recordingMatch(), teamAScore: 21, teamBScore: 19 }]);

    await service.addQuickPoint('match-1', 'teamA', 'smash', 'Arjun Nair');

    expect(pointAdded).toBe(false);
    expect(service.completionMatch()?.id).toBe('match-1');
  });

  it('opens an explicit end game dialog during an unfinished match', async () => {
    let pointAdded = false;
    const service = setupService([], {
      addPoint: async () => {
        pointAdded = true;
        return {} as MatchRecord;
      },
    }, [{ ...recordingMatch(), teamAScore: 10, teamBScore: 8 }]);

    service.openEndGameDialog('match-1');
    await service.addQuickPoint('match-1', 'teamA', 'smash', 'Arjun Nair');

    expect(service.completionMatch()?.id).toBe('match-1');
    expect(service.canFinalize(service.completionMatch()!)).toBe(false);
    expect(pointAdded).toBe(false);

    service.closeEndGameDialog();
    await service.addQuickPoint('match-1', 'teamA', 'smash', 'Arjun Nair');

    expect(service.completionMatch()).toBeNull();
    expect(pointAdded).toBe(true);
  });

  it('saves an unfinished recording when end game is confirmed', async () => {
    let endedId = '';
    let deleted = false;
    let finalizeCalled = false;
    const unfinishedMatch = { ...recordingMatch(), teamAScore: 10, teamBScore: 8 };
    const service = setupService([], {
      deleteMatch: async (matchId) => {
        deleted = true;
      },
      finalizeMatch: async () => {
        finalizeCalled = true;
        return {} as MatchRecord;
      },
      endMatch: async (matchId) => {
        endedId = matchId;
        return { ...unfinishedMatch, status: 'final' as const, winner: 'teamA' as const };
      },
    }, [unfinishedMatch]);

    service.openEndGameDialog('match-1');
    await service.endGame('match-1');

    expect(endedId).toBe('match-1');
    expect(deleted).toBe(false);
    expect(finalizeCalled).toBe(false);
    expect(service.completionMatch()).toBeNull();
  });

  it('finalizes the completed game before starting the next set with the winner serving first', async () => {
    let finalizedId = '';
    let createInput: CreateMatchInput | undefined;
    const completedMatch = { ...recordingMatch(), teamAScore: 21, teamBScore: 19, winner: 'teamA' as const };
    const service = setupService([], {
      finalizeMatch: async (matchId) => {
        finalizedId = matchId;
        return { ...completedMatch, status: 'final' };
      },
      createMatch: async (input) => {
        createInput = input;
        return { ...recordingMatch(), id: 'set-2', ...input, teamAScore: 0, teamBScore: 0, pointEvents: [] };
      },
    }, [completedMatch]);

    await service.startNextSet('match-1');

    expect(finalizedId).toBe('match-1');
    expect(createInput).toEqual({
      gameId: 'game-1',
      seriesId: 'series-1',
      setNumber: 2,
      location: 'Kakkanad Club',
      format: 'singles',
      targetPoints: 21,
      openingServer: 'teamA',
      teamAPlayers: ['Arjun Nair'],
      teamBPlayers: ['Rahul Menon'],
    });
    expect(service.selectedMatchId()).toBe('set-2');
  });

  it('starts a new doubles match from a different approved group pairing', async () => {
    let createInput: CreateMatchInput | undefined;
    const completedMatch = {
      ...recordingMatch(),
      format: 'doubles' as const,
      teamAPlayers: ['Arjun Nair', 'Basil Test'],
      teamBPlayers: ['Anoop Test', 'Akhil P'],
      teamAScore: 21,
      teamBScore: 19,
      winner: 'teamA' as const,
    };
    const service = setupService([
      {
        id: 'game-1',
        location: 'Kakkanad Club',
        scheduledAt: '2026-06-07T12:00:00.000Z',
        playersRequired: 6,
        hostName: 'Arjun Nair',
        status: 'open',
        approvedPlayers: ['Arjun Nair', 'Basil Test', 'Anoop Test', 'Akhil P', 'Maya N', 'Devika Raj'],
        requests: [],
        createdAt: '2026-06-07T10:00:00.000Z',
      },
    ], {
      finalizeMatch: async () => ({ ...completedMatch, status: 'final' }),
      createMatch: async (input) => {
        createInput = input;
        return { ...completedMatch, id: 'new-match', ...input, teamAScore: 0, teamBScore: 0, pointEvents: [], winner: undefined };
      },
    }, [completedMatch]);

    service.openReplayPicker(completedMatch);
    service.removeReplayPlayer('replayTeamAPlayers', 'Basil Test');
    service.toggleReplayPlayer('replayTeamAPlayers', 'Maya N', completedMatch);
    service.removeReplayPlayer('replayTeamBPlayers', 'Akhil P');
    service.toggleReplayPlayer('replayTeamBPlayers', 'Devika Raj', completedMatch);

    await service.startNewMatchFromGroup('match-1');

    expect(createInput?.teamAPlayers).toEqual(['Arjun Nair', 'Maya N']);
    expect(createInput?.teamBPlayers).toEqual(['Anoop Test', 'Devika Raj']);
    expect(createInput?.setNumber).toBeUndefined();
    expect(service.selectedMatchId()).toBe('new-match');
  });
});

function setupService(
  games: GameSession[],
  repositoryOverrides: Partial<MatchRepository> = {},
  matches: MatchRecord[] = [],
): GosmashStateService {
  TestBed.resetTestingModule();
  const state = new BehaviorSubject<AppState>({ matches, games, leaderboard: [] });
  const repository = {
    state$: state.asObservable(),
    ...repositoryOverrides,
  } as MatchRepository;

  TestBed.configureTestingModule({
    providers: [GosmashStateService, { provide: MATCH_REPOSITORY, useValue: repository }],
  });

  return TestBed.inject(GosmashStateService);
}

function recordingMatch(): MatchRecord {
  return {
    id: 'match-1',
    gameId: 'game-1',
    seriesId: 'series-1',
    setNumber: 1,
    location: 'Kakkanad Club',
    format: 'singles',
    status: 'recording',
    targetPoints: 21,
    openingServer: 'teamA',
    teamAPlayers: ['Arjun Nair'],
    teamBPlayers: ['Rahul Menon'],
    teamAScore: 0,
    teamBScore: 0,
    playedAt: '2026-06-07T12:00:00.000Z',
    createdAt: '2026-06-07T12:00:00.000Z',
    pointEvents: [],
  };
}
