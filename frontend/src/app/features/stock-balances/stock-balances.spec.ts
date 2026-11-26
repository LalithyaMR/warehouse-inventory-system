import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';

import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { InventoryBalancesApiService } from './inventory-balances-api.service';
import { StockBalance } from './stock-balance.model';
import { StockBalances } from './stock-balances';
import { StockBalancesService } from './stock-balances.service';

const API_URL = 'http://localhost:8080/api/inventory/balances';

const apiBalances: StockBalance[] = [
  {
    itemId: 1,
    itemCode: 'BOX-01',
    itemName: 'Storage box',
    warehouseId: 1,
    warehouseName: 'North warehouse',
    availableQuantity: 9,
    reorderLevel: 10,
    lowStock: true,
  },
  {
    itemId: 1,
    itemCode: 'BOX-01',
    itemName: 'Storage box',
    warehouseId: 2,
    warehouseName: 'South warehouse',
    availableQuantity: 3,
    reorderLevel: 10,
    lowStock: true,
  },
  {
    itemId: 2,
    itemCode: 'TAPE-02',
    itemName: 'Packing tape',
    warehouseId: 1,
    warehouseName: 'North warehouse',
    availableQuantity: 0,
    reorderLevel: 2,
    lowStock: true,
  },
  {
    itemId: 3,
    itemCode: 'WRAP-03',
    itemName: 'Bubble wrap',
    warehouseId: 2,
    warehouseName: 'South warehouse',
    availableQuantity: 7,
    reorderLevel: 4,
    lowStock: false,
  },
];

const items: InventoryItem[] = [
  {
    id: 1,
    sku: 'BOX-01',
    name: 'Storage box',
    category: 'Packaging',
    unit: 'Each',
    minStock: 10,
    status: 'Active',
  },
  {
    id: 2,
    sku: 'TAPE-02',
    name: 'Packing tape',
    category: 'Packaging',
    unit: 'Roll',
    minStock: 2,
    status: 'Active',
  },
  {
    id: 3,
    sku: 'WRAP-03',
    name: 'Bubble wrap',
    category: 'Packaging',
    unit: 'Roll',
    minStock: 4,
    status: 'Active',
  },
];

const warehouses: Warehouse[] = [
  { id: 1, code: 'NORTH', name: 'North warehouse', location: 'North', status: 'Active' },
  { id: 2, code: 'SOUTH', name: 'South warehouse', location: 'South', status: 'Active' },
];

describe('InventoryBalancesApiService', () => {
  let service: InventoryBalancesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(InventoryBalancesApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the backend balance DTO without recalculating stock', async () => {
    const result = firstValueFrom(service.loadBalances());
    const request = http.expectOne(API_URL);
    expect(request.request.method).toBe('GET');
    request.flush(apiBalances);

    await expect(result).resolves.toEqual(apiBalances);
    expect(service.getCurrentBalances()).toEqual(apiBalances);
  });

  it('passes warehouse filtering to the backend query parameter', async () => {
    const result = firstValueFrom(service.loadBalances(2));
    const request = http.expectOne(`${API_URL}?warehouseId=2`);
    expect(request.request.method).toBe('GET');
    request.flush(apiBalances.slice(1, 2));

    await expect(result).resolves.toEqual([apiBalances[1]]);
  });
});

describe('StockBalances', () => {
  let fixture: ComponentFixture<StockBalances>;
  let reloadBalances: ReturnType<typeof vi.fn>;
  let loadError: BehaviorSubject<unknown | null>;

  beforeEach(async () => {
    reloadBalances = vi.fn();
    loadError = new BehaviorSubject<unknown | null>(null);
    const balancesSubject = new BehaviorSubject(apiBalances);
    const itemsSubject = new BehaviorSubject(items);
    const warehousesSubject = new BehaviorSubject(warehouses);

    await TestBed.configureTestingModule({
      imports: [StockBalances],
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: StockBalancesService,
          useValue: {
            balances$: balancesSubject.asObservable(),
            loading$: of(false),
            loadError$: loadError.asObservable(),
            reloadBalances,
          },
        },
        {
          provide: ItemsService,
          useValue: {
            items$: itemsSubject.asObservable(),
            loading$: of(false),
            loadError$: of(null),
            reloadItems: vi.fn(),
          },
        },
        {
          provide: WarehousesService,
          useValue: {
            warehouses$: warehousesSubject.asObservable(),
            loading$: of(false),
            loadError$: of(null),
            reloadWarehouses: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StockBalances);
    fixture.detectChanges();
  });

  it('renders backend quantities and low-stock indicators', () => {
    const rows = fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>;
    expect(rows.length).toBe(4);
    const storageBoxRow = Array.from(rows).find((row) => row.textContent?.includes('BOX-01'));
    const outOfStockRow = Array.from(rows).find((row) => row.textContent?.includes('Out of Stock'));
    expect(storageBoxRow?.textContent).toContain('9');
    expect(storageBoxRow?.textContent).toContain('10');
    expect(storageBoxRow?.textContent).toContain('Low Stock');
    expect(outOfStockRow?.textContent).toContain('TAPE-02');

    const summaryValues = Array.from(
      fixture.nativeElement.querySelectorAll('.summary-card strong') as NodeListOf<HTMLElement>,
      (element) => element.textContent?.trim() ?? '',
    );
    expect(summaryValues).toEqual(['3', '19', '1', '1']);
  });

  it('requests a warehouse filter from the backend and keeps other filters local', () => {
    const warehouse = fixture.nativeElement.querySelector(
      '#balance-warehouse-filter',
    ) as HTMLSelectElement;
    warehouse.value = '2';
    warehouse.dispatchEvent(new Event('change'));

    expect(reloadBalances).toHaveBeenCalledWith(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);

    const search = fixture.nativeElement.querySelector('#balance-search') as HTMLInputElement;
    search.value = 'WRAP-03';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain('Bubble wrap');
  });

  it('shows backend low-stock state in the details dialog', () => {
    const detailButton = Array.from(
      fixture.nativeElement.querySelectorAll('.details-button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.getAttribute('aria-label')?.includes('Storage box'));
    if (!detailButton) {
      throw new Error('Storage box details button was not rendered.');
    }
    detailButton.click();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('9 Each');
    expect(dialog.textContent).toContain('10 Each');
    expect(dialog.textContent).toContain('Low-stock flag');
    expect(dialog.textContent).toContain('Yes');
    expect(dialog.textContent).not.toContain('Opening stock');
  });

  it('shows a load error and allows retry', () => {
    loadError.next(new Error('Unavailable'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Unable to load inventory balances',
    );
    (fixture.nativeElement.querySelector('.alert button') as HTMLButtonElement).click();
    expect(reloadBalances).toHaveBeenCalled();
  });
});
