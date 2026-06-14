import { Component, inject } from '@angular/core';
import {
  LucideActivity,
  LucideArrowLeft,
  LucideCheck,
  LucideCirclePlus,
  LucideLayers2,
  LucideRotateCw,
  LucideTrash2,
  LucideTrophy,
  LucideUndo2,
  LucideUsers,
} from '@lucide/angular';
import { GosmashStateService } from '../gosmash-state.service';
import { ShotIconComponent } from '../shared/shot-icon.component';

@Component({
  selector: 'app-record-match-page',
  imports: [
    LucideActivity,
    LucideArrowLeft,
    LucideCheck,
    LucideCirclePlus,
    LucideLayers2,
    LucideRotateCw,
    LucideTrash2,
    LucideTrophy,
    LucideUndo2,
    LucideUsers,
    ShotIconComponent,
  ],
  templateUrl: './record-match-page.html',
})
export class RecordMatchPage {
  readonly store = inject(GosmashStateService);
}
