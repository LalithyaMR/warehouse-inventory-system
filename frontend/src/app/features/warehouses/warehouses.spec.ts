import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewWarehouse } from './warehouse.model';
import { DuplicateWarehouseCodeError, WarehousesService } from './warehouses.service';
import { Warehouses } from './warehouses';

const newWarehouse: NewWarehouse = {
  name: 'West Coast Hub',
  code: 'WH-WEST',
  location: '1200 Market Street, San Francisco, CA',
  managerName: 'Casey Park',
  contactNumber: '+1 (415) 555-0182',
  status: 'Active',
};

describe('WarehousesService', () => {
  let service: WarehousesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WarehousesService);
  });

  it('creates, updates, and deletes warehouses in the observable directory', async () => {
    const created = service.addWarehouse(newWarehouse);
    expect(await firstValueFrom(service.warehouses$)).toContain(created);

    const updated = service.updateWarehouse({
      ...created,
      name: 'West Coast Distribution Hub',
    });
    const updatedWarehouses = await firstValueFrom(service.warehouses$);
    expect(updatedWarehouses).toContain(updated);
    expect(updatedWarehouses).not.toContain(created);

    service.deleteWarehouse(created.id);
    expect(await firstValueFrom(service.warehouses$)).not.toContain(updated);
  });

  it('rejects duplicate warehouse codes without regard to letter case', async () => {
    const existingCode = (await firstValueFrom(service.warehouses$))[0].code;
    expect(() =>
      service.addWarehouse({ ...newWarehouse, code: existingCode.toLowerCase() }),
    ).toThrow(DuplicateWarehouseCodeError);
  });

  it('starts with unique codes in the mock directory', async () => {
    const warehouses = await firstValueFrom(service.warehouses$);
    expect(new Set(warehouses.map((warehouse) => warehouse.code.toLocaleLowerCase())).size).toBe(
      warehouses.length,
    );
  });
});

describe('Warehouses', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Warehouses] }).compileComponents();
  });

  it('searches name, code, and location, and filters by status', () => {
    const fixture = TestBed.createComponent(Warehouses);
    fixture.detectChanges();

    const search = fixture.nativeElement.querySelector('#warehouse-search') as HTMLInputElement;
    for (const query of ['North Fulfillment', 'WH-NORTH', 'Harbor Way']) {
      search.value = query;
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    }

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const status = fixture.nativeElement.querySelector(
      '#warehouse-status-filter',
    ) as HTMLSelectElement;
    status.value = 'Inactive';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Seasonal Overflow');
  });

  it('shows validation feedback when the add form is submitted empty', () => {
    const fixture = TestBed.createComponent(Warehouses);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector(
      '.add-warehouse-button',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.warehouse-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.invalid-feedback').length).toBe(5);
  });

  it('rejects whitespace-only warehouse names', () => {
    const fixture = TestBed.createComponent(Warehouses);
    fixture.detectChanges();

    const addButton = fixture.nativeElement.querySelector(
      '.add-warehouse-button',
    ) as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector('#warehouse-name') as HTMLInputElement;
    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    const form = fixture.nativeElement.querySelector('.warehouse-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.invalid-feedback')?.textContent).toContain(
      'This field cannot contain only spaces.',
    );
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(5);
  });
});
