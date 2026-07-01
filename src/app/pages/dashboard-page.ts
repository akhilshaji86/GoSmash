import { DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideHistory, LucideLightbulb } from '@lucide/angular';
import { GosmashStateService } from '../gosmash-state.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, TitleCasePipe, LucideHistory, LucideLightbulb],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  readonly store = inject(GosmashStateService);
  private readonly router = inject(Router);

  async openMatchInsights(matchId: string): Promise<void> {
    await this.router.navigate(['/insights'], { queryParams: { matchId } });
  }
}
