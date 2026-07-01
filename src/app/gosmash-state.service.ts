import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import {
  CourtPlayerView,
  CourtPlayerRole,
  ServiceCourt,
  VisualCourtLane,
  getCourtAssignments,
  getCourtPlayerViews,
  getScoreState,
  getServiceCourt,
  getServingSide,
} from './domain/badminton-rules';
import { MATCH_REPOSITORY } from './data/match-repository';
import {
  AppState,
  DEFAULT_LOCATION,
  MatchFormat,
  MatchRecord,
  PointEvent,
  SHOT_OPTIONS,
  ShotType,
  TeamSide,
  normalizePlayerName,
  opponentSide,
  parsePlayers,
  shotLabel,
  teamLabel,
} from './domain/models';
import { buildPlayerStats } from './domain/player-stats';

interface UserProfile {
  playerName: string;
  email: string;
  homeBase: string;
}

interface QuickScoreOption {
  type: ShotType;
  label: string;
  shortLabel: string;
}

interface QuickScorePlayer {
  side: TeamSide;
  playerName: string;
  role: CourtPlayerRole;
  score: number;
}

interface QuickScoreGroup {
  side: TeamSide;
  label: string;
  score: number;
  players: QuickScorePlayer[];
}

type MatchPlayerControlName = 'teamAPlayers' | 'teamBPlayers';
type ReplayPlayerControlName = 'replayTeamAPlayers' | 'replayTeamBPlayers';
type ScoreMode = 'quick' | 'classic';
type RecordLayoutMode = 'normal' | 'rotated';

const PROFILE_STORAGE_KEY = 'gosmash.v1.profile';
const SCORE_MODE_STORAGE_KEY = 'gosmash.v1.score-mode';
const RECORD_LAYOUT_STORAGE_KEY = 'gosmash.v1.record-layout';

@Injectable({ providedIn: 'root' })
export class GosmashStateService {
  private readonly repository = inject(MATCH_REPOSITORY);
  private readonly formBuilder = inject(FormBuilder);
  private readonly storage = safeLocalStorage();
  private readonly initialProfile = loadProfile(this.storage);

  readonly shotOptions = SHOT_OPTIONS;
  readonly quickScoreOptions: readonly QuickScoreOption[] = SHOT_OPTIONS;
  readonly selectedMatchId = signal<string | null>(null);
  readonly selectedGameId = signal<string | null>(null);
  readonly gameLocationFilter = signal<string | null>(null);
  readonly showGameFilters = signal(false);
  readonly selectedShotType = signal<ShotType | null>(null);
  readonly scoreMode = signal<ScoreMode>(loadScoreMode(this.storage));
  readonly recordLayoutMode = signal<RecordLayoutMode>(loadRecordLayoutMode(this.storage));
  readonly createGameFormOpen = signal(false);
  readonly endGameDialogMatchId = signal<string | null>(null);
  readonly replayPickerOpen = signal(false);
  readonly replayTeamAPlayers = signal<string[]>([]);
  readonly replayTeamBPlayers = signal<string[]>([]);
  readonly decisionNotes = signal<Record<string, string>>({});
  readonly currentPlayerName = signal(this.initialProfile.playerName);
  readonly currentFirstName = computed(() => this.currentPlayerName().split(/\s+/)[0] || 'Player');
  readonly profileInitials = computed(() =>
    this.currentPlayerName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'P',
  );
  readonly formError = signal<string | null>(null);
  readonly profileSaved = signal(false);
  readonly state = toSignal(this.repository.state$, {
    initialValue: { matches: [], games: [], leaderboard: [] } satisfies AppState,
  });

  readonly matchForm = this.formBuilder.nonNullable.group({
    location: [this.initialProfile.homeBase || DEFAULT_LOCATION, Validators.required],
    format: ['singles' as MatchFormat, Validators.required],
    targetPoints: [21, [Validators.required, Validators.min(1), Validators.max(99)]],
    openingServer: ['teamA' as TeamSide, Validators.required],
    teamAPlayers: [this.initialProfile.playerName, Validators.required],
    teamBPlayers: ['', Validators.required],
  });

  readonly gameForm = this.formBuilder.nonNullable.group({
    location: [this.initialProfile.homeBase || DEFAULT_LOCATION, Validators.required],
    playersRequired: [4, [Validators.required, Validators.min(2), Validators.max(20)]],
    scheduledAt: [localDateTimeInputValue(2), Validators.required],
  });

  readonly accountForm = this.formBuilder.nonNullable.group({
    playerName: [this.initialProfile.playerName, Validators.required],
    email: [this.initialProfile.email],
    homeBase: [this.initialProfile.homeBase, Validators.required],
  });

  readonly visibleLeaderboard = computed(() => this.state().leaderboard.slice(0, 12));

  readonly recentMatches = computed(() => this.state().matches.slice(0, 8));

  readonly recordingMatches = computed(() => this.state().matches.filter((match) => match.status === 'recording'));

  readonly activeMatch = computed(() => {
    const matches = this.state().matches;
    const selected = this.selectedMatchId();

    return (
      matches.find((match) => match.id === selected) ??
      matches.find((match) => match.status === 'recording') ??
      null
    );
  });

  readonly completionMatch = computed(() => {
    const match = this.activeMatch();
    if (!match || match.status === 'final') return null;
    if (this.matchNeedsCompletionDecision(match)) return match;
    return this.endGameDialogMatchId() === match.id ? match : null;
  });

  readonly playerStats = computed(() =>
    buildPlayerStats(this.state().matches, this.state().leaderboard, this.currentPlayerName()),
  );

  readonly summary = computed(() => ({
    players: this.state().leaderboard.length,
    completed: this.state().matches.filter((match) => match.status === 'final').length,
    recording: this.recordingMatches().length,
  }));

  readonly gameLocations = computed(() => {
    const locations = new Set<string>();
    for (const game of this.state().games) {
      if (game.status === 'open' || game.status === 'full') {
        locations.add(game.location);
      }
    }
    return [...locations].filter(Boolean).sort((a, b) => a.localeCompare(b));
  });

  readonly visibleGames = computed(() => {
    const selectedLocation = this.gameLocationFilter()?.toLowerCase() ?? null;
    return this.state()
      .games.filter((game) => {
        if (game.status !== 'open' && game.status !== 'full') return false;
        if (!selectedLocation) return true;
        return game.location.toLowerCase() === selectedLocation;
      })
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  });

  readonly selectedGame = computed(() => {
    const selected = this.selectedGameId();
    return (
      this.state().games.find((game) => game.id === selected && (game.status === 'open' || game.status === 'full')) ??
      this.visibleGames()[0] ??
      null
    );
  });

  readonly hasStartableGame = computed(() => {
    const currentPlayer = this.currentPlayerName().toLowerCase();
    return this.state().games.some((game) => {
      if (game.status !== 'open' && game.status !== 'full') return false;
      if (game.hostName.toLowerCase() === currentPlayer) return true;
      return this.isPlayerInList(game.approvedPlayers, this.currentPlayerName());
    });
  });

  readonly selectedGameTitle = computed(() => this.selectedGame()?.location ?? 'New match');

  readonly hostedPendingRequests = computed(() => {
    const hostName = this.currentPlayerName().toLowerCase();
    return this.state().games.flatMap((game) => {
      if (game.hostName.toLowerCase() !== hostName) return [];
      return game.requests
        .filter((request) => request.status === 'pending')
        .map((request) => ({ game, request }));
    });
  });

  readonly hostedPendingRequestCount = computed(() => this.hostedPendingRequests().length);

  readonly matchPlayerPool = computed(() => {
    const selectedGame = this.selectedGame();
    if (!selectedGame) return this.registeredPlayers();
    return selectedGame.approvedPlayers.slice().sort((a, b) => a.localeCompare(b));
  });

  readonly registeredPlayers = computed(() => {
    const names = new Map<string, string>();
    const add = (value: string) => {
      const name = normalizePlayerName(value);
      if (name) names.set(name.toLowerCase(), name);
    };

    add(this.currentPlayerName());

    for (const player of this.state().leaderboard) {
      add(player.playerName);
    }

    for (const match of this.state().matches) {
      match.teamAPlayers.forEach(add);
      match.teamBPlayers.forEach(add);
    }

    for (const game of this.state().games) {
      add(game.hostName);
      game.approvedPlayers.forEach(add);
      game.requests.forEach((request) => add(request.playerName));
    }

    return [...names.values()].sort((a, b) => a.localeCompare(b));
  });

  readonly selectedPointLabel = computed(() => {
    const shotType = this.selectedShotType();
    return shotType ? shotLabel(shotType) : 'Choose action';
  });

  selectFormat(format: MatchFormat): void {
    this.matchForm.controls.format.setValue(format);
    this.trimMatchPlayers('teamAPlayers');
    this.trimMatchPlayers('teamBPlayers');
  }

  toggleGameFilters(): void {
    this.showGameFilters.update((value) => !value);
  }

  selectGameLocation(location: string | null): void {
    this.gameLocationFilter.set(location);
    const firstGame = this.state()
      .games.filter((game) => {
        if (game.status !== 'open' && game.status !== 'full') return false;
        if (!location) return true;
        return game.location.toLowerCase() === location.toLowerCase();
      })
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];

    if (firstGame) {
      this.selectGame(firstGame.id);
    } else {
      this.selectedGameId.set(null);
    }
  }

  selectGame(gameId: string): void {
    const game = this.state().games.find((item) => item.id === gameId);
    if (!game) return;

    this.selectedGameId.set(game.id);
    this.matchForm.patchValue({
      location: game.location,
      format: game.playersRequired >= 4 || game.approvedPlayers.length >= 4 ? 'doubles' : 'singles',
      openingServer: 'teamA',
      teamAPlayers: game.approvedPlayers.includes(this.currentPlayerName())
        ? this.currentPlayerName()
        : game.approvedPlayers[0] ?? this.currentPlayerName(),
      teamBPlayers: '',
    });
  }

  isSelectedGame(gameId: string): boolean {
    return this.selectedGame()?.id === gameId;
  }

  selectOpeningServer(side: TeamSide): void {
    this.matchForm.controls.openingServer.setValue(side);
  }

  selectShot(shotType: ShotType | null): void {
    this.selectedShotType.set(shotType);
  }

  selectScoreMode(mode: ScoreMode): void {
    this.scoreMode.set(mode);
    this.storage?.setItem(SCORE_MODE_STORAGE_KEY, mode);
    if (mode === 'quick') {
      this.selectedShotType.set(null);
    }
  }

  toggleRecordLayout(): void {
    const nextMode: RecordLayoutMode = this.recordLayoutMode() === 'normal' ? 'rotated' : 'normal';
    this.recordLayoutMode.set(nextMode);
    this.storage?.setItem(RECORD_LAYOUT_STORAGE_KEY, nextMode);
  }

  openCreateGameForm(): void {
    this.createGameFormOpen.set(true);
  }

  closeCreateGameForm(): void {
    this.createGameFormOpen.set(false);
  }

  setDecisionNote(requestId: string, note: string): void {
    this.decisionNotes.update((notes) => ({ ...notes, [requestId]: note }));
  }

  decisionNote(requestId: string): string {
    return this.decisionNotes()[requestId] ?? '';
  }

  async setOpeningServer(matchId: string, side: TeamSide): Promise<void> {
    await this.repository.setOpeningServer(matchId, side);
  }

  async swapOpeningPlayers(matchId: string, side: TeamSide): Promise<void> {
    await this.repository.swapOpeningPlayers(matchId, side);
  }

  async createGame(): Promise<void> {
    this.formError.set(null);

    if (this.gameForm.invalid) {
      this.formError.set('Set a game location and time.');
      return;
    }

    const value = this.gameForm.getRawValue();
    const game = await this.repository.createGame({
      location: value.location,
      scheduledAt: new Date(value.scheduledAt).toISOString(),
      playersRequired: value.playersRequired,
      hostName: this.currentPlayerName(),
    });

    this.createGameFormOpen.set(false);
    this.selectGame(game.id);
  }

  async requestToJoinGame(gameId: string): Promise<void> {
    await this.repository.requestToJoinGame(gameId, this.currentPlayerName());
  }

  async cancelJoinRequest(gameId: string): Promise<void> {
    await this.repository.cancelJoinRequest(gameId, this.currentPlayerName());
  }

  async approveJoinRequest(gameId: string, requestId: string): Promise<void> {
    const note = this.decisionNotes()[requestId] ?? '';
    await this.repository.approveJoinRequest(gameId, requestId, note);
    this.clearDecisionNote(requestId);
  }

  async declineJoinRequest(gameId: string, requestId: string): Promise<void> {
    const note = this.decisionNotes()[requestId] ?? '';
    await this.repository.declineJoinRequest(gameId, requestId, note);
    this.clearDecisionNote(requestId);
  }

  async markGameFull(gameId: string): Promise<void> {
    await this.repository.markGameFull(gameId);
  }

  async reopenGame(gameId: string): Promise<void> {
    await this.repository.reopenGame(gameId);
  }

  async cancelGame(gameId: string): Promise<void> {
    await this.repository.cancelGame(gameId);
    if (this.selectedGameId() === gameId) {
      this.selectedGameId.set(null);
    }
  }

  isGameHost(gameId: string): boolean {
    const game = this.state().games.find((item) => item.id === gameId);
    return game?.hostName.toLowerCase() === this.currentPlayerName().toLowerCase();
  }

  isApprovedForGame(gameId: string): boolean {
    const game = this.state().games.find((item) => item.id === gameId);
    return game ? this.isPlayerInList(game.approvedPlayers, this.currentPlayerName()) : false;
  }

  canStartGame(gameId: string): boolean {
    return this.isGameHost(gameId) || this.isApprovedForGame(gameId);
  }

  pendingRequestForCurrentPlayer(gameId: string): boolean {
    const game = this.state().games.find((item) => item.id === gameId);
    return (
      game?.requests.some(
        (request) =>
          request.status === 'pending' && request.playerName.toLowerCase() === this.currentPlayerName().toLowerCase(),
      ) ?? false
    );
  }

  approvedSlotsLabel(gameId: string): string {
    const game = this.state().games.find((item) => item.id === gameId);
    if (!game) return '';
    return `${game.approvedPlayers.length}/${game.playersRequired}`;
  }

  pendingRequests(gameId: string) {
    return this.state().games.find((item) => item.id === gameId)?.requests.filter((request) => request.status === 'pending') ?? [];
  }

  matchSidePlayers(controlName: MatchPlayerControlName): string[] {
    return parsePlayers(this.matchForm.controls[controlName].value);
  }

  isMatchPlayerSelected(controlName: MatchPlayerControlName, playerName: string): boolean {
    const normalizedPlayer = normalizePlayerName(playerName).toLowerCase();
    return this.matchSidePlayers(controlName).some((selected) => selected.toLowerCase() === normalizedPlayer);
  }

  isMatchPlayerUnavailable(controlName: MatchPlayerControlName, playerName: string): boolean {
    const otherControl = controlName === 'teamAPlayers' ? 'teamBPlayers' : 'teamAPlayers';
    return this.isMatchPlayerSelected(otherControl, playerName);
  }

  toggleMatchPlayer(controlName: MatchPlayerControlName, playerName: string): void {
    const normalizedPlayer = normalizePlayerName(playerName);
    if (!normalizedPlayer) return;

    const selectedPlayers = this.matchSidePlayers(controlName);
    const existingIndex = selectedPlayers.findIndex((selected) => selected.toLowerCase() === normalizedPlayer.toLowerCase());

    if (existingIndex >= 0) {
      selectedPlayers.splice(existingIndex, 1);
    } else if (this.isMatchPlayerUnavailable(controlName, normalizedPlayer)) {
      return;
    } else if (selectedPlayers.length < this.matchPlayerLimit()) {
      selectedPlayers.push(normalizedPlayer);
    }

    this.setMatchPlayers(controlName, selectedPlayers);
  }

  autoFillHostedDoublesRemainder(changedControlName: MatchPlayerControlName): void {
    const selectedGame = this.selectedGame();
    const playerPool = this.matchPlayerPool();
    const requiredPlayers = this.matchPlayerLimit();

    if (!selectedGame || this.matchForm.controls.format.value !== 'doubles' || playerPool.length !== requiredPlayers * 2) {
      return;
    }

    const otherControlName: MatchPlayerControlName =
      changedControlName === 'teamAPlayers' ? 'teamBPlayers' : 'teamAPlayers';
    const changedPlayers = this.matchSidePlayers(changedControlName);
    const otherPlayers = this.matchSidePlayers(otherControlName);

    if (changedPlayers.length !== requiredPlayers || otherPlayers.length >= requiredPlayers) return;

    const selectedNames = new Set([...changedPlayers, ...otherPlayers].map((player) => player.toLowerCase()));
    const remainingPlayers = playerPool.filter((player) => !selectedNames.has(player.toLowerCase()));
    const filledOtherPlayers = [...otherPlayers, ...remainingPlayers].slice(0, requiredPlayers);

    if (filledOtherPlayers.length === requiredPlayers) {
      this.setMatchPlayers(otherControlName, filledOtherPlayers);
    }
  }

  canAutoStartHostedDoublesMatch(): boolean {
    const selectedGame = this.selectedGame();
    if (!selectedGame || this.matchForm.controls.format.value !== 'doubles' || !this.canStartGame(selectedGame.id)) {
      return false;
    }

    const requiredPlayers = this.matchPlayerLimit();
    const playerPool = this.matchPlayerPool();
    const teamAPlayers = this.matchSidePlayers('teamAPlayers');
    const teamBPlayers = this.matchSidePlayers('teamBPlayers');
    const selectedPlayers = [...teamAPlayers, ...teamBPlayers].map((player) => player.toLowerCase());

    return (
      playerPool.length === requiredPlayers * 2 &&
      teamAPlayers.length === requiredPlayers &&
      teamBPlayers.length === requiredPlayers &&
      new Set(selectedPlayers).size === selectedPlayers.length
    );
  }

  removeMatchPlayer(controlName: MatchPlayerControlName, playerName: string): void {
    const normalizedPlayer = normalizePlayerName(playerName).toLowerCase();
    this.setMatchPlayers(
      controlName,
      this.matchSidePlayers(controlName).filter((selected) => selected.toLowerCase() !== normalizedPlayer),
    );
  }

  matchPlayerLimit(): number {
    return this.matchForm.controls.format.value === 'doubles' ? 2 : 1;
  }

  chooseOpeningCourtPlayer(controlName: MatchPlayerControlName, playerName: string): void {
    const normalizedPlayer = normalizePlayerName(playerName);
    const players = this.matchSidePlayers(controlName);
    const index = players.findIndex((player) => player.toLowerCase() === normalizedPlayer.toLowerCase());
    if (index <= 0) return;

    const [selected] = players.splice(index, 1);
    this.setMatchPlayers(controlName, [selected, ...players]);
  }

  openingReceiverControlName(): MatchPlayerControlName {
    return this.matchForm.controls.openingServer.value === 'teamA' ? 'teamBPlayers' : 'teamAPlayers';
  }

  openingServerControlName(): MatchPlayerControlName {
    return this.matchForm.controls.openingServer.value === 'teamA' ? 'teamAPlayers' : 'teamBPlayers';
  }

  async createMatch(): Promise<void> {
    this.formError.set(null);

    if (this.matchForm.invalid) {
      this.formError.set('Enter both sides before starting.');
      return;
    }

    const value = this.matchForm.getRawValue();
    const teamAPlayers = parsePlayers(value.teamAPlayers);
    const teamBPlayers = parsePlayers(value.teamBPlayers);
    const requiredPlayers = value.format === 'doubles' ? 2 : 1;
    const selectedGame = this.selectedGame();

    if (teamAPlayers.length < requiredPlayers || teamBPlayers.length < requiredPlayers) {
      this.formError.set(value.format === 'doubles' ? 'Pick two players for each side.' : 'Pick one player for each side.');
      return;
    }

    if (selectedGame) {
      if (!this.canStartGame(selectedGame.id)) {
        this.formError.set('You need host approval before starting this match.');
        return;
      }

      const approved = selectedGame.approvedPlayers.map((player) => player.toLowerCase());
      const unapproved = [...teamAPlayers, ...teamBPlayers].some((player) => !approved.includes(player.toLowerCase()));
      if (unapproved) {
        this.formError.set('Only approved game players can be selected.');
        return;
      }
    }

    const match = await this.repository.createMatch({
      gameId: selectedGame?.id,
      location: value.location,
      format: value.format,
      targetPoints: value.targetPoints,
      openingServer: value.openingServer,
      teamAPlayers,
      teamBPlayers,
    });

    this.selectedMatchId.set(match.id);
    this.selectedShotType.set(null);
    this.matchForm.patchValue({ teamAPlayers: this.currentPlayerName(), teamBPlayers: '' });
  }

  async addPoint(matchId: string, side: TeamSide, scorerPlayer?: string): Promise<void> {
    const match = this.findMatch(matchId);
    if (!match || this.isPointEntryLocked(match)) return;

    const shotType = this.selectedShotType();
    if (shotType === 'fault') {
      await this.repository.addPoint(matchId, opponentSide(side), this.faultInput(side, scorerPlayer));
    } else {
      await this.repository.addPoint(matchId, side, this.pointInputForShot(shotType, scorerPlayer));
    }
    this.selectedShotType.set(null);
  }

  async addQuickPoint(matchId: string, side: TeamSide, shotType: ShotType, playerName: string): Promise<void> {
    const match = this.findMatch(matchId);
    if (!match || this.isPointEntryLocked(match)) return;

    if (shotType === 'fault') {
      await this.repository.addPoint(matchId, opponentSide(side), this.faultInput(side, playerName));
    } else {
      await this.repository.addPoint(matchId, side, this.pointInputForShot(shotType, playerName));
    }
  }

  async undo(matchId: string): Promise<void> {
    await this.repository.undoLastPoint(matchId);
  }

  openEndGameDialog(matchId: string): void {
    const match = this.findMatch(matchId);
    if (!match || match.status === 'final') return;

    this.formError.set(null);
    this.replayPickerOpen.set(false);
    this.endGameDialogMatchId.set(match.id);
  }

  closeEndGameDialog(): void {
    this.endGameDialogMatchId.set(null);
    this.replayPickerOpen.set(false);
    this.formError.set(null);
  }

  async endGame(matchId: string): Promise<void> {
    const match = this.findMatch(matchId);
    if (!match) return;

    if (this.canFinalize(match)) {
      await this.finalize(match.id);
      this.closeEndGameDialog();
      return;
    }

    await this.repository.endMatch(match.id);
    this.closeEndGameDialog();
  }

  async finalize(matchId: string): Promise<void> {
    const match = await this.repository.finalizeMatch(matchId);
    if (match.status !== 'final') {
      this.formError.set('The game is not finished under badminton scoring rules.');
      return;
    }

    this.replayPickerOpen.set(false);
    this.endGameDialogMatchId.set(null);
  }

  async startNextSet(matchId: string): Promise<void> {
    const match = this.findMatch(matchId);
    if (!match || !this.matchNeedsCompletionDecision(match)) return;

    const finalized = await this.repository.finalizeMatch(match.id);
    if (finalized.status !== 'final') {
      this.formError.set('The game is not finished under badminton scoring rules.');
      return;
    }

    const nextMatch = await this.repository.createMatch({
      gameId: match.gameId,
      seriesId: match.seriesId ?? match.id,
      setNumber: (match.setNumber ?? 1) + 1,
      location: match.location,
      format: match.format,
      targetPoints: match.targetPoints,
      openingServer: finalized.winner ?? match.openingServer,
      teamAPlayers: match.teamAPlayers,
      teamBPlayers: match.teamBPlayers,
    });

    this.selectFreshRecording(nextMatch);
  }

  async startSamePlayersRematch(matchId: string): Promise<void> {
    const match = this.findMatch(matchId);
    if (!match || !this.canUseEndGameActions(match)) return;

    const ended = await this.finishForReplay(match);
    if (!ended) return;

    const nextMatch = await this.repository.createMatch({
      gameId: match.gameId,
      location: match.location,
      format: match.format,
      targetPoints: match.targetPoints,
      openingServer: 'teamA',
      teamAPlayers: match.teamAPlayers,
      teamBPlayers: match.teamBPlayers,
    });

    this.selectFreshRecording(nextMatch);
  }

  openReplayPicker(match: MatchRecord): void {
    this.seedReplayPlayers(match);
    this.replayPickerOpen.set(true);
  }

  closeReplayPicker(): void {
    this.replayPickerOpen.set(false);
  }

  replayPlayerLimit(match: MatchRecord): number {
    return match.format === 'doubles' ? 2 : 1;
  }

  replaySidePlayers(controlName: ReplayPlayerControlName): string[] {
    return controlName === 'replayTeamAPlayers' ? this.replayTeamAPlayers() : this.replayTeamBPlayers();
  }

  isReplayPlayerSelected(controlName: ReplayPlayerControlName, playerName: string): boolean {
    const normalizedPlayer = normalizePlayerName(playerName).toLowerCase();
    return this.replaySidePlayers(controlName).some((selected) => selected.toLowerCase() === normalizedPlayer);
  }

  isReplayPlayerUnavailable(controlName: ReplayPlayerControlName, playerName: string): boolean {
    const otherControl = controlName === 'replayTeamAPlayers' ? 'replayTeamBPlayers' : 'replayTeamAPlayers';
    return this.isReplayPlayerSelected(otherControl, playerName);
  }

  toggleReplayPlayer(controlName: ReplayPlayerControlName, playerName: string, match: MatchRecord): void {
    const normalizedPlayer = normalizePlayerName(playerName);
    if (!normalizedPlayer) return;

    const selectedPlayers = this.replaySidePlayers(controlName);
    const existingIndex = selectedPlayers.findIndex((selected) => selected.toLowerCase() === normalizedPlayer.toLowerCase());

    if (existingIndex >= 0) {
      selectedPlayers.splice(existingIndex, 1);
    } else if (this.isReplayPlayerUnavailable(controlName, normalizedPlayer)) {
      return;
    } else if (selectedPlayers.length < this.replayPlayerLimit(match)) {
      selectedPlayers.push(normalizedPlayer);
    }

    this.setReplayPlayers(controlName, selectedPlayers);
  }

  removeReplayPlayer(controlName: ReplayPlayerControlName, playerName: string): void {
    const normalizedPlayer = normalizePlayerName(playerName).toLowerCase();
    this.setReplayPlayers(
      controlName,
      this.replaySidePlayers(controlName).filter((selected) => selected.toLowerCase() !== normalizedPlayer),
    );
  }

  replayPlayerPool(match: MatchRecord): string[] {
    const names = new Map<string, string>();
    const add = (value: string) => {
      const name = normalizePlayerName(value);
      if (name) names.set(name.toLowerCase(), name);
    };

    match.teamAPlayers.forEach(add);
    match.teamBPlayers.forEach(add);

    const game = this.state().games.find((item) => item.id === match.gameId) ?? this.selectedGame();
    if (game) {
      game.approvedPlayers.forEach(add);
    } else {
      this.registeredPlayers().forEach(add);
    }

    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }

  canStartNewMatchFromGroup(match: MatchRecord): boolean {
    const requiredPlayers = this.replayPlayerLimit(match);
    const teamAPlayers = this.replayTeamAPlayers();
    const teamBPlayers = this.replayTeamBPlayers();
    const selectedPlayers = [...teamAPlayers, ...teamBPlayers].map((player) => player.toLowerCase());

    return (
      teamAPlayers.length === requiredPlayers &&
      teamBPlayers.length === requiredPlayers &&
      new Set(selectedPlayers).size === selectedPlayers.length
    );
  }

  async startNewMatchFromGroup(matchId: string): Promise<void> {
    const match = this.findMatch(matchId);
    if (!match || !this.canUseEndGameActions(match)) return;

    if (!this.canStartNewMatchFromGroup(match)) {
      this.formError.set(match.format === 'doubles' ? 'Pick two players for each side.' : 'Pick one player for each side.');
      return;
    }

    const ended = await this.finishForReplay(match);
    if (!ended) return;

    const nextMatch = await this.repository.createMatch({
      gameId: match.gameId,
      location: match.location,
      format: match.format,
      targetPoints: match.targetPoints,
      openingServer: 'teamA',
      teamAPlayers: this.replayTeamAPlayers(),
      teamBPlayers: this.replayTeamBPlayers(),
    });

    this.selectFreshRecording(nextMatch);
  }

  async deleteMatch(matchId: string): Promise<void> {
    await this.repository.deleteMatch(matchId);
    if (this.selectedMatchId() === matchId) {
      this.selectedMatchId.set(null);
    }
    if (this.endGameDialogMatchId() === matchId) {
      this.closeEndGameDialog();
    }
  }

  async resetDemoData(): Promise<void> {
    await this.repository.resetDemoData();
    this.selectedMatchId.set(null);
    this.selectedShotType.set(null);
    this.closeEndGameDialog();
  }

  saveProfile(): void {
    if (this.accountForm.invalid) return;

    const profile = this.accountForm.getRawValue();
    const normalizedProfile: UserProfile = {
      playerName: profile.playerName.trim().replace(/\s+/g, ' ') || 'Arjun Nair',
      email: profile.email.trim(),
      homeBase: profile.homeBase.trim().replace(/\s+/g, ' ') || DEFAULT_LOCATION,
    };

    this.currentPlayerName.set(normalizedProfile.playerName);
    this.matchForm.patchValue({
      location: normalizedProfile.homeBase,
      teamAPlayers: normalizedProfile.playerName,
    });
    this.storage?.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalizedProfile));
    this.profileSaved.set(true);
  }

  teamLabel(match: MatchRecord, side: TeamSide): string {
    return teamLabel(side === 'teamA' ? match.teamAPlayers : match.teamBPlayers);
  }

  eventLabel(match: MatchRecord, event: PointEvent): string {
    if (event.mistakePlayer && event.shotType === 'fault') {
      return `${event.mistakePlayer} - Fault`;
    }

    if (event.mistakePlayer) {
      return `${event.mistakePlayer} mistake`;
    }

    if (event.scorerPlayer && event.shotType) {
      return `${event.scorerPlayer} - ${shotLabel(event.shotType)}`;
    }

    if (event.scorerPlayer) {
      return event.scorerPlayer;
    }

    if (event.shotType) {
      return shotLabel(event.shotType);
    }

    return this.teamLabel(match, event.side);
  }

  isCurrentPlayer(match: MatchRecord, side: TeamSide): boolean {
    const playerName = this.currentPlayerName().toLowerCase();
    const players = side === 'teamA' ? match.teamAPlayers : match.teamBPlayers;
    return players.some((name) => name.toLowerCase() === playerName);
  }

  servingSide(match: MatchRecord): TeamSide {
    return getServingSide(match);
  }

  serviceCourt(match: MatchRecord): ServiceCourt {
    return getServiceCourt(match);
  }

  courtPlayer(match: MatchRecord, side: TeamSide, court: ServiceCourt): string {
    return getCourtAssignments(match)[side][court];
  }

  courtPlayers(match: MatchRecord, side: TeamSide): CourtPlayerView[] {
    return getCourtPlayerViews(match, side);
  }

  quickScoreGroups(match: MatchRecord): QuickScoreGroup[] {
    return (['teamA', 'teamB'] as const).map((side) => ({
      side,
      label: this.teamLabel(match, side),
      score: side === 'teamA' ? match.teamAScore : match.teamBScore,
      players: this.courtPlayers(match, side).map((player) => ({
        side,
        playerName: player.playerName,
        role: player.role,
        score: side === 'teamA' ? match.teamAScore : match.teamBScore,
      })),
    }));
  }

  laneRole(match: MatchRecord, side: TeamSide, lane: VisualCourtLane): CourtPlayerRole {
    return this.courtPlayers(match, side).find((player) => player.visualLane === lane)?.role ?? 'none';
  }

  courtRole(match: MatchRecord, side: TeamSide, court: ServiceCourt): string {
    const serviceCourt = this.serviceCourt(match);

    if (court !== serviceCourt) return '';
    return side === this.servingSide(match) ? 'Serve' : 'Receive';
  }

  serviceSummary(match: MatchRecord): string {
    const side = this.servingSide(match);
    const court = this.serviceCourt(match);
    if (match.format === 'singles') return `${this.courtPlayer(match, side, court)} serving`;
    return `${this.courtPlayer(match, side, court)} - ${court === 'right' ? 'Right' : 'Left'}`;
  }

  receiverSummary(match: MatchRecord): string {
    const side = this.servingSide(match) === 'teamA' ? 'teamB' : 'teamA';
    const court = this.serviceCourt(match);
    if (match.format === 'singles') return `${this.courtPlayer(match, side, court)} receiving`;
    return `${this.courtPlayer(match, side, court)} - ${court === 'right' ? 'Right' : 'Left'}`;
  }

  scoreStateLabel(match: MatchRecord): string {
    const scoreState = getScoreState(match);

    if (scoreState.phase === 'final' && scoreState.winner) {
      return `${this.teamLabel(match, scoreState.winner)} won`;
    }

    if (scoreState.phase === 'deuce') return 'Deuce';
    if (scoreState.phase === 'game-point') return 'Game point';
    return 'Rally scoring';
  }

  canFinalize(match: MatchRecord): boolean {
    return getScoreState(match).phase === 'final';
  }

  matchNeedsCompletionDecision(match: MatchRecord): boolean {
    return match.status !== 'final' && this.canFinalize(match);
  }

  isPointEntryLocked(match: MatchRecord): boolean {
    return match.status === 'final' || this.matchNeedsCompletionDecision(match) || this.endGameDialogMatchId() === match.id;
  }

  matchSetLabel(match: MatchRecord): string {
    return `Set ${match.setNumber ?? 1}`;
  }

  completionEyebrow(match: MatchRecord): string {
    return this.canFinalize(match) ? `${this.matchSetLabel(match)} complete` : 'End game';
  }

  completionTitle(match: MatchRecord): string {
    const winner = getScoreState(match).winner;
    return this.canFinalize(match) && winner
      ? `${this.teamLabel(match, winner)} won`
      : `${this.teamLabel(match, 'teamA')} vs ${this.teamLabel(match, 'teamB')}`;
  }

  private trimMatchPlayers(controlName: MatchPlayerControlName): void {
    this.setMatchPlayers(controlName, this.matchSidePlayers(controlName).slice(0, this.matchPlayerLimit()));
  }

  private setMatchPlayers(controlName: MatchPlayerControlName, players: readonly string[]): void {
    this.matchForm.controls[controlName].setValue(players.join(', '));
    this.matchForm.controls[controlName].markAsDirty();
    this.matchForm.controls[controlName].updateValueAndValidity();
  }

  private setReplayPlayers(controlName: ReplayPlayerControlName, players: readonly string[]): void {
    const nextPlayers = [...players];
    if (controlName === 'replayTeamAPlayers') {
      this.replayTeamAPlayers.set(nextPlayers);
    } else {
      this.replayTeamBPlayers.set(nextPlayers);
    }
  }

  private seedReplayPlayers(match: MatchRecord): void {
    this.replayTeamAPlayers.set(match.teamAPlayers.slice(0, this.replayPlayerLimit(match)));
    this.replayTeamBPlayers.set(match.teamBPlayers.slice(0, this.replayPlayerLimit(match)));
  }

  private selectFreshRecording(match: MatchRecord): void {
    this.selectedMatchId.set(match.id);
    this.selectedShotType.set(null);
    this.replayPickerOpen.set(false);
    this.endGameDialogMatchId.set(null);
    this.formError.set(null);
  }

  private findMatch(matchId: string): MatchRecord | undefined {
    return this.state().matches.find((match) => match.id === matchId);
  }

  private canUseEndGameActions(match: MatchRecord): boolean {
    return this.matchNeedsCompletionDecision(match) || this.endGameDialogMatchId() === match.id;
  }

  private async finishForReplay(match: MatchRecord): Promise<boolean> {
    if (this.canFinalize(match)) {
      const finalized = await this.repository.finalizeMatch(match.id);
      if (finalized.status !== 'final') {
        this.formError.set('The game is not finished under badminton scoring rules.');
        return false;
      }

      return true;
    }

    await this.repository.endMatch(match.id);
    return true;
  }

  private isPlayerInList(players: readonly string[], playerName: string): boolean {
    const normalizedPlayer = normalizePlayerName(playerName).toLowerCase();
    return players.some((player) => player.toLowerCase() === normalizedPlayer);
  }

  private pointInputForShot(shotType: ShotType | null, scorerPlayer?: string) {
    const normalizedScorer = normalizePlayerName(scorerPlayer ?? '');
    const scorer = normalizedScorer ? { scorerPlayer: normalizedScorer } : {};

    return shotType
      ? { reason: 'shot', shotType, ...scorer } as const
      : { reason: 'opponent_mistake', ...scorer } as const;
  }

  private faultInput(side: TeamSide, playerName?: string) {
    const normalizedPlayer = normalizePlayerName(playerName ?? '');

    return {
      reason: 'opponent_mistake',
      shotType: 'fault',
      mistakeBy: side,
      ...(normalizedPlayer ? { mistakePlayer: normalizedPlayer } : {}),
    } as const;
  }

  private clearDecisionNote(requestId: string): void {
    this.decisionNotes.update((notes) => {
      const nextNotes = { ...notes };
      delete nextNotes[requestId];
      return nextNotes;
    });
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function loadProfile(storage: Storage | null): UserProfile {
  if (!storage) return defaultProfile();

  try {
    const parsed = JSON.parse(storage.getItem(PROFILE_STORAGE_KEY) ?? '') as Partial<UserProfile>;

    return {
      playerName: parsed.playerName?.trim() || 'Arjun Nair',
      email: parsed.email?.trim() ?? '',
      homeBase: parsed.homeBase?.trim() || DEFAULT_LOCATION,
    };
  } catch {
    return defaultProfile();
  }
}

function loadScoreMode(storage: Storage | null): ScoreMode {
  return storage?.getItem(SCORE_MODE_STORAGE_KEY) === 'classic' ? 'classic' : 'quick';
}

function loadRecordLayoutMode(storage: Storage | null): RecordLayoutMode {
  return storage?.getItem(RECORD_LAYOUT_STORAGE_KEY) === 'rotated' ? 'rotated' : 'normal';
}

function defaultProfile(): UserProfile {
  return {
    playerName: 'Arjun Nair',
    email: '',
    homeBase: DEFAULT_LOCATION,
  };
}

function localDateTimeInputValue(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
