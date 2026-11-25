import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { NewStockTransfer, StockTransfer, StockTransferStatus } from './stock-transfer.model';
import {
  DuplicateTransferNumberError,
  InsufficientStockError,
  InvalidStockMovementQuantityError,
  SameWarehouseTransferError,
  StockTransfersService,
} from './stock-transfers.service';
import { sortRows, TableSortState } from '../../core/ui/table-sort';

type TransferFormField =
  | 'transferNumber'
  | 'transferDate'
  | 'itemId'
  | 'sourceWarehouseId'
  | 'destinationWarehouseId'
  | 'quantity'
  | 'referenceNumber'
  | 'notes'
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

@Component({
  selector: 'app-stock-transfers',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './stock-transfers.html',
  styleUrl: './stock-transfers.css',
})
export class StockTransfers {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly transfersService = inject(StockTransfersService);
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly transfers = toSignal(this.transfersService.transfers$, { initialValue: [] });
  protected readonly statuses: readonly StockTransferStatus[] = [
    'Pending',
    'In Transit',
    'Completed',
    'Cancelled',
  ];
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
        [Validators.required, Validators.min(Number.MIN_VALUE), Validators.max(999999999)],
      ],
      referenceNumber: ['', Validators.maxLength(60)],
      notes: ['', Validators.maxLength(500)],
      status: ['Pending' as StockTransferStatus, Validators.required],
    },
    { validators: differentWarehousesValidator },
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
    this.transferToEdit.set(null);
    this.form.reset({
      transferNumber: this.transfersService.suggestTransferNumber(),
      transferDate: new Date().toISOString().slice(0, 10),
      itemId: 0,
      sourceWarehouseId: 0,
      destinationWarehouseId: 0,
      quantity: 0,
      referenceNumber: '',
      notes: '',
      status: 'Pending',
    });
    this.openForm();
  }

  protected openEditForm(transfer: StockTransfer): void {
    this.transferToEdit.set(transfer);
    this.form.reset({
      transferNumber: transfer.transferNumber,
      transferDate: transfer.transferDate,
      itemId: transfer.itemId,
      sourceWarehouseId: transfer.sourceWarehouseId,
      destinationWarehouseId: transfer.destinationWarehouseId,
      quantity: transfer.quantity,
      referenceNumber: transfer.referenceNumber,
      notes: transfer.notes,
      status: transfer.status,
    });
    this.openForm();
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
        return 'Enter a quantity greater than zero.';
      }
      return 'This field is required.';
    }
    if (control.hasError('maxlength')) {
      return field === 'transferNumber'
        ? 'Transfer number must be 30 characters or fewer.'
        : field === 'referenceNumber'
          ? 'Reference number must be 60 characters or fewer.'
          : 'Notes must be 500 characters or fewer.';
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
      return 'Quantity must be 999,999,999 or less.';
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

    if (this.form.invalid) {
      return;
    }

    const values = this.form.getRawValue();
    const selectedItem = this.items().find((item) => item.id === values.itemId);
    const sourceWarehouse = this.warehouses().find(
      (warehouse) => warehouse.id === values.sourceWarehouseId,
    );
    const destinationWarehouse = this.warehouses().find(
      (warehouse) => warehouse.id === values.destinationWarehouseId,
    );

    if (!selectedItem) {
      this.form.controls.itemId.setErrors({ unavailable: true });
      return;
    }
    if (!sourceWarehouse) {
      this.form.controls.sourceWarehouseId.setErrors({ unavailable: true });
      return;
    }
    if (!destinationWarehouse) {
      this.form.controls.destinationWarehouseId.setErrors({ unavailable: true });
      return;
    }

    const transferData: NewStockTransfer = {
      transferDate: values.transferDate,
      itemId: values.itemId,
      sourceWarehouseId: values.sourceWarehouseId,
      destinationWarehouseId: values.destinationWarehouseId,
      quantity: values.quantity,
      referenceNumber: values.referenceNumber.trim(),
      notes: values.notes.trim(),
      status: values.status,
    };

    try {
      const existingTransfer = this.transferToEdit();
      if (existingTransfer) {
        const updatedTransfer = this.transfersService.updateTransfer({
          ...transferData,
          id: existingTransfer.id,
          transferNumber: existingTransfer.transferNumber,
        });
        this.notice.set(`${updatedTransfer.transferNumber} was updated.`);
      } else {
        const newTransfer = this.transfersService.addTransfer(transferData);
        this.notice.set(`${newTransfer.transferNumber} was recorded.`);
      }

      this.closeForm();
    } catch (error) {
      if (
        error instanceof InsufficientStockError ||
        error instanceof InvalidStockMovementQuantityError ||
        error instanceof SameWarehouseTransferError ||
        error instanceof DuplicateTransferNumberError
      ) {
        this.saveError.set(error.message);
        return;
      }

      throw error;
    }
  }

  protected viewTransfer(transfer: TransferRow): void {
    this.transferToView.set(transfer);
  }

  protected closeView(): void {
    this.transferToView.set(null);
  }

  protected requestDelete(transfer: StockTransfer): void {
    this.transferToDelete.set(transfer);
  }

  protected cancelDelete(): void {
    this.transferToDelete.set(null);
  }

  protected confirmDelete(): void {
    const transfer = this.transferToDelete();
    if (!transfer) {
      return;
    }

    this.transfersService.deleteTransfer(transfer.id);
    this.notice.set(`${transfer.transferNumber} was deleted.`);
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
