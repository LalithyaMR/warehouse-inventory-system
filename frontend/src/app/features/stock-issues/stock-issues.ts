import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { NewStockIssue, StockIssue, StockIssueStatus } from './stock-issue.model';
import {
  DuplicateIssueNumberError,
  InsufficientStockError,
  InvalidStockMovementQuantityError,
  StockIssuesService,
} from './stock-issues.service';
import { sortRows, TableSortState } from '../../core/ui/table-sort';

type IssueFormField =
  | 'issueNumber'
  | 'issueDate'
  | 'itemId'
  | 'warehouseId'
  | 'quantityIssued'
  | 'recipient'
  | 'referenceNumber'
  | 'reason'
  | 'notes'
  | 'status';

interface IssueRow extends StockIssue {
  itemName: string;
  itemSku: string;
  itemUnit: string;
  warehouseName: string;
}

type IssueSortColumn =
  | 'issueNumber'
  | 'issueDate'
  | 'itemName'
  | 'itemSku'
  | 'warehouseName'
  | 'recipient'
  | 'quantityIssued'
  | 'status';

@Component({
  selector: 'app-stock-issues',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './stock-issues.html',
  styleUrl: './stock-issues.css',
})
export class StockIssues {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly issuesService = inject(StockIssuesService);
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly issues = toSignal(this.issuesService.issues$, { initialValue: [] });
  protected readonly statuses: readonly StockIssueStatus[] = ['Issued', 'Cancelled'];
  protected readonly searchTerm = signal('');
  protected readonly selectedWarehouseId = signal('all');
  protected readonly selectedStatus = signal('all');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly formOpen = signal(false);
  protected readonly issueToEdit = signal<StockIssue | null>(null);
  protected readonly issueToView = signal<IssueRow | null>(null);
  protected readonly issueToDelete = signal<StockIssue | null>(null);
  protected readonly saveError = signal('');
  protected readonly notice = signal('');
  protected readonly sorting = new TableSortState<IssueSortColumn>('issueDate', 'desc', [
    'issueDate',
  ]);
  protected submitted = false;

  protected readonly form = this.formBuilder.group({
    issueNumber: [
      '',
      [Validators.required, Validators.maxLength(30), Validators.pattern(/^ISS-\d{4,}$/i)],
    ],
    issueDate: ['', Validators.required],
    itemId: [0, [Validators.required, Validators.min(1)]],
    warehouseId: [0, [Validators.required, Validators.min(1)]],
    quantityIssued: [
      0,
      [Validators.required, Validators.min(Number.MIN_VALUE), Validators.max(999999999)],
    ],
    recipient: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    referenceNumber: ['', Validators.maxLength(60)],
    reason: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    notes: ['', Validators.maxLength(500)],
    status: ['Issued' as StockIssueStatus, Validators.required],
  });

  protected readonly issueRows = computed(() => {
    const itemsById = new Map<number, InventoryItem>(this.items().map((item) => [item.id, item]));
    const warehousesById = new Map<number, Warehouse>(
      this.warehouses().map((warehouse) => [warehouse.id, warehouse]),
    );

    return this.issues().map((issue) => {
      const item = itemsById.get(issue.itemId);
      const warehouse = warehousesById.get(issue.warehouseId);

      return {
        ...issue,
        itemName: item?.name ?? `Unavailable item #${issue.itemId}`,
        itemSku: item?.sku ?? `ID-${issue.itemId}`,
        itemUnit: item?.unit ?? '',
        warehouseName: warehouse?.name ?? `Unavailable warehouse #${issue.warehouseId}`,
      };
    });
  });

  protected readonly filteredIssues = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const warehouseId = this.selectedWarehouseId();
    const status = this.selectedStatus();
    const from = this.dateFrom();
    const to = this.dateTo();

    if (from && to && from > to) {
      return [];
    }

    const filteredIssues = this.issueRows().filter((issue) => {
      const matchesSearch =
        query.length === 0 ||
        issue.issueNumber.toLocaleLowerCase().includes(query) ||
        issue.itemName.toLocaleLowerCase().includes(query) ||
        issue.recipient.toLocaleLowerCase().includes(query);
      const matchesWarehouse = warehouseId === 'all' || String(issue.warehouseId) === warehouseId;
      const matchesStatus = status === 'all' || issue.status === status;
      const matchesStartDate = !from || issue.issueDate >= from;
      const matchesEndDate = !to || issue.issueDate <= to;

      return (
        matchesSearch && matchesWarehouse && matchesStatus && matchesStartDate && matchesEndDate
      );
    });

    return sortRows(
      filteredIssues,
      (issue) => issue[this.sorting.column()],
      this.sorting.direction(),
    );
  });

  protected readonly totalQuantity = computed(() =>
    this.issues()
      .filter((issue) => issue.status === 'Issued')
      .reduce((total, issue) => total + issue.quantityIssued, 0),
  );
  protected readonly dateRangeInvalid = computed(() =>
    Boolean(this.dateFrom() && this.dateTo() && this.dateFrom() > this.dateTo()),
  );

  protected hasActiveFilters(): boolean {
    return (
      this.searchTerm().length > 0 ||
      this.selectedWarehouseId() !== 'all' ||
      this.selectedStatus() !== 'all' ||
      this.dateFrom().length > 0 ||
      this.dateTo().length > 0
    );
  }

  protected setSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected setWarehouse(event: Event): void {
    this.selectedWarehouseId.set((event.target as HTMLSelectElement).value);
  }

  protected setStatus(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value);
  }

  protected setDateFrom(event: Event): void {
    this.dateFrom.set((event.target as HTMLInputElement).value);
  }

  protected setDateTo(event: Event): void {
    this.dateTo.set((event.target as HTMLInputElement).value);
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.selectedWarehouseId.set('all');
    this.selectedStatus.set('all');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  protected openAddForm(): void {
    this.issueToEdit.set(null);
    this.form.reset({
      issueNumber: this.issuesService.suggestIssueNumber(),
      issueDate: new Date().toISOString().slice(0, 10),
      itemId: 0,
      warehouseId: 0,
      quantityIssued: 0,
      recipient: '',
      referenceNumber: '',
      reason: '',
      notes: '',
      status: 'Issued',
    });
    this.openForm();
  }

  protected openEditForm(issue: StockIssue): void {
    this.issueToEdit.set(issue);
    this.form.reset({
      issueNumber: issue.issueNumber,
      issueDate: issue.issueDate,
      itemId: issue.itemId,
      warehouseId: issue.warehouseId,
      quantityIssued: issue.quantityIssued,
      recipient: issue.recipient,
      referenceNumber: issue.referenceNumber,
      reason: issue.reason,
      notes: issue.notes,
      status: issue.status,
    });
    this.openForm();
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.issueToEdit.set(null);
    this.saveError.set('');
  }

  protected clearSaveError(): void {
    this.saveError.set('');
  }

  protected shouldShowError(field: IssueFormField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  protected validationMessage(field: IssueFormField): string {
    const control = this.form.controls[field];

    if (control.hasError('required')) {
      if (field === 'itemId') {
        return 'Select an item.';
      }
      if (field === 'warehouseId') {
        return 'Select a warehouse.';
      }
      if (field === 'quantityIssued') {
        return 'Enter a quantity greater than zero.';
      }
      return 'This field is required.';
    }
    if (control.hasError('maxlength')) {
      if (field === 'issueNumber') {
        return 'Issue number must be 30 characters or fewer.';
      }
      if (field === 'recipient') {
        return 'Recipient or department must be 100 characters or fewer.';
      }
      if (field === 'reason') {
        return 'Reason must be 100 characters or fewer.';
      }
      return field === 'referenceNumber'
        ? 'Reference number must be 60 characters or fewer.'
        : 'Notes must be 500 characters or fewer.';
    }
    if (control.hasError('pattern')) {
      return field === 'issueNumber'
        ? 'Issue number must use the generated ISS-#### format.'
        : field === 'reason'
          ? 'Reason cannot contain only spaces.'
          : 'Recipient or department cannot contain only spaces.';
    }
    if (control.hasError('min')) {
      if (field === 'quantityIssued') {
        return 'Quantity issued must be greater than zero.';
      }
      return field === 'itemId' ? 'Select an item.' : 'Select a warehouse.';
    }
    if (control.hasError('max')) {
      return 'Quantity must be 999,999,999 or less.';
    }
    if (control.hasError('unavailable')) {
      return field === 'itemId'
        ? 'This item is no longer available. Select another item.'
        : 'This warehouse is no longer available. Select another warehouse.';
    }

    return 'Check this value.';
  }

  protected saveIssue(): void {
    this.submitted = true;
    this.saveError.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const values = this.form.getRawValue();
    const selectedItem = this.items().find((item) => item.id === values.itemId);
    const selectedWarehouse = this.warehouses().find(
      (warehouse) => warehouse.id === values.warehouseId,
    );

    if (!selectedItem) {
      this.form.controls.itemId.setErrors({ unavailable: true });
      return;
    }
    if (!selectedWarehouse) {
      this.form.controls.warehouseId.setErrors({ unavailable: true });
      return;
    }

    const issueData: NewStockIssue = {
      issueDate: values.issueDate,
      itemId: values.itemId,
      warehouseId: values.warehouseId,
      quantityIssued: values.quantityIssued,
      recipient: values.recipient.trim(),
      referenceNumber: values.referenceNumber.trim(),
      reason: values.reason.trim(),
      notes: values.notes.trim(),
      status: values.status,
    };

    try {
      const existingIssue = this.issueToEdit();
      if (existingIssue) {
        const updatedIssue = this.issuesService.updateIssue({
          ...issueData,
          id: existingIssue.id,
          issueNumber: existingIssue.issueNumber,
        });
        this.notice.set(`${updatedIssue.issueNumber} was updated.`);
      } else {
        const newIssue = this.issuesService.addIssue(issueData);
        this.notice.set(`${newIssue.issueNumber} was recorded.`);
      }

      this.closeForm();
    } catch (error) {
      if (
        error instanceof InsufficientStockError ||
        error instanceof InvalidStockMovementQuantityError ||
        error instanceof DuplicateIssueNumberError
      ) {
        this.saveError.set(error.message);
        return;
      }

      throw error;
    }
  }

  protected viewIssue(issue: IssueRow): void {
    this.issueToView.set(issue);
  }

  protected closeView(): void {
    this.issueToView.set(null);
  }

  protected requestDelete(issue: StockIssue): void {
    this.issueToDelete.set(issue);
  }

  protected cancelDelete(): void {
    this.issueToDelete.set(null);
  }

  protected confirmDelete(): void {
    const issue = this.issueToDelete();
    if (!issue) {
      return;
    }

    this.issuesService.deleteIssue(issue.id);
    this.notice.set(`${issue.issueNumber} was deleted.`);
    this.cancelDelete();
  }

  protected dismissNotice(): void {
    this.notice.set('');
  }

  private openForm(): void {
    this.submitted = false;
    this.saveError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }
}
