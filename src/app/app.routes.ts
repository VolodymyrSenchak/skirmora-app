import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'create',
    loadComponent: () => import('./features/create/create-session.page').then((m) => m.CreateSessionPage),
  },
  {
    path: 'join',
    loadComponent: () => import('./features/join/join-session.page').then((m) => m.JoinSessionPage),
  },
  {
    // One route for the whole session: state arrives by push, a route per phase would turn every
    // snapshot into a navigation (SA §7).
    path: 's/:code',
    loadComponent: () => import('./features/session/session.page').then((m) => m.SessionPage),
  },
  {
    path: 'local',
    loadComponent: () => import('./features/local/local-setup.page').then((m) => m.LocalSetupPage),
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
