import { Routes } from '@angular/router';
import { AppShell } from './layout/app-shell';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((module) => module.Dashboard),
      },
      {
        path: 'items',
        loadChildren: () =>
          import('./features/items/items.routes').then((module) => module.ITEMS_ROUTES),
      },
      {
        path: 'warehouses',
        loadChildren: () =>
          import('./features/warehouses/warehouses.routes').then(
            (module) => module.WAREHOUSES_ROUTES,
          ),
      },
      {
        path: 'stock-receipts',
        loadChildren: () =>
          import('./features/stock-receipts/stock-receipts.routes').then(
            (module) => module.STOCK_RECEIPTS_ROUTES,
          ),
      },
      {
        path: 'stock-issues',
        loadChildren: () =>
          import('./features/stock-issues/stock-issues.routes').then(
            (module) => module.STOCK_ISSUES_ROUTES,
          ),
      },
      {
        path: 'stock-transfers',
        loadChildren: () =>
          import('./features/stock-transfers/stock-transfers.routes').then(
            (module) => module.STOCK_TRANSFERS_ROUTES,
          ),
      },
      {
        path: 'stock-balances',
        loadChildren: () =>
          import('./features/stock-balances/stock-balances.routes').then(
            (module) => module.STOCK_BALANCES_ROUTES,
          ),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
