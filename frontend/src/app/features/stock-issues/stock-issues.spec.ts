import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { NewStockIssue } from './stock-issue.model';
import { StockIssuesService } from './stock-issues.service';
import { StockIssues } from './stock-issues';

const newIssue: NewStockIssue = {
  issueDate: '2026-11-25',
  itemId: 101,
  warehouseId: 1,
  quantityIssued: 25,
  recipient: 'Test Department',
  referenceNumber: 'REQ-TEST-01',
  reason: 'Testing',
  notes: '',
  status: 'Issued',
};

describe('StockIssuesService', () => {
  let service: StockIssuesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StockIssuesService);
  });

  it('creates, updates, and deletes issues with generated issue numbers', async () => {
    const created = service.addIssue(newIssue);
    expect(created.issueNumber).toBe('ISS-2005');
    expect(await firstValueFrom(service.issues$)).toContain(created);

    const updated = service.updateIssue({ ...created, recipient: 'Updated Department' });
    const updatedIssues = await firstValueFrom(service.issues$);
    expect(updatedIssues).toContain(updated);
    expect(updatedIssues).not.toContain(created);

    service.deleteIssue(created.id);
    expect(await firstValueFrom(service.issues$)).not.toContain(updated);
  });
});

describe('StockIssues', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StockIssues] }).compileComponents();
  });

  it('searches issue number, item name, and recipient, then filters by warehouse, status, and date', () => {
    const fixture = TestBed.createComponent(StockIssues);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('4 issues recorded · 42 units issued');

    const search = fixture.nativeElement.querySelector('#issue-search') as HTMLInputElement;
    for (const query of ['ISS-2001', 'Corrugated carton', 'Production Team']) {
      search.value = query;
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    }

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const warehouse = fixture.nativeElement.querySelector(
      '#issue-warehouse-filter',
    ) as HTMLSelectElement;
    warehouse.value = '1';
    warehouse.dispatchEvent(new Event('change'));
    const status = fixture.nativeElement.querySelector('#issue-status-filter') as HTMLSelectElement;
    status.value = 'Issued';
    status.dispatchEvent(new Event('change'));
    const from = fixture.nativeElement.querySelector('#issue-date-from') as HTMLInputElement;
    from.value = '2026-11-24';
    from.dispatchEvent(new Event('change'));
    const to = fixture.nativeElement.querySelector('#issue-date-to') as HTMLInputElement;
    to.value = '2026-11-24';
    to.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('ISS-2001');
  });

  it('requires a positive issue quantity before an issue can be recorded', () => {
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
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(4);
  });
});
