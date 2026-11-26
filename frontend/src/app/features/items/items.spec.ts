import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Items } from './items';
import { DuplicateSkuError, ItemsService } from './items.service';
import { InventoryItem, NewInventoryItem } from './item.model';

const API_URL = 'http://localhost:8080/api/items';

const apiItems = [
  {
    id: 101,
    itemCode: 'PKG-BOX-M',
    itemName: 'Corrugated carton - medium',
    category: 'Packaging',
    unit: 'Each',
    reorderLevel: 40,
    active: true,
  },
  {
    id: 102,
    itemCode: 'PKG-BWR-01',
    itemName: 'Bubble wrap roll',
    category: 'Packaging',
    unit: 'Roll',
    reorderLevel: 8,
    active: true,
  },
  {
    id: 103,
    itemCode: 'RAW-FST-M8',
    itemName: 'Steel fastener M8',
    category: 'Raw Materials',
    unit: 'Box',
    reorderLevel: 15,
    active: false,
  },
];

const newItem: NewInventoryItem = {
  name: 'Storage tote',
  sku: 'STO-TOTE-01',
  category: 'Packaging',
  unit: 'Each',
  minStock: 10,
  status: 'Active',
};

describe('ItemsService', () => {
  let service: ItemsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(ItemsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and maps Spring Boot item fields, including inactive items', async () => {
    const result = firstValueFrom(service.loadItems());
    const request = http.expectOne(API_URL);

    expect(request.request.method).toBe('GET');
    request.flush(apiItems);

    expect(await result).toEqual([
      {
        id: 101,
        sku: 'PKG-BOX-M',
        name: 'Corrugated carton - medium',
        category: 'Packaging',
        unit: 'Each',
        minStock: 40,
        status: 'Active',
      },
      {
        id: 102,
        sku: 'PKG-BWR-01',
        name: 'Bubble wrap roll',
        category: 'Packaging',
        unit: 'Roll',
        minStock: 8,
        status: 'Active',
      },
      {
        id: 103,
        sku: 'RAW-FST-M8',
        name: 'Steel fastener M8',
        category: 'Raw Materials',
        unit: 'Box',
        minStock: 15,
        status: 'Inactive',
      },
    ] satisfies InventoryItem[]);
  });

  it('loads and maps an item by ID', async () => {
    const result = firstValueFrom(service.getItem(103));
    const request = http.expectOne(`${API_URL}/103`);

    expect(request.request.method).toBe('GET');
    request.flush(apiItems[2]);

    expect(await result).toEqual({
      id: 103,
      sku: 'RAW-FST-M8',
      name: 'Steel fastener M8',
      category: 'Raw Materials',
      unit: 'Box',
      minStock: 15,
      status: 'Inactive',
    });
  });

  it('sends mapped create and update requests and changes local state only after success', async () => {
    const initialLoad = firstValueFrom(service.loadItems());
    http.expectOne(API_URL).flush([apiItems[0]]);
    await initialLoad;

    const createResult = firstValueFrom(service.addItem(newItem));
    const createRequest = http.expectOne(API_URL);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({
      itemCode: 'STO-TOTE-01',
      itemName: 'Storage tote',
      category: 'Packaging',
      unit: 'Each',
      reorderLevel: 10,
    });
    expect(await firstValueFrom(service.items$)).toHaveLength(1);
    createRequest.flush({
      id: 104,
      itemCode: 'STO-TOTE-01',
      itemName: 'Storage tote',
      category: 'Packaging',
      unit: 'Each',
      reorderLevel: 10,
      active: true,
    });
    const created = await createResult;

    const updateResult = firstValueFrom(
      service.updateItem({ ...created, name: 'Large storage tote' }),
    );
    const updateRequest = http.expectOne(`${API_URL}/104`);
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body.itemName).toBe('Large storage tote');
    updateRequest.flush({
      id: 104,
      itemCode: 'STO-TOTE-01',
      itemName: 'Large storage tote',
      category: 'Packaging',
      unit: 'Each',
      reorderLevel: 10,
      active: true,
    });
    expect((await updateResult).name).toBe('Large storage tote');

    const deleteResult = firstValueFrom(service.deleteItem(104));
    const deleteRequest = http.expectOne(`${API_URL}/104`);
    expect(deleteRequest.request.method).toBe('DELETE');
    expect((await firstValueFrom(service.items$))[0].status).toBe('Active');
    deleteRequest.flush(null, { status: 204, statusText: 'No Content' });
    await deleteResult;
    expect(
      (await firstValueFrom(service.items$)).find((item) => item.id === 104)?.status,
    ).toBe('Inactive');
  });

  it('surfaces SKU conflicts from the backend', async () => {
    const result = firstValueFrom(service.addItem(newItem));
    http.expectOne(API_URL).flush(
      { status: 409, message: 'Item code already exists' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(result).rejects.toBeInstanceOf(DuplicateSkuError);
  });
});

describe('Items component', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Items],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createLoadedFixture() {
    const fixture = TestBed.createComponent(Items);
    fixture.detectChanges();
    http.expectOne(API_URL).flush(apiItems);
    fixture.detectChanges();
    return fixture;
  }

  it('filters catalog rows by SKU, category, and status', () => {
    const fixture = createLoadedFixture();

    const search = fixture.nativeElement.querySelector('#item-search') as HTMLInputElement;
    search.value = 'PKG-BOX-M';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const category = fixture.nativeElement.querySelector('#category-filter') as HTMLSelectElement;
    category.value = 'Packaging';
    category.dispatchEvent(new Event('change'));
    const status = fixture.nativeElement.querySelector('#status-filter') as HTMLSelectElement;
    status.value = 'Active';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('sorts item names from the sortable table header', () => {
    const fixture = createLoadedFixture();

    const sortButton = fixture.nativeElement.querySelector(
      'th[aria-sort="ascending"] .table-sort-button',
    ) as HTMLButtonElement;
    sortButton.click();
    fixture.detectChanges();

    const names = Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr td:first-child'),
      (cell: Element) => cell.textContent?.trim() ?? '',
    );
    const expected = [...names].sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' }),
    );

    expect(names).toEqual(expected);
    expect(sortButton.closest('th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('shows validation feedback when the add form is submitted empty', () => {
    const fixture = createLoadedFixture();
    const addButton = fixture.nativeElement.querySelector('.add-item-button') as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.item-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.invalid-feedback').length).toBe(4);
  });

  it('shows a retryable message when the backend cannot load items', () => {
    const fixture = TestBed.createComponent(Items);
    fixture.detectChanges();
    http.expectOne(API_URL).error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Cannot connect to Spring Boot');
    expect(fixture.nativeElement.querySelector('.alert-danger button')?.textContent).toContain(
      'Retry',
    );
  });
});
