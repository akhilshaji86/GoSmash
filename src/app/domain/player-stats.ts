import { LeaderboardEntry, MatchRecord, SHOT_OPTIONS, ShotType, TeamSide, normalizePlayerName, opponentSide } from './models';

export interface ShotBreakdown {
  type: ShotType;
  label: string;
  points: number;
  share: number;
}

export interface PlayerStats {
  playerName: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  pointsFromOpponentMistakes: number;
  mistakesMade: number;
  mistakeRate: number;
  shotPointsWon: number;
  favoriteShot: string;
  shotBreakdown: ShotBreakdown[];
  suggestions: string[];
}

export function buildPlayerStats(
  matches: readonly MatchRecord[],
  leaderboard: readonly LeaderboardEntry[],
  playerName: string,
): PlayerStats {
  const normalizedName = normalizePlayerName(playerName).toLowerCase();
  const playerStanding = leaderboard.find((entry) => entry.playerName.toLowerCase() === normalizedName);
  const breakdown = createBreakdown();

  let matchesPlayed = 0;
  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let pointsFromOpponentMistakes = 0;
  let mistakesMade = 0;
  let shotPointsWon = 0;

  for (const match of matches.filter((item) => item.status === 'final')) {
    const side = playerSide(match, normalizedName);
    if (!side) continue;

    const opponent = opponentSide(side);
    const won = match.winner === side;

    matchesPlayed += 1;
    wins += won ? 1 : 0;
    losses += won ? 0 : 1;
    pointsFor += side === 'teamA' ? match.teamAScore : match.teamBScore;
    pointsAgainst += side === 'teamA' ? match.teamBScore : match.teamAScore;

    for (const event of match.pointEvents) {
      if (event.side === side && isScoringEventForPlayer(match, event, side, normalizedName)) {
        if (event.reason === 'shot' && event.shotType && event.shotType !== 'fault') {
          breakdown.get(event.shotType)!.points += 1;
          shotPointsWon += 1;
        } else {
          pointsFromOpponentMistakes += 1;
        }
      }

      if (event.side === opponent && isMistakeEventForPlayer(match, event, side, normalizedName)) {
        mistakesMade += 1;
      }
    }
  }

  const shotBreakdown = [...breakdown.values()].map((shot) => ({
    ...shot,
    share: shotPointsWon === 0 ? 0 : Math.round((shot.points / shotPointsWon) * 100),
  }));
  const favorite = shotBreakdown.slice().sort((a, b) => b.points - a.points)[0];

  const stats: PlayerStats = {
    playerName: normalizePlayerName(playerName) || 'Player',
    rating: playerStanding?.rating ?? 1000,
    matches: matchesPlayed,
    wins,
    losses,
    winRate: matchesPlayed === 0 ? 0 : Math.round((wins / matchesPlayed) * 100),
    pointsFor,
    pointsAgainst,
    pointDiff: pointsFor - pointsAgainst,
    pointsFromOpponentMistakes,
    mistakesMade,
    mistakeRate: pointsAgainst === 0 ? 0 : Math.round((mistakesMade / pointsAgainst) * 100),
    shotPointsWon,
    favoriteShot: favorite && favorite.points > 0 ? favorite.label : 'None yet',
    shotBreakdown,
    suggestions: [],
  };

  return {
    ...stats,
    suggestions: buildSuggestions(stats),
  };
}

function createBreakdown(): Map<ShotType, ShotBreakdown> {
  return new Map(
    SHOT_OPTIONS.filter((option) => option.type !== 'fault').map((option) => [
      option.type,
      {
        type: option.type,
        label: option.label,
        points: 0,
        share: 0,
      },
    ]),
  );
}

function playerSide(match: MatchRecord, normalizedName: string): TeamSide | null {
  if (match.teamAPlayers.some((name) => name.toLowerCase() === normalizedName)) return 'teamA';
  if (match.teamBPlayers.some((name) => name.toLowerCase() === normalizedName)) return 'teamB';
  return null;
}

function buildSuggestions(stats: PlayerStats): string[] {
  if (stats.matches === 0) {
    return ['Record one completed match to unlock personal suggestions.'];
  }

  const suggestions: string[] = [];
  const smash = stats.shotBreakdown.find((shot) => shot.type === 'smash');
  const drop = stats.shotBreakdown.find((shot) => shot.type === 'drop');
  const trick = stats.shotBreakdown.find((shot) => shot.type === 'lob');

  if (stats.mistakeRate >= 40) {
    suggestions.push('Your mistake rate is high. Play longer rallies and reduce forced winners for the next match.');
  }

  if ((smash?.share ?? 0) < 20 && stats.shotPointsWon >= 4) {
    suggestions.push('Smash points are low. Create more lift pressure before attacking.');
  }

  if ((drop?.points ?? 0) < (trick?.points ?? 0) && stats.shotPointsWon >= 4) {
    suggestions.push('Add more drop shots after trick-heavy rallies to vary the pace.');
  }

  if (stats.winRate < 50 && stats.matches >= 3) {
    suggestions.push('Focus on safer serve returns and first three shots before increasing attack speed.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Your balance looks solid. Keep recording shot types to make the next suggestion sharper.');
  }

  return suggestions.slice(0, 3);
}

function isScoringEventForPlayer(
  match: MatchRecord,
  event: MatchRecord['pointEvents'][number],
  side: TeamSide,
  normalizedName: string,
): boolean {
  if (event.side !== side) return false;

  const scorer = normalizePlayerName(event.scorerPlayer ?? '').toLowerCase();
  if (scorer) return scorer === normalizedName;

  return match.format === 'singles';
}

function isMistakeEventForPlayer(
  match: MatchRecord,
  event: MatchRecord['pointEvents'][number],
  side: TeamSide,
  normalizedName: string,
): boolean {
  if (event.reason !== 'opponent_mistake') return false;

  const mistakePlayer = normalizePlayerName(event.mistakePlayer ?? '').toLowerCase();
  if (mistakePlayer) return mistakePlayer === normalizedName;

  if (match.format === 'singles') return event.mistakeBy === side || !event.mistakeBy;

  return false;
}
