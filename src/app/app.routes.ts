import { Routes } from '@angular/router';

import { AccountPage } from './pages/account-page';
import { CreateMatchPage } from './pages/create-match-page';
import { DashboardPage } from './pages/dashboard-page';
import { InsightsPage } from './pages/insights-page';
import { RecordMatchPage } from './pages/record-match-page';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardPage },
  { path: 'create', component: CreateMatchPage },
  { path: 'record', component: RecordMatchPage },
  { path: 'insights', component: InsightsPage },
  { path: 'account', component: AccountPage },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
