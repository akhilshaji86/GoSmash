import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideCirclePlus, LucideRotateCcw } from '@lucide/angular';
import { GosmashStateService } from '../gosmash-state.service';

@Component({
  selector: 'app-create-match-page',
  imports: [DatePipe, FormsModule, ReactiveFormsModule, LucideCirclePlus, LucideRotateCcw],
  templateUrl: './create-match-page.html',
})
export class CreateMatchPage {
  readonly store = inject(GosmashStateService);
  private readonly router = inject(Router);

  async selectMatchPlayer(controlName: 'teamAPlayers' | 'teamBPlayers', playerName: string): Promise<void> {
    this.store.toggleMatchPlayer(controlName, playerName);
    this.store.autoFillHostedDoublesRemainder(controlName);

    if (this.store.canAutoStartHostedDoublesMatch()) {
      await this.createMatch();
    }
  }

  async createMatch(): Promise<void> {
    await this.store.createMatch();

    if (!this.store.formError() && this.store.activeMatch()) {
      await this.router.navigate(['/record']);
    }
  }
}
