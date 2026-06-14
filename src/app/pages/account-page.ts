import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { LucideCheck, LucideCircleUser } from '@lucide/angular';
import { GosmashStateService } from '../gosmash-state.service';

@Component({
  selector: 'app-account-page',
  imports: [ReactiveFormsModule, LucideCheck, LucideCircleUser],
  templateUrl: './account-page.html',
})
export class AccountPage {
  readonly store = inject(GosmashStateService);
}
