import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { sortRows, TableSortState } from '../../core/ui/table-sort';
import { InventoryBalancesApiService } from '../stock-balances/inventory-balances-api.service';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { NewStockIssue, StockIssue } from './stock-issue.model';
import { DuplicateIssueNumberError, StockIssuesService } from './stock-issues.service';

type IssueFormField = 'issueNumber' | 'issueDate' | 'itemId' | 'warehouseId' | 'quantityIssued';

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
  | 'quantityIssued'
  | 'status';

function integerQuantity(control: AbstractControl<number>): ValidationErrors | null {
  return Number.isInteger(control.value) ? null : { integer: true };
}

@Component({
  selector: 'app-stock-issues',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './stock-issues.html',
  styleUrl: './stock-issues.css',
})
export class StockIssues implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly issuesService = inject(StockIssuesService);
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);
  private readonly inventoryBalancesService = inject(InventoryBalancesApiService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly issues = toSignal(this.issuesService.issues$, { initialValue: [] });
  protected readonly balances = toSignal(this.inventoryBalancesService.balances$, {
    initialValue: [],
  });
  protected readonly issuesLoading = toSignal(this.issuesService.loading$, { initialValue: false });
  protected readonly issuesLoadError = toSignal(this.issuesService.loadError$, {
    initialValue: null,
  });
  protected readonly itemsLoading = toSignal(this.itemsService.loading$, { initialValue: false });
  protected readonly itemsLoadError = toSignal(this.itemsService.loadError$, {
    initialValue: null,
  });
  protected readonly warehousesLoading = toSignal(this.warehousesService.loading$, {
    initialValue: false,
  });
  protected readonly warehousesLoadError = toSignal(this.warehousesService.loadError$, {
    initialValue: null,
  });
  protected readonly balancesLoading = toSignal(this.inventoryBalancesService.loading$, {
    initialValue: false,
  });
  protected readonly balancesLoadError = toSignal(this.inventoryBalancesService.loadError$, {
    initialValue: null,
  });
  protected readonly activeItems = computed(() =>
    this.items().filter((item) => item.status === 'Active'),
  );
  protected readonly activeWarehouses = computed(() =>
    this.warehouses().filter((warehouse) => warehouse.status === 'Active'),
  );
  protected readonly statuses = ['Issued'] as const;
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
  protected readonly deleteError = signal('');
  protected readonly notice = signal('');
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly loadingIssueId = signal<number | null>(null);
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
      [Validators.required, Validators.min(1), Validators.max(2147483647), integerQuantity],
    ],
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.inventoryBalancesService.reloadBalances();
    }
  }

  protected readonly selectedItemId = toSignal(this.form.controls.itemId.valueChanges, {
    initialValue: this.form.controls.itemId.value,
  });
  protected readonly selectedWarehouseIdForBalance = toSignal(
    this.form.controls.warehouseId.valueChanges,
    { initialValue: this.form.controls.warehouseId.value },
  );
  protected readonly availableQuantity = computed(() => {
    const itemId = this.selectedItemId();
    const warehouseId = this.selectedWarehouseIdForBalance();
    if (itemId < 1 || warehouseId < 1) {
      return null;
    }

    return (
      this.balances().find(
        (balance) => balance.itemId === itemId && balance.warehouseId === warehouseId,
      )?.availableQuantity ?? 0
    );
  });
  protected readonly selectedItemUnit = computed(
    () => this.items().find((item) => item.id === this.selectedItemId())?.unit ?? '',
  );

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
        issue.itemName.toLocaleLowerCase().includes(query);
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
    this.issues().reduce((total, issue) => total + issue.quantityIssued, 0),
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
      issueDate: this.today(),
      itemId: 0,
      warehouseId: 0,
      quantityIssued: 0,
    });
    this.openForm();
  }

  protected openEditForm(issue: StockIssue): void {
    if (this.loadingIssueId() !== null) {
      return;
    }
    this.loadingIssueId.set(issue.id);
    this.issuesService.getIssue(issue.id).subscribe({
      next: (loadedIssue) => {
        this.issueToEdit.set(loadedIssue);
        this.form.reset({
          issueNumber: loadedIssue.issueNumber,
          issueDate: loadedIssue.issueDate,
          itemId: loadedIssue.itemId,
          warehouseId: loadedIssue.warehouseId,
          quantityIssued: loadedIssue.quantityIssued,
        });
        this.openForm();
        this.loadingIssueId.set(null);
      },
      error: (error: unknown) => {
        this.notice.set(this.errorMessage(error, 'load'));
        this.loadingIssueId.set(null);
      },
    });
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
        return 'Enter a positive whole-number quantity.';
      }
      return 'This field is required.';
    }
    if (control.hasError('maxlength')) {
      return 'Issue number must be 30 characters or fewer.';
    }
    if (control.hasError('pattern')) {
      return 'Issue number must use the generated ISS-#### format.';
    }
    if (control.hasError('min')) {
      return field === 'quantityIssued'
        ? 'Quantity issued must be greater than zero.'
        : field === 'itemId'
          ? 'Select an item.'
          : 'Select a warehouse.';
    }
    if (control.hasError('max')) {
      return 'Quantity must be 2,147,483,647 or less.';
    }
    if (control.hasError('integer')) {
      return 'Quantity must be a whole number.';
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

    if (this.form.invalid || this.saving()) {
      return;
    }

    const values = this.form.getRawValue();
    if (!this.activeItems().some((item) => item.id === values.itemId)) {
      this.form.controls.itemId.setErrors({ unavailable: true });
      return;
    }
    if (!this.activeWarehouses().some((warehouse) => warehouse.id === values.warehouseId)) {
      this.form.controls.warehouseId.setErrors({ unavailable: true });
      return;
    }

    const issueData: NewStockIssue = {
      issueNumber: values.issueNumber.trim(),
      issueDate: values.issueDate,
      itemId: values.itemId,
      warehouseId: values.warehouseId,
      quantityIssued: values.quantityIssued,
    };
    const existingIssue = this.issueToEdit();
    this.saving.set(true);

    const request = existingIssue
      ? this.issuesService.updateIssue({ ...issueData, id: existingIssue.id, status: 'Issued' })
      : this.issuesService.addIssue(issueData);

    request.subscribe({
      next: (savedIssue) => {
        this.saving.set(false);
        this.closeForm();
        this.notice.set(
          existingIssue
            ? `${savedIssue.issueNumber} was updated.`
            : `${savedIssue.issueNumber} was recorded.`,
        );
        this.refreshAfterMovement();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(this.errorMessage(error, 'save'));
      },
    });
  }

  protected viewIssue(issue: IssueRow): void {
    this.issueToView.set(issue);
  }

  protected closeView(): void {
    this.issueToView.set(null);
  }

  protected requestDelete(issue: StockIssue): void {
    this.deleteError.set('');
    this.issueToDelete.set(issue);
  }

  protected cancelDelete(): void {
    if (!this.deleting()) {
      this.issueToDelete.set(null);
      this.deleteError.set('');
    }
  }

  protected confirmDelete(): void {
    const issue = this.issueToDelete();
    if (!issue || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set('');
    this.issuesService.deleteIssue(issue.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.issueToDelete.set(null);
        this.notice.set(`${issue.issueNumber} was deleted and its quantity restored to stock.`);
        this.refreshAfterMovement();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.deleteError.set(this.errorMessage(error, 'delete'));
      },
    });
  }

  protected dismissNotice(): void {
    this.notice.set('');
  }

  protected refreshData(): void {
    this.issuesService.reloadIssues();
    this.itemsService.reloadItems();
    this.warehousesService.reloadWarehouses();
  }

  protected refreshBalances(): void {
    this.inventoryBalancesService.reloadBalances();
  }

  private openForm(): void {
    this.submitted = false;
    this.saveError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  private refreshAfterMovement(): void {
    this.issuesService.reloadIssues();
    this.inventoryBalancesService.reloadBalances();
  }

  private today(): string {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private errorMessage(error: unknown, operation: 'load' | 'save' | 'delete'): string {
    if (error instanceof DuplicateIssueNumberError) {
      return error.message;
    }
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error ? error.message : 'An unexpected error occurred.';
    }

    const backendMessage = this.backendMessage(error);
    if (error.status === 0) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    if (error.status === 400) {
      return backendMessage ?? 'The request was invalid. Check the issue details and try again.';
    }
    if (error.status === 404) {
      return operation === 'load'
        ? 'This issue no longer exists. Refresh the list and try again.'
        : 'The issue, item, or warehouse could not be found. Refresh the list and try again.';
    }
    if (error.status === 409) {
      return (
        backendMessage ?? 'The request conflicts with current inventory. Check available stock.'
      );
    }
    if (error.status >= 500) {
      return backendMessage
        ? `The server could not ${operation} the issue: ${backendMessage}`
        : 'The server could not complete the request. Try again later.';
    }
    return backendMessage ?? `Unable to ${operation} the stock issue (HTTP ${error.status}).`;
  }

  private backendMessage(error: HttpErrorResponse): string | null {
    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error.trim();
    }
    if (typeof error.error !== 'object' || error.error === null) {
      return null;
    }

    for (const key of ['message', 'detail', 'error']) {
      const value: unknown = error.error[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }
}
