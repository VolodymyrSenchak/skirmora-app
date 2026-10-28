import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'local/game',
    loadComponent: () => import('./features/local/local-game.page').then((m) => m.LocalGamePage),
  },
  {
    // Phase 0 check page: every atlas animation and every map
    path: 'dev',
    loadComponent: () => import('./features/dev/dev.page').then((m) => m.DevPage),
  },
  { path: '**', redirectTo: '' },
];
