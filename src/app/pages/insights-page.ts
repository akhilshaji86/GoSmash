import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { LucideTarget } from '@lucide/angular';
import { GosmashStateService } from '../gosmash-state.service';

@Component({
  selector: 'app-insights-page',
  imports: [DecimalPipe, LucideTarget],
  templateUrl: './insights-page.html',
})
export class InsightsPage {
  readonly store = inject(GosmashStateService);
}
