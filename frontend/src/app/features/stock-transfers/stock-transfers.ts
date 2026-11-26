import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { sortRows, TableSortState } from '../../core/ui/table-sort';
import { InventoryBalancesApiService } from '../stock-balances/inventory-balances-api.service';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { NewStockTransfer, StockTransfer, StockTransferStatus } from './stock-transfer.model';
import { DuplicateTransferNumberError, StockTransfersService } from './stock-transfers.service';

type TransferFormField =
  | 'transferNumber'
  | 'transferDate'
  | 'itemId'
  | 'sourceWarehouseId'
  | 'destinationWarehouseId'
  | 'quantity'
  | 'status';

interface TransferRow extends StockTransfer {
  itemName: string;
  itemSku: string;
  itemUnit: string;
  sourceWarehouseName: string;
  destinationWarehouseName: string;
}

type TransferSortColumn =
  | 'transferNumber'
  | 'transferDate'
  | 'itemName'
  | 'itemSku'
  | 'sourceWarehouseName'
  | 'destinationWarehouseName'
  | 'quantity'
  | 'status';

const differentWarehousesValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const sourceId = control.get('sourceWarehouseId')?.value;
  const destinationId = control.get('destinationWarehouseId')?.value;

  return typeof sourceId === 'number' &&
    typeof destinationId === 'number' &&
    sourceId > 0 &&
    sourceId === destinationId
    ? { sameWarehouse: true }
    : null;
};

function integerQuantity(control: AbstractControl<number>): ValidationErrors | null {
  return Number.isInteger(control.value) ? null : { integer: true };
}

@Component({
  selector: 'app-stock-transfers',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './stock-transfers.html',
  styleUrl: './stock-transfers.css',
})
export class StockTransfers implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly transfersService = inject(StockTransfersService);
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);
  private readonly inventoryBalancesService = inject(InventoryBalancesApiService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly transfers = toSignal(this.transfersService.transfers$, { initialValue: [] });
  protected readonly transfersLoading = toSignal(this.transfersService.loading$, {
    initialValue: false,
  });
  protected readonly transfersLoadError = toSignal(this.transfersService.loadError$, {
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
  protected readonly activeItems = computed(() =>
    this.items().filter((item) => item.status === 'Active'),
  );
  protected readonly activeWarehouses = computed(() =>
    this.warehouses().filter((warehouse) => warehouse.status === 'Active'),
  );
  protected readonly searchTerm = signal('');
  protected readonly selectedSourceWarehouseId = signal('all');
  protected readonly selectedDestinationWarehouseId = signal('all');
  protected readonly selectedStatus = signal('all');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly formOpen = signal(false);
  protected readonly transferToEdit = signal<StockTransfer | null>(null);
  protected readonly transferToView = signal<TransferRow | null>(null);
  protected readonly transferToDelete = signal<StockTransfer | null>(null);
  protected readonly notice = signal('');
  protected readonly saveError = signal('');
  protected readonly deleteError = signal('');
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly loadingTransferId = signal<number | null>(null);
  protected readonly statuses: readonly StockTransferStatus[] = [
    'Pending',
    'Completed',
    'Cancelled',
  ];
  protected readonly sorting = new TableSortState<TransferSortColumn>('transferDate', 'desc', [
    'transferDate',
  ]);
  protected submitted = false;

  protected readonly form = this.formBuilder.group(
    {
      transferNumber: [
        '',
        [Validators.required, Validators.maxLength(30), Validators.pattern(/^TRF-\d{4,}$/i)],
      ],
      transferDate: ['', Validators.required],
      itemId: [0, [Validators.required, Validators.min(1)]],
      sourceWarehouseId: [0, [Validators.required, Validators.min(1)]],
      destinationWarehouseId: [0, [Validators.required, Validators.min(1)]],
      quantity: [
        0,
        [Validators.required, Validators.min(1), Validators.max(2147483647), integerQuantity],
      ],
      status: ['Pending' as StockTransferStatus, Validators.required],
    },
    { validators: differentWarehousesValidator },
  );

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.inventoryBalancesService.reloadBalances();
    }
  }

  protected readonly selectedStatusForForm = toSignal(this.form.controls.status.valueChanges, {
    initialValue: this.form.controls.status.value,
  });
  protected readonly isCancelling = computed(
    () => this.transferToEdit() !== null && this.selectedStatusForForm() === 'Cancelled',
  );

  protected readonly transferRows = computed(() => {
    const itemsById = new Map<number, InventoryItem>(this.items().map((item) => [item.id, item]));
    const warehousesById = new Map<number, Warehouse>(
      this.warehouses().map((warehouse) => [warehouse.id, warehouse]),
    );

    return this.transfers().map((transfer) => {
      const item = itemsById.get(transfer.itemId);
      const source = warehousesById.get(transfer.sourceWarehouseId);
      const destination = warehousesById.get(transfer.destinationWarehouseId);

      return {
        ...transfer,
        itemName: item?.name ?? `Unavailable item #${transfer.itemId}`,
        itemSku: item?.sku ?? `ID-${transfer.itemId}`,
        itemUnit: item?.unit ?? '',
        sourceWarehouseName: source?.name ?? `Unavailable warehouse #${transfer.sourceWarehouseId}`,
        destinationWarehouseName:
          destination?.name ?? `Unavailable warehouse #${transfer.destinationWarehouseId}`,
      };
    });
  });

  protected readonly filteredTransfers = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const sourceId = this.selectedSourceWarehouseId();
    const destinationId = this.selectedDestinationWarehouseId();
    const status = this.selectedStatus();
    const from = this.dateFrom();
    const to = this.dateTo();

    if (from && to && from > to) {
      return [];
    }

    const filteredTransfers = this.transferRows().filter((transfer) => {
      const matchesSearch =
        query.length === 0 ||
        transfer.transferNumber.toLocaleLowerCase().includes(query) ||
        transfer.itemName.toLocaleLowerCase().includes(query);
      const matchesSource = sourceId === 'all' || String(transfer.sourceWarehouseId) === sourceId;
      const matchesDestination =
        destinationId === 'all' || String(transfer.destinationWarehouseId) === destinationId;
      const matchesStatus = status === 'all' || transfer.status === status;
      const matchesStartDate = !from || transfer.transferDate >= from;
      const matchesEndDate = !to || transfer.transferDate <= to;

      return (
        matchesSearch &&
        matchesSource &&
        matchesDestination &&
        matchesStatus &&
        matchesStartDate &&
        matchesEndDate
      );
    });

    return sortRows(
      filteredTransfers,
      (transfer) => transfer[this.sorting.column()],
      this.sorting.direction(),
    );
  });

  protected readonly completedQuantity = computed(() =>
    this.transfers()
      .filter((transfer) => transfer.status === 'Completed')
      .reduce((total, transfer) => total + transfer.quantity, 0),
  );
  protected readonly dateRangeInvalid = computed(() =>
    Boolean(this.dateFrom() && this.dateTo() && this.dateFrom() > this.dateTo()),
  );

  protected hasActiveFilters(): boolean {
    return (
      this.searchTerm().length > 0 ||
      this.selectedSourceWarehouseId() !== 'all' ||
      this.selectedDestinationWarehouseId() !== 'all' ||
      this.selectedStatus() !== 'all' ||
      this.dateFrom().length > 0 ||
      this.dateTo().length > 0
    );
  }

  protected statusesForForm(): readonly StockTransferStatus[] {
    const existing = this.transferToEdit();
    if (!existing) {
      return ['Pending', 'Completed'];
    }
    if (existing.status === 'Cancelled') {
      return [];
    }
    return existing.status === 'Completed'
      ? ['Completed', 'Cancelled']
      : ['Pending', 'Completed', 'Cancelled'];
  }

  protected setSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected setSourceWarehouse(event: Event): void {
    this.selectedSourceWarehouseId.set((event.target as HTMLSelectElement).value);
  }

  protected setDestinationWarehouse(event: Event): void {
    this.selectedDestinationWarehouseId.set((event.target as HTMLSelectElement).value);
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
    this.selectedSourceWarehouseId.set('all');
    this.selectedDestinationWarehouseId.set('all');
    this.selectedStatus.set('all');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  protected openAddForm(): void {
    this.form.enable({ emitEvent: false });
    this.transferToEdit.set(null);
    this.form.reset({
      transferNumber: this.transfersService.suggestTransferNumber(),
      transferDate: this.today(),
      itemId: 0,
      sourceWarehouseId: 0,
      destinationWarehouseId: 0,
      quantity: 0,
      status: 'Pending',
    });
    this.openForm();
  }

  protected openEditForm(transfer: StockTransfer): void {
    if (transfer.status === 'Cancelled' || this.loadingTransferId() !== null) {
      return;
    }

    this.loadingTransferId.set(transfer.id);
    this.transfersService.getTransfer(transfer.id).subscribe({
      next: (loadedTransfer) => {
        this.form.enable({ emitEvent: false });
        this.transferToEdit.set(loadedTransfer);
        this.form.reset({
          transferNumber: loadedTransfer.transferNumber,
          transferDate: loadedTransfer.transferDate,
          itemId: loadedTransfer.itemId,
          sourceWarehouseId: loadedTransfer.sourceWarehouseId,
          destinationWarehouseId: loadedTransfer.destinationWarehouseId,
          quantity: loadedTransfer.quantity,
          status: loadedTransfer.status,
        });
        this.openForm();
        this.loadingTransferId.set(null);
      },
      error: (error: unknown) => {
        this.notice.set(this.errorMessage(error, 'load'));
        this.loadingTransferId.set(null);
      },
    });
  }

  protected onStatusChange(): void {
    const details = [
      this.form.controls.transferNumber,
      this.form.controls.transferDate,
      this.form.controls.itemId,
      this.form.controls.sourceWarehouseId,
      this.form.controls.destinationWarehouseId,
      this.form.controls.quantity,
    ];

    if (this.isCancelling()) {
      const original = this.transferToEdit();
      if (original) {
        this.form.patchValue(
          {
            transferNumber: original.transferNumber,
            transferDate: original.transferDate,
            itemId: original.itemId,
            sourceWarehouseId: original.sourceWarehouseId,
            destinationWarehouseId: original.destinationWarehouseId,
            quantity: original.quantity,
          },
          { emitEvent: false },
        );
      }
      for (const control of details) {
        control.disable({ emitEvent: false });
      }
    } else {
      for (const control of details) {
        control.enable({ emitEvent: false });
      }
    }
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.transferToEdit.set(null);
    this.saveError.set('');
  }

  protected shouldShowError(field: TransferFormField): boolean {
    const control = this.form.controls[field];
    const fieldInvalid = control.invalid && (control.touched || this.submitted);
    const sameWarehouse =
      field === 'destinationWarehouseId' &&
      this.form.hasError('sameWarehouse') &&
      (control.touched || this.submitted);

    return fieldInvalid || sameWarehouse;
  }

  protected validationMessage(field: TransferFormField): string {
    const control = this.form.controls[field];

    if (control.hasError('required')) {
      if (field === 'itemId') {
        return 'Select an item.';
      }
      if (field === 'sourceWarehouseId') {
        return 'Select a source warehouse.';
      }
      if (field === 'destinationWarehouseId') {
        return 'Select a destination warehouse.';
      }
      if (field === 'quantity') {
        return 'Enter a positive whole-number quantity.';
      }
      return 'This field is required.';
    }
    if (control.hasError('maxlength')) {
      return 'Transfer number must be 30 characters or fewer.';
    }
    if (control.hasError('pattern')) {
      return 'Transfer number must use the generated TRF-#### format.';
    }
    if (control.hasError('min')) {
      if (field === 'quantity') {
        return 'Quantity must be greater than zero.';
      }
      return field === 'itemId'
        ? 'Select an item.'
        : field === 'sourceWarehouseId'
          ? 'Select a source warehouse.'
          : 'Select a destination warehouse.';
    }
    if (control.hasError('max')) {
      return 'Quantity must be 2,147,483,647 or less.';
    }
    if (control.hasError('integer')) {
      return 'Quantity must be a whole number.';
    }
    if (field === 'destinationWarehouseId' && this.form.hasError('sameWarehouse')) {
      return 'Source and destination warehouses must be different.';
    }
    if (control.hasError('unavailable')) {
      return field === 'itemId'
        ? 'This item is no longer available. Select another item.'
        : 'This warehouse is no longer available. Select another warehouse.';
    }

    return 'Check this value.';
  }

  protected saveTransfer(): void {
    this.submitted = true;
    this.saveError.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid || this.saving()) {
      return;
    }

    const values = this.form.getRawValue();
    const existingTransfer = this.transferToEdit();
    const isCancellation = values.status === 'Cancelled' && existingTransfer !== null;

    if (!isCancellation && !this.activeItems().some((item) => item.id === values.itemId)) {
      this.form.controls.itemId.setErrors({ unavailable: true });
      return;
    }
    if (
      !isCancellation &&
      !this.activeWarehouses().some((warehouse) => warehouse.id === values.sourceWarehouseId)
    ) {
      this.form.controls.sourceWarehouseId.setErrors({ unavailable: true });
      return;
    }
    if (
      !isCancellation &&
      !this.activeWarehouses().some((warehouse) => warehouse.id === values.destinationWarehouseId)
    ) {
      this.form.controls.destinationWarehouseId.setErrors({ unavailable: true });
      return;
    }

    const transferData: NewStockTransfer = {
      transferNumber: values.transferNumber.trim(),
      transferDate: values.transferDate,
      itemId: values.itemId,
      sourceWarehouseId: values.sourceWarehouseId,
      destinationWarehouseId: values.destinationWarehouseId,
      quantity: values.quantity,
      status: values.status,
    };
    this.saving.set(true);

    const request = existingTransfer
      ? this.transfersService.updateTransfer({ ...transferData, id: existingTransfer.id })
      : this.transfersService.addTransfer(transferData);

    request.subscribe({
      next: (savedTransfer) => {
        this.saving.set(false);
        this.closeForm();
        this.notice.set(
          isCancellation
            ? `${savedTransfer.transferNumber} was cancelled.`
            : existingTransfer
              ? `${savedTransfer.transferNumber} was updated.`
              : `${savedTransfer.transferNumber} was recorded.`,
        );
        this.refreshAfterMovement();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(this.errorMessage(error, 'save'));
      },
    });
  }

  protected viewTransfer(transfer: TransferRow): void {
    this.transferToView.set(transfer);
  }

  protected closeView(): void {
    this.transferToView.set(null);
  }

  protected requestDelete(transfer: StockTransfer): void {
    this.deleteError.set('');
    this.transferToDelete.set(transfer);
  }

  protected cancelDelete(): void {
    if (!this.deleting()) {
      this.transferToDelete.set(null);
      this.deleteError.set('');
    }
  }

  protected confirmDelete(): void {
    const transfer = this.transferToDelete();
    if (!transfer || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set('');
    this.transfersService.deleteTransfer(transfer.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.transferToDelete.set(null);
        this.notice.set(
          transfer.status === 'Completed'
            ? `${transfer.transferNumber} was deleted and its stock movement was reversed.`
            : `${transfer.transferNumber} was deleted.`,
        );
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

  protected retryData(): void {
    this.transfersService.reloadTransfers();
    this.itemsService.reloadItems();
    this.warehousesService.reloadWarehouses();
  }

  protected isSameWarehouseOption(warehouseId: number, field: 'source' | 'destination'): boolean {
    return field === 'source'
      ? warehouseId === this.form.controls.destinationWarehouseId.value
      : warehouseId === this.form.controls.sourceWarehouseId.value;
  }

  private openForm(): void {
    this.submitted = false;
    this.saveError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  private refreshAfterMovement(): void {
    this.transfersService.reloadTransfers();
    this.inventoryBalancesService.reloadBalances();
  }

  private today(): string {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private errorMessage(error: unknown, operation: 'load' | 'save' | 'delete'): string {
    if (error instanceof DuplicateTransferNumberError) {
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
      return backendMessage ?? 'The request was invalid. Check the transfer details and try again.';
    }
    if (error.status === 404) {
      return operation === 'load'
        ? 'This transfer no longer exists. Refresh the list and try again.'
        : 'The transfer, item, or warehouse could not be found. Refresh and try again.';
    }
    if (error.status === 409) {
      return backendMessage ?? 'The transfer conflicts with current stock or status.';
    }
    if (error.status >= 500) {
      return backendMessage
        ? `The server could not ${operation} the transfer: ${backendMessage}`
        : 'The server could not complete the request. Try again later.';
    }
    return backendMessage ?? `Unable to ${operation} the stock transfer (HTTP ${error.status}).`;
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
