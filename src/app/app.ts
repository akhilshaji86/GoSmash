import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideBarChart3,
  LucideCirclePlus,
  LucideCircleUser,
  LucideClipboardList,
  LucideLayoutDashboard,
} from '@lucide/angular';
import { GosmashStateService } from './gosmash-state.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideBarChart3,
    LucideCirclePlus,
    LucideCircleUser,
    LucideClipboardList,
    LucideLayoutDashboard,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly store = inject(GosmashStateService);
}
