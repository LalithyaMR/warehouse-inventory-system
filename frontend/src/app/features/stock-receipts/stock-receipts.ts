import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
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
import { DuplicateReceiptNumberError, StockReceiptsService } from './stock-receipts.service';
import { NewStockReceipt, StockReceipt } from './stock-receipt.model';

type ReceiptFormField =
  'receiptNumber' | 'receiptDate' | 'itemId' | 'warehouseId' | 'quantityReceived';

interface ReceiptRow extends StockReceipt {
  itemName: string;
  itemSku: string;
  itemUnit: string;
  warehouseName: string;
}

function validDate(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return { date: true };
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value
    ? { date: true }
    : null;
}

@Component({
  selector: 'app-stock-receipts',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './stock-receipts.html',
  styleUrl: './stock-receipts.css',
})
export class StockReceipts {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly receiptsService = inject(StockReceiptsService);
  private readonly inventoryBalancesService = inject(InventoryBalancesApiService);
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly activeItems = computed(() =>
    this.items().filter((item) => item.status === 'Active'),
  );
  protected readonly activeWarehouses = computed(() =>
    this.warehouses().filter((warehouse) => warehouse.status === 'Active'),
  );
  protected readonly itemsLoading = toSignal(this.itemsService.loading$, { initialValue: false });
  protected readonly warehousesLoading = toSignal(this.warehousesService.loading$, {
    initialValue: false,
  });
  protected readonly itemsError = toSignal(this.itemsService.loadError$, { initialValue: null });
  protected readonly warehousesError = toSignal(this.warehousesService.loadError$, {
    initialValue: null,
  });
  protected readonly dropdownError = computed(() => {
    const itemError = this.itemsError();
    const warehouseError = this.warehousesError();
    if (itemError) {
      return this.getErrorMessage(itemError, 'Could not load items for the receipt form.');
    }
    if (warehouseError) {
      return this.getErrorMessage(
        warehouseError,
        'Could not load warehouses for the receipt form.',
      );
    }
    return '';
  });

  protected readonly receipts = toSignal(this.receiptsService.receipts$, {
    initialValue: [],
  });
  protected readonly loading = toSignal(this.receiptsService.loading$, { initialValue: false });
  private readonly loadRequestError = toSignal(this.receiptsService.loadError$, {
    initialValue: null,
  });
  protected readonly loadError = computed(() => {
    const error = this.loadRequestError();
    return error ? this.getErrorMessage(error, 'Could not load stock receipts.') : '';
  });

  protected readonly searchTerm = signal('');
  protected readonly selectedWarehouseId = signal('all');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly formOpen = signal(false);
  protected readonly receiptToEdit = signal<StockReceipt | null>(null);
  protected readonly receiptToView = signal<ReceiptRow | null>(null);
  protected readonly receiptToDelete = signal<StockReceipt | null>(null);
  protected readonly saveError = signal('');
  protected readonly editError = signal('');
  protected readonly deleteError = signal('');
  protected readonly notice = signal('');
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly loadingReceiptId = signal<number | null>(null);
  protected readonly sorting = new TableSortState<
    | 'receiptNumber'
    | 'receiptDate'
    | 'itemName'
    | 'itemSku'
    | 'warehouseName'
    | 'quantityReceived'
    | 'status'
  >('receiptDate', 'desc', ['receiptDate']);
  protected submitted = false;

  protected readonly form = this.formBuilder.group({
    receiptNumber: [
      '',
      [
        Validators.required,
        Validators.maxLength(30),
        Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/),
      ],
    ],
    receiptDate: ['', [Validators.required, validDate]],
    itemId: [0, [Validators.required, Validators.min(1)]],
    warehouseId: [0, [Validators.required, Validators.min(1)]],
    quantityReceived: [
      0,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(2147483647),
        Validators.pattern(/^\d+$/),
      ],
    ],
  });

  protected readonly receiptRows = computed(() => {
    const itemsById = new Map(this.items().map((item) => [item.id, item]));
    const warehousesById = new Map(this.warehouses().map((warehouse) => [warehouse.id, warehouse]));

    return this.receipts().map((receipt) => {
      const item = itemsById.get(receipt.itemId);
      const warehouse = warehousesById.get(receipt.warehouseId);

      return {
        ...receipt,
        itemName: item?.name ?? `Unavailable item #${receipt.itemId}`,
        itemSku: item?.sku ?? `ID-${receipt.itemId}`,
        itemUnit: item?.unit ?? '',
        warehouseName: warehouse?.name ?? `Unavailable warehouse #${receipt.warehouseId}`,
      };
    });
  });

  protected readonly filteredReceipts = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const warehouseId = this.selectedWarehouseId();
    const from = this.dateFrom();
    const to = this.dateTo();

    if (from && to && from > to) {
      return [];
    }

    const filteredReceipts = this.receiptRows().filter((receipt) => {
      const matchesSearch =
        query.length === 0 ||
        receipt.receiptNumber.toLocaleLowerCase().includes(query) ||
        receipt.itemName.toLocaleLowerCase().includes(query) ||
        receipt.itemSku.toLocaleLowerCase().includes(query) ||
        receipt.warehouseName.toLocaleLowerCase().includes(query);
      const matchesWarehouse = warehouseId === 'all' || String(receipt.warehouseId) === warehouseId;
      const matchesStartDate = !from || receipt.receiptDate >= from;
      const matchesEndDate = !to || receipt.receiptDate <= to;

      return matchesSearch && matchesWarehouse && matchesStartDate && matchesEndDate;
    });

    return sortRows(
      filteredReceipts,
      (receipt) => receipt[this.sorting.column()],
      this.sorting.direction(),
    );
  });

  protected readonly totalQuantity = computed(() =>
    this.receipts().reduce((total, receipt) => total + receipt.quantityReceived, 0),
  );
  protected readonly dateRangeInvalid = computed(() =>
    Boolean(this.dateFrom() && this.dateTo() && this.dateFrom() > this.dateTo()),
  );

  protected hasActiveFilters(): boolean {
    return (
      this.searchTerm().length > 0 ||
      this.selectedWarehouseId() !== 'all' ||
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

  protected setDateFrom(event: Event): void {
    this.dateFrom.set((event.target as HTMLInputElement).value);
  }

  protected setDateTo(event: Event): void {
    this.dateTo.set((event.target as HTMLInputElement).value);
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.selectedWarehouseId.set('all');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  protected retryLoadReceipts(): void {
    this.receiptsService.reloadReceipts();
  }

  protected retryLoadOptions(): void {
    if (this.itemsError()) {
      this.itemsService.reloadItems();
    }
    if (this.warehousesError()) {
      this.warehousesService.reloadWarehouses();
    }
  }

  protected openAddForm(): void {
    this.receiptToEdit.set(null);
    this.form.reset({
      receiptNumber: this.receiptsService.suggestReceiptNumber(),
      receiptDate: this.todayLocalDate(),
      itemId: 0,
      warehouseId: 0,
      quantityReceived: 0,
    });
    this.openForm();
  }

  protected openEditForm(receipt: StockReceipt): void {
    if (this.loadingReceiptId() !== null) {
      return;
    }

    this.editError.set('');
    this.loadingReceiptId.set(receipt.id);
    this.receiptsService.getReceipt(receipt.id).subscribe({
      next: (loadedReceipt) => {
        this.loadingReceiptId.set(null);
        this.receiptToEdit.set(loadedReceipt);
        this.form.reset({
          receiptNumber: loadedReceipt.receiptNumber,
          receiptDate: loadedReceipt.receiptDate,
          itemId: loadedReceipt.itemId,
          warehouseId: loadedReceipt.warehouseId,
          quantityReceived: loadedReceipt.quantityReceived,
        });
        this.openForm();
      },
      error: (error: unknown) => {
        this.loadingReceiptId.set(null);
        this.editError.set(this.getErrorMessage(error, 'Could not load the receipt for editing.'));
      },
    });
  }

  protected closeForm(): void {
    if (this.saving()) {
      return;
    }

    this.formOpen.set(false);
    this.receiptToEdit.set(null);
    this.saveError.set('');
  }

  protected clearSaveError(): void {
    this.saveError.set('');
  }

  protected shouldShowError(field: ReceiptFormField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  protected validationMessage(field: ReceiptFormField): string {
    const control = this.form.controls[field];
    if (control.hasError('required')) {
      return field === 'itemId'
        ? 'Select an item.'
        : field === 'warehouseId'
          ? 'Select a warehouse.'
          : 'This field is required.';
    }
    if (control.hasError('maxlength')) {
      return 'Receipt number must be 30 characters or fewer.';
    }
    if (control.hasError('pattern')) {
      return field === 'receiptNumber'
        ? 'Use letters, numbers, slashes, or hyphens.'
        : 'Quantity must be a whole number.';
    }
    if (control.hasError('date')) {
      return 'Enter a valid calendar date.';
    }
    if (control.hasError('min')) {
      return field === 'quantityReceived'
        ? 'Quantity must be a positive whole number.'
        : field === 'itemId'
          ? 'Select an item.'
          : 'Select a warehouse.';
    }
    if (control.hasError('max')) {
      return 'Quantity exceeds the supported whole-number range.';
    }
    if (control.hasError('unavailable')) {
      return field === 'itemId'
        ? 'This item is no longer active. Select an active item.'
        : 'This warehouse is no longer active. Select an active warehouse.';
    }

    return 'Check this value.';
  }

  protected saveReceipt(): void {
    if (this.saving()) {
      return;
    }

    this.submitted = true;
    this.saveError.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const values = this.form.getRawValue();
    const selectedItem = this.activeItems().find((item) => item.id === values.itemId);
    const selectedWarehouse = this.activeWarehouses().find(
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

    const receiptData: NewStockReceipt = {
      receiptNumber: values.receiptNumber.trim(),
      receiptDate: values.receiptDate,
      itemId: values.itemId,
      warehouseId: values.warehouseId,
      quantityReceived: values.quantityReceived,
    };
    const existingReceipt = this.receiptToEdit();
    const request = existingReceipt
      ? this.receiptsService.updateReceipt({
          ...receiptData,
          id: existingReceipt.id,
          status: 'Received',
        })
      : this.receiptsService.addReceipt(receiptData);

    this.saving.set(true);
    request.subscribe({
      next: (savedReceipt) => {
        this.saving.set(false);
        this.notice.set(
          `${savedReceipt.receiptNumber} was ${existingReceipt ? 'updated' : 'recorded'} successfully.`,
        );
        this.closeForm();
        this.receiptsService.reloadReceipts();
        this.inventoryBalancesService.reloadBalances();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(this.getErrorMessage(error, 'Could not save the receipt.'));
      },
    });
  }

  protected viewReceipt(receipt: ReceiptRow): void {
    this.receiptToView.set(receipt);
  }

  protected closeView(): void {
    this.receiptToView.set(null);
  }

  protected requestDelete(receipt: StockReceipt): void {
    this.deleteError.set('');
    this.receiptToDelete.set(receipt);
  }

  protected cancelDelete(): void {
    if (this.deleting()) {
      return;
    }

    this.receiptToDelete.set(null);
    this.deleteError.set('');
  }

  protected confirmDelete(): void {
    const receipt = this.receiptToDelete();
    if (!receipt || this.deleting()) {
      return;
    }

    this.deleteError.set('');
    this.deleting.set(true);
    this.receiptsService.deleteReceipt(receipt.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.notice.set(`${receipt.receiptNumber} was deleted and inventory was recalculated.`);
        this.cancelDelete();
        this.receiptsService.reloadReceipts();
        this.inventoryBalancesService.reloadBalances();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.deleteError.set(this.getErrorMessage(error, 'Could not delete the receipt.'));
      },
    });
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

  private todayLocalDate(): string {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${today.getFullYear()}-${month}-${day}`;
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof DuplicateReceiptNumberError) {
      return error.message;
    }
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    const backendMessage = this.backendErrorMessage(error);
    if (error.status === 0) {
      return 'Cannot connect to Spring Boot. Check that the backend is running on port 8080.';
    }
    if (error.status === 400) {
      return (
        backendMessage ??
        'The backend rejected the receipt. Check its fields and stock availability.'
      );
    }
    if (error.status === 404) {
      return (
        backendMessage ??
        'The requested receipt, item, or warehouse was not found. Refresh and try again.'
      );
    }
    if (error.status === 409) {
      return (
        backendMessage ??
        'A receipt with this number already exists or the operation would make stock negative.'
      );
    }
    if (error.status >= 500) {
      return `The server could not complete the request (HTTP ${error.status}). Try again later.`;
    }
    return `${fallback} (HTTP ${error.status}).`;
  }

  private backendErrorMessage(error: HttpErrorResponse): string | null {
    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error.trim();
    }

    const body: unknown = error.error;
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const detail = 'detail' in body ? body.detail : undefined;
    const message = 'message' in body ? body.message : undefined;
    const backendError = 'error' in body ? body.error : undefined;
    const text = [detail, message, backendError].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return text?.trim() ?? null;
  }
}
