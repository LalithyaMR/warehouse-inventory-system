import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryItem } from '../items/item.model';
import { ItemsService } from '../items/items.service';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehousesService } from '../warehouses/warehouses.service';
import { DuplicateReceiptNumberError, StockReceiptsService } from './stock-receipts.service';
import { NewStockReceipt, StockReceipt } from './stock-receipt.model';
import { sortRows, TableSortState } from '../../core/ui/table-sort';

type ReceiptFormField =
  | 'receiptNumber'
  | 'receiptDate'
  | 'itemId'
  | 'warehouseId'
  | 'supplierName'
  | 'quantityReceived'
  | 'referenceNumber'
  | 'notes';

interface ReceiptRow extends StockReceipt {
  itemName: string;
  itemSku: string;
  itemUnit: string;
  warehouseName: string;
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
  private readonly itemsService = inject(ItemsService);
  private readonly warehousesService = inject(WarehousesService);

  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly warehouses = toSignal(this.warehousesService.warehouses$, {
    initialValue: [],
  });
  protected readonly receipts = toSignal(this.receiptsService.receipts$, {
    initialValue: [],
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
  protected readonly notice = signal('');
  protected readonly sorting = new TableSortState<
    | 'receiptNumber'
    | 'receiptDate'
    | 'itemName'
    | 'itemSku'
    | 'warehouseName'
    | 'supplierName'
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
    receiptDate: ['', Validators.required],
    itemId: [0, [Validators.required, Validators.min(1)]],
    warehouseId: [0, [Validators.required, Validators.min(1)]],
    supplierName: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    quantityReceived: [
      0,
      [Validators.required, Validators.min(Number.MIN_VALUE), Validators.max(999999999)],
    ],
    referenceNumber: ['', Validators.maxLength(60)],
    notes: ['', Validators.maxLength(500)],
  });

  protected readonly receiptRows = computed(() => {
    const itemsById = new Map(this.items().map((item) => [item.id, item]));
    const warehousesById = new Map(this.warehouses().map((warehouse) => [warehouse.id, warehouse]));

    return this.receipts()
      .map((receipt) => {
        const item = itemsById.get(receipt.itemId);
        const warehouse = warehousesById.get(receipt.warehouseId);

        return {
          ...receipt,
          itemName: item?.name ?? `Unavailable item #${receipt.itemId}`,
          itemSku: item?.sku ?? `ID-${receipt.itemId}`,
          itemUnit: item?.unit ?? '',
          warehouseName: warehouse?.name ?? `Unavailable warehouse #${receipt.warehouseId}`,
        };
      })
      .sort((left, right) => right.receiptDate.localeCompare(left.receiptDate));
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
        receipt.supplierName.toLocaleLowerCase().includes(query);
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

  protected openAddForm(): void {
    this.receiptToEdit.set(null);
    this.form.reset({
      receiptNumber: this.receiptsService.suggestReceiptNumber(),
      receiptDate: new Date().toISOString().slice(0, 10),
      itemId: 0,
      warehouseId: 0,
      supplierName: '',
      quantityReceived: 0,
      referenceNumber: '',
      notes: '',
    });
    this.openForm();
  }

  protected openEditForm(receipt: StockReceipt): void {
    this.receiptToEdit.set(receipt);
    this.form.reset({
      receiptNumber: receipt.receiptNumber,
      receiptDate: receipt.receiptDate,
      itemId: receipt.itemId,
      warehouseId: receipt.warehouseId,
      supplierName: receipt.supplierName,
      quantityReceived: receipt.quantityReceived,
      referenceNumber: receipt.referenceNumber,
      notes: receipt.notes,
    });
    this.openForm();
  }

  protected closeForm(): void {
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
      if (field === 'receiptNumber') {
        return 'Receipt number must be 30 characters or fewer.';
      }
      if (field === 'supplierName') {
        return 'Supplier name must be 100 characters or fewer.';
      }
      return field === 'referenceNumber'
        ? 'Reference number must be 60 characters or fewer.'
        : 'Notes must be 500 characters or fewer.';
    }
    if (control.hasError('pattern')) {
      return field === 'receiptNumber'
        ? 'Use letters, numbers, slashes, or hyphens.'
        : 'Supplier name cannot contain only spaces.';
    }
    if (control.hasError('min')) {
      if (field === 'quantityReceived') {
        return 'Quantity received must be greater than zero.';
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

  protected saveReceipt(): void {
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

    const receiptData: NewStockReceipt = {
      receiptNumber: values.receiptNumber.trim(),
      receiptDate: values.receiptDate,
      itemId: values.itemId,
      warehouseId: values.warehouseId,
      supplierName: values.supplierName.trim(),
      quantityReceived: values.quantityReceived,
      referenceNumber: values.referenceNumber.trim(),
      notes: values.notes.trim(),
      status: 'Received',
    };

    try {
      const existingReceipt = this.receiptToEdit();
      if (existingReceipt) {
        this.receiptsService.updateReceipt({ ...receiptData, id: existingReceipt.id });
        this.notice.set(`${receiptData.receiptNumber} was updated.`);
      } else {
        this.receiptsService.addReceipt(receiptData);
        this.notice.set(`${receiptData.receiptNumber} was recorded.`);
      }

      this.closeForm();
    } catch (error) {
      if (error instanceof DuplicateReceiptNumberError) {
        this.saveError.set(error.message);
        return;
      }

      throw error;
    }
  }

  protected viewReceipt(receipt: ReceiptRow): void {
    this.receiptToView.set(receipt);
  }

  protected closeView(): void {
    this.receiptToView.set(null);
  }

  protected requestDelete(receipt: StockReceipt): void {
    this.receiptToDelete.set(receipt);
  }

  protected cancelDelete(): void {
    this.receiptToDelete.set(null);
  }

  protected confirmDelete(): void {
    const receipt = this.receiptToDelete();
    if (!receipt) {
      return;
    }

    this.receiptsService.deleteReceipt(receipt.id);
    this.notice.set(`${receipt.receiptNumber} was deleted.`);
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
