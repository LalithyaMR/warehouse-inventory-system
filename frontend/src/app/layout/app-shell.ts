import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-shell',
  styleUrl: './app-shell.css',
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly mobileNavOpen = signal(false);

  protected readonly navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '⌂' },
    { label: 'Items', path: '/items', icon: '▦' },
    { label: 'Warehouses', path: '/warehouses', icon: '▤' },
    { label: 'Stock Receipts', path: '/stock-receipts', icon: '↓' },
    { label: 'Stock Issues', path: '/stock-issues', icon: '↑' },
    { label: 'Stock Transfers', path: '/stock-transfers', icon: '⇄' },
    { label: 'Stock Balances', path: '/stock-balances', icon: '≡' },
  ];

  protected toggleMobileNav(): void {
    this.mobileNavOpen.update((isOpen) => !isOpen);
  }

  protected closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }
}
