import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Items } from './items';
import { DuplicateSkuError, ItemsService } from './items.service';
import { NewInventoryItem } from './item.model';

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

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ItemsService);
  });

  it('creates, updates, and deletes items in the observable catalog', async () => {
    const created = service.addItem(newItem);
    expect(created.name).toBe(newItem.name);
    expect(await firstValueFrom(service.items$)).toContain(created);

    const updated = service.updateItem({ ...created, name: 'Large storage tote' });
    const updatedItems = await firstValueFrom(service.items$);
    expect(updatedItems).toContain(updated);
    expect(updatedItems).not.toContain(created);

    service.deleteItem(created.id);
    expect(await firstValueFrom(service.items$)).not.toContain(updated);
  });

  it('rejects duplicate SKUs without regard to letter case', async () => {
    const existingSku = (await firstValueFrom(service.items$))[0].sku;
    expect(() => service.addItem({ ...newItem, sku: existingSku.toLowerCase() })).toThrow(
      DuplicateSkuError,
    );
  });

  it('starts with unique SKUs in the mock catalog', async () => {
    const items = await firstValueFrom(service.items$);
    expect(new Set(items.map((item) => item.sku.toLocaleLowerCase())).size).toBe(items.length);
  });
});

describe('Items', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Items] }).compileComponents();
  });

  it('filters catalog rows by SKU, category, and status', () => {
    const fixture = TestBed.createComponent(Items);
    fixture.detectChanges();

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
    const fixture = TestBed.createComponent(Items);
    fixture.detectChanges();

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
    const fixture = TestBed.createComponent(Items);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector('.add-item-button') as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.item-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.invalid-feedback').length).toBe(4);
  });
});
