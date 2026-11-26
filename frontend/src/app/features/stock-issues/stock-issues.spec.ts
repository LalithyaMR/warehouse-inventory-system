import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ItemsService } from '../items/items.service';
import { InventoryBalancesApiService } from '../stock-balances/inventory-balances-api.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { NewStockIssue } from './stock-issue.model';
import { DuplicateIssueNumberError, StockIssuesService } from './stock-issues.service';
import { StockIssues } from './stock-issues';

const API_URL = 'http://localhost:8080/api/stock-issues';

const apiIssue = {
  id: 45,
  issueNumber: 'ISS-0045',
  itemId: 101,
  warehouseId: 7,
  quantity: 3,
  issueDate: '2026-11-25',
};

const newIssue: NewStockIssue = {
  issueNumber: 'ISS-0046',
  issueDate: '2026-11-26',
  itemId: 101,
  warehouseId: 7,
  quantityIssued: 2,
};

describe('StockIssuesService', () => {
  let service: StockIssuesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(StockIssuesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and maps backend quantity fields and derives the issued status', async () => {
    const result = firstValueFrom(service.loadIssues());
    const request = http.expectOne(API_URL);
    expect(request.request.method).toBe('GET');
    request.flush([apiIssue]);

    expect(await result).toEqual([
      {
        id: 45,
        issueNumber: 'ISS-0045',
        itemId: 101,
        warehouseId: 7,
        quantityIssued: 3,
        issueDate: '2026-11-25',
        status: 'Issued',
      },
    ]);
  });

  it('loads a single issue by its database ID', async () => {
    const result = firstValueFrom(service.getIssue(apiIssue.id));
    const request = http.expectOne(`${API_URL}/${apiIssue.id}`);
    expect(request.request.method).toBe('GET');
    request.flush(apiIssue);

    expect(await result).toMatchObject({ id: 45, quantityIssued: 3 });
  });

  it('sends backend fields for create, update and delete', async () => {
    const createResult = firstValueFrom(service.addIssue(newIssue));
    const createRequest = http.expectOne(API_URL);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({
      issueNumber: 'ISS-0046',
      itemId: 101,
      warehouseId: 7,
      quantity: 2,
      issueDate: '2026-11-26',
    });
    createRequest.flush({ ...apiIssue, issueNumber: 'ISS-0046', quantity: 2 });
    const created = await createResult;

    const updateResult = firstValueFrom(
      service.updateIssue({ ...created, quantityIssued: 4, issueDate: '2026-11-27' }),
    );
    const updateRequest = http.expectOne(`${API_URL}/${created.id}`);
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual({
      issueNumber: 'ISS-0046',
      itemId: 101,
      warehouseId: 7,
      quantity: 4,
      issueDate: '2026-11-27',
    });
    updateRequest.flush({
      ...apiIssue,
      issueNumber: 'ISS-0046',
      quantity: 4,
      issueDate: '2026-11-27',
    });
    await updateResult;

    const deleteResult = firstValueFrom(service.deleteIssue(created.id));
    const deleteRequest = http.expectOne(`${API_URL}/${created.id}`);
    expect(deleteRequest.request.method).toBe('DELETE');
    deleteRequest.flush(null);
    await deleteResult;
    expect(service.getCurrentIssues()).toEqual([]);
  });

  it('distinguishes duplicate issue numbers from insufficient-stock conflicts', async () => {
    const duplicateResult = firstValueFrom(service.addIssue(newIssue));
    http
      .expectOne(API_URL)
      .flush({ message: 'Issue number already exists' }, { status: 409, statusText: 'Conflict' });
    await expect(duplicateResult).rejects.toBeInstanceOf(DuplicateIssueNumberError);

    const stockConflict = firstValueFrom(
      service.addIssue({ ...newIssue, issueNumber: 'ISS-0047' }),
    );
    http
      .expectOne(API_URL)
      .flush(
        { message: 'Operation rejected: insufficient stock' },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(stockConflict).rejects.toMatchObject({
      status: 409,
      error: { message: 'Operation rejected: insufficient stock' },
    });
  });
});

describe('StockIssues form', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StockIssues],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requires an integer positive quantity', () => {
    const fixture = TestBed.createComponent(StockIssues);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector('.add-issue-button') as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.issue-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const quantity = fixture.nativeElement.querySelector('#issue-quantity') as HTMLInputElement;
    expect(quantity.classList.contains('is-invalid')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Quantity issued must be greater than zero.',
    );
  });

  it('shows API stock and keeps the form open when the backend rejects an over-issue', () => {
    const itemsService = TestBed.inject(ItemsService);
    const warehousesService = TestBed.inject(WarehousesService);
    const balancesService = TestBed.inject(InventoryBalancesApiService);
    const issuesService = TestBed.inject(StockIssuesService);

    itemsService.loadItems().subscribe();
    http.expectOne('http://localhost:8080/api/items').flush([
      {
        id: 101,
        itemCode: 'BOX-01',
        itemName: 'Storage Box',
        category: 'Packaging',
        unit: 'Each',
        reorderLevel: 3,
        active: true,
      },
    ]);
    warehousesService.loadWarehouses().subscribe();
    http.expectOne('http://localhost:8080/api/warehouses').flush([
      {
        id: 7,
        warehouseCode: 'WH-07',
        warehouseName: 'North Depot',
        location: 'North',
        active: true,
      },
    ]);
    balancesService.loadBalances().subscribe();
    http.expectOne('http://localhost:8080/api/inventory/balances').flush([
      {
        itemId: 101,
        itemCode: 'BOX-01',
        itemName: 'Storage Box',
        warehouseId: 7,
        warehouseName: 'North Depot',
        availableQuantity: 2,
        reorderLevel: 3,
        lowStock: true,
      },
    ]);
    issuesService.loadIssues().subscribe();
    http.expectOne(API_URL).flush([]);

    const fixture = TestBed.createComponent(StockIssues);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.add-issue-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const item = fixture.nativeElement.querySelector('#issue-item') as HTMLSelectElement;
    item.value = item.options[1].value;
    item.dispatchEvent(new Event('change'));
    const warehouse = fixture.nativeElement.querySelector('#issue-warehouse') as HTMLSelectElement;
    warehouse.value = warehouse.options[1].value;
    warehouse.dispatchEvent(new Event('change'));
    const quantity = fixture.nativeElement.querySelector('#issue-quantity') as HTMLInputElement;
    quantity.value = '3';
    quantity.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Current available stock: 2 Each');

    (fixture.nativeElement.querySelector('.issue-dialog form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    const createRequest = http.expectOne(API_URL);
    expect(createRequest.request.body).toMatchObject({
      itemId: 101,
      warehouseId: 7,
      quantity: 3,
    });
    createRequest.flush(
      {
        timestamp: '2026-11-26T00:00:00',
        status: 409,
        message: 'Operation rejected: insufficient stock',
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.issue-dialog')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Operation rejected: insufficient stock');
    expect(fixture.nativeElement.textContent).not.toContain('was recorded.');
  });
});
