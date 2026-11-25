import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dashboard } from './dashboard';
import { ItemsService } from '../items/items.service';

describe('Dashboard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders summary values from the existing mock-backed services', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const values = Array.from(
      fixture.nativeElement.querySelectorAll('.stat-value') as NodeListOf<HTMLElement>,
      (element) => element.textContent?.trim() ?? '',
    );

    expect(values).toEqual(['6', '5', '231', '2', '0']);
    expect(fixture.nativeElement.querySelectorAll('.warehouse-table tbody tr').length).toBe(5);
  });

  it('shows recent movement tables and seven daily chart points', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const recentPanels = fixture.nativeElement.querySelectorAll(
      '.recent-panels .recent-panel',
    ) as NodeListOf<HTMLElement>;
    expect(recentPanels.length).toBe(3);
    for (const panel of Array.from(recentPanels)) {
      expect(panel.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    }

    expect(fixture.nativeElement.querySelectorAll('.chart-day').length).toBe(7);
    expect(
      fixture.nativeElement.querySelector('.movement-chart')?.getAttribute('aria-label'),
    ).toContain('receipts');
  });

  it('updates dashboard totals when the item service changes', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    TestBed.inject(ItemsService).addItem({
      name: 'Dashboard test item',
      sku: 'DASH-TEST-01',
      category: 'Packaging',
      unit: 'Each',
      minStock: 2,
      status: 'Active',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.stat-value')?.textContent?.trim()).toBe('7');
  });

  it('links all application sections from the dashboard', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.dashboard-shortcuts a',
      ) as NodeListOf<HTMLAnchorElement>,
      (anchor) => anchor.getAttribute('href'),
    );

    expect(hrefs).toEqual([
      '/dashboard',
      '/items',
      '/warehouses',
      '/stock-receipts',
      '/stock-issues',
      '/stock-transfers',
      '/stock-balances',
    ]);
  });
});
