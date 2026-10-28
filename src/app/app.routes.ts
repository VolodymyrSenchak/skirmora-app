import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dev',
    loadComponent: () => import('./features/dev/dev.page').then((m) => m.DevPage),
  },
  { path: '**', redirectTo: 'dev' },
];
