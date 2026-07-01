import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

import { AccountPage } from './pages/account-page';
import { CreateMatchPage } from './pages/create-match-page';
import { DashboardPage } from './pages/dashboard-page';
import { InsightsPage } from './pages/insights-page';
import { RecordMatchPage } from './pages/record-match-page';
import { GosmashStateService } from './gosmash-state.service';

const landingRouteGuard: CanActivateFn = () => {
  const store = inject(GosmashStateService);
  const router = inject(Router);

  return store.hasStartableGame() ? router.createUrlTree(['/create']) : router.createUrlTree(['/dashboard']);
};

export const routes: Routes = [
  { path: 'dashboard', component: DashboardPage },
  { path: 'create', component: CreateMatchPage },
  { path: 'record', component: RecordMatchPage },
  { path: 'insights', component: InsightsPage },
  { path: 'account', component: AccountPage },
  { path: '', pathMatch: 'full', canActivate: [landingRouteGuard], component: DashboardPage },
  { path: '**', redirectTo: 'dashboard' },
];
