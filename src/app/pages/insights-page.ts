import { DecimalPipe } from '@angular/common';
import { computed, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LucideTarget } from '@lucide/angular';
import { buildPlayerStats } from '../domain/player-stats';
import { GosmashStateService } from '../gosmash-state.service';

@Component({
  selector: 'app-insights-page',
  imports: [DecimalPipe, LucideTarget],
  templateUrl: './insights-page.html',
})
export class InsightsPage {
  readonly store = inject(GosmashStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParamMap = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly selectedMatchId = computed(() => this.queryParamMap().get('matchId'));

  readonly selectedMatch = computed(() => {
    const selectedId = this.selectedMatchId();
    if (!selectedId) return null;
    return this.store.state().matches.find((match) => match.id === selectedId) ?? null;
  });

  readonly activeInsightsStats = computed(() => {
    const selectedMatch = this.selectedMatch();
    if (!selectedMatch) return this.store.playerStats();
    return buildPlayerStats([selectedMatch], this.store.state().leaderboard, this.store.currentPlayerName());
  });
}
