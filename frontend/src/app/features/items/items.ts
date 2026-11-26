
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ReactiveFormsModule,
  Validators,
  FormBuilder
} from '@angular/forms';

import {
  DuplicateSkuError,
  ItemsService
} from './items.service';

import {
  InventoryItem,
  NewInventoryItem,
  ITEM_CATEGORIES,
  ITEM_UNITS,
  ItemStatus
} from './item.model';

import {
  sortRows,
  TableSortState
} from '../../core/ui/table-sort';

type ItemFormField =
  | 'name'
  | 'sku'
  | 'category'
  | 'unit'
  | 'minStock'
  | 'status';

type ItemSortColumn = ItemFormField;

@Component({
  selector: 'app-items',
  imports: [ReactiveFormsModule],
  templateUrl: './items.html',
  styleUrl: './items.css',
})
export class Items {

  private readonly formBuilder =
    inject(FormBuilder).nonNullable;

  private readonly itemsService = inject(ItemsService);

  protected readonly categories = ITEM_CATEGORIES;
  protected readonly units = ITEM_UNITS;

  protected readonly statuses: readonly ItemStatus[] = [
    'Active',
    'Inactive'
  ];

  // Items are loaded from Spring Boot through ItemsService
  protected readonly items = toSignal(
    this.itemsService.items$,
    { initialValue: [] }
  );

  // Search and filter
  protected readonly searchTerm = signal('');
  protected readonly selectedCategory =
    signal('All categories');
  protected readonly selectedStatus =
    signal('All statuses');

  // Dialogs
  protected readonly formOpen = signal(false);
  protected readonly itemToEdit =
    signal<InventoryItem | null>(null);
  protected readonly itemToDelete =
    signal<InventoryItem | null>(null);

  // Messages and request state
  protected readonly saveError = signal('');
  protected readonly editError = signal('');
  protected readonly deleteError = signal('');
  protected readonly notice = signal('');
  protected readonly loadingItemId = signal<number | null>(null);
  private readonly loadRequestError = toSignal(this.itemsService.loadError$, {
    initialValue: null,
  });
  protected readonly loadError = computed(() => {
    const error = this.loadRequestError();
    return error ? this.getErrorMessage(error, 'Could not load items.') : '';
  });
  protected readonly loading = toSignal(this.itemsService.loading$, {
    initialValue: false,
  });
  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);

  protected submitted = false;

  protected readonly sorting =
    new TableSortState<ItemSortColumn>('name');

  // Reactive form
  protected readonly form = this.formBuilder.group({
    name: [
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ],

    sku: [
      '',
      [
        Validators.required,
        Validators.maxLength(40),
        Validators.pattern(
          /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/
        )
      ]
    ],

    category: ['', Validators.required],

    unit: ['', Validators.required],

    minStock: [
      0,
      [
        Validators.required,
        Validators.min(0),
        Validators.max(999999),
        Validators.pattern(/^\d+$/)
      ]
    ],

    status: this.formBuilder.control<ItemStatus>(
      'Active',
      Validators.required
    ),
  });

  // Filter and sort items
  protected readonly filteredItems = computed(() => {

    const query =
      this.searchTerm().trim().toLowerCase();

    const category = this.selectedCategory();
    const status = this.selectedStatus();

    const filteredItems = this.items().filter(item => {

      const matchesSearch =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query);

      const matchesCategory =
        category === 'All categories' ||
        item.category === category;

      const matchesStatus =
        status === 'All statuses' ||
        item.status === status;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus
      );
    });

    return sortRows(
      filteredItems,
      item => item[this.sorting.column()],
      this.sorting.direction()
    );
  });

  // Summary counts
  protected readonly activeCount = computed(() =>
    this.items().filter(
      item => item.status === 'Active'
    ).length
  );

  protected readonly inactiveCount = computed(() =>
    this.items().filter(
      item => item.status === 'Inactive'
    ).length
  );

  // Search and filter functions
  protected hasActiveFilters(): boolean {
    return (
      this.searchTerm().length > 0 ||
      this.selectedCategory() !== 'All categories' ||
      this.selectedStatus() !== 'All statuses'
    );
  }

  protected setSearch(event: Event): void {
    this.searchTerm.set(
      (event.target as HTMLInputElement).value
    );
  }

  protected setCategory(event: Event): void {
    this.selectedCategory.set(
      (event.target as HTMLSelectElement).value
    );
  }

  protected setStatus(event: Event): void {
    this.selectedStatus.set(
      (event.target as HTMLSelectElement).value
    );
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('All categories');
    this.selectedStatus.set('All statuses');
  }

  protected retryLoadItems(): void {
    this.itemsService.reloadItems();
  }

  // Open Add Item form
  protected openAddForm(): void {
    this.itemToEdit.set(null);

    this.form.reset({
      name: '',
      sku: '',
      category: '',
      unit: '',
      minStock: 0,
      status: 'Active'
    });

    this.openForm();
  }

  // Open Edit Item form
  protected openEditForm(item: InventoryItem): void {
    if (this.loadingItemId() !== null) {
      return;
    }

    this.editError.set('');
    this.loadingItemId.set(item.id);
    this.itemsService.getItem(item.id).subscribe({
      next: (loadedItem) => {
        this.loadingItemId.set(null);
        this.itemToEdit.set(loadedItem);
        this.form.reset({
          name: loadedItem.name,
          sku: loadedItem.sku,
          category: loadedItem.category,
          unit: loadedItem.unit,
          minStock: loadedItem.minStock,
          status: loadedItem.status,
        });
        this.openForm();
      },
      error: (error: unknown) => {
        this.loadingItemId.set(null);
        this.editError.set(
          this.getErrorMessage(error, 'Could not load the item for editing.'),
        );
      },
    });
  }

  protected closeForm(): void {
    if (this.saving()) {
      return;
    }

    this.formOpen.set(false);
    this.itemToEdit.set(null);
    this.saveError.set('');
  }

  protected clearSaveError(): void {
    this.saveError.set('');
  }

  // Form validation
  protected shouldShowError(
    field: ItemFormField
  ): boolean {

    const control = this.form.controls[field];

    return (
      control.invalid &&
      (control.touched || this.submitted)
    );
  }

  protected validationMessage(
    field: ItemFormField
  ): string {

    const control = this.form.controls[field];

    if (control.hasError('required')) {
      return 'This field is required.';
    }

    if (control.hasError('maxlength')) {
      return field === 'sku'
        ? 'SKU must be 40 characters or fewer.'
        : 'Item name must be 100 characters or fewer.';
    }

    if (control.hasError('pattern')) {
      return field === 'sku'
        ? 'Use letters, numbers, periods, underscores, slashes, or hyphens.'
        : 'Minimum stock must be a whole number.';
    }

    if (
      control.hasError('min') ||
      control.hasError('max')
    ) {
      return 'Enter a value between 0 and 999,999.';
    }

    return 'Check this value.';
  }

  // Add or Update Item using Spring Boot
  protected saveItem(): void {

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

    const itemData: NewInventoryItem = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      category: values.category,
      unit: values.unit,
      minStock: values.minStock,
      status: values.status
    };

    const existingItem = this.itemToEdit();

    // The backend creates active items and deactivates
    // existing items through DELETE.
    if (
      (!existingItem && itemData.status !== 'Active') ||
      (existingItem &&
        itemData.status !== existingItem.status)
    ) {
      this.saveError.set(
        'Status cannot be changed in this form. ' +
        'Use the Deactivate action for an active item.'
      );
      return;
    }

    this.saving.set(true);

    const request = existingItem
      ? this.itemsService.updateItem({
          ...itemData,
          id: existingItem.id
        })
      : this.itemsService.addItem(itemData);

    request.subscribe({
      next: () => {
        this.saving.set(false);

        this.notice.set(
          `${itemData.name} was ${
            existingItem ? 'updated' : 'added'
          } successfully.`
        );

        this.closeForm();
      },

      error: (error: unknown) => {
        this.saving.set(false);

        this.saveError.set(
          this.getErrorMessage(
            error,
            'Could not save the item.'
          )
        );
      }
    });
  }

  // Open delete confirmation
  protected requestDelete(
    item: InventoryItem
  ): void {
    this.deleteError.set('');
    this.itemToDelete.set(item);
  }

  // Close delete confirmation
  protected cancelDelete(): void {
    if (this.deleting()) {
      return;
    }

    this.itemToDelete.set(null);
    this.deleteError.set('');
  }

  // Deactivate item through Spring Boot
  protected confirmDelete(): void {

    const item = this.itemToDelete();

    if (!item || this.deleting()) {
      return;
    }

    this.deleteError.set('');
    this.deleting.set(true);

    this.itemsService.deleteItem(item.id).subscribe({

      next: () => {
        this.deleting.set(false);

        this.notice.set(
          `${item.name} was deactivated successfully.`
        );

        this.cancelDelete();
      },

      error: (error: unknown) => {
        this.deleting.set(false);

        this.deleteError.set(
          this.getErrorMessage(
            error,
            'Could not deactivate the item.'
          )
        );
      }
    });
  }

  // Remove success notification
  protected dismissNotice(): void {
    this.notice.set('');
  }

  // Open form dialog
  private openForm(): void {
    this.submitted = false;
    this.saveError.set('');
    this.notice.set('');
    this.formOpen.set(true);
  }

  // Display backend validation errors
  private getErrorMessage(
    error: unknown,
    fallback: string
  ): string {

    if (error instanceof DuplicateSkuError) {
      return error.message;
    }

    if (error instanceof HttpErrorResponse) {

      const backendMessage = this.backendErrorMessage(error);

      if (
        typeof backendMessage === 'string' &&
        backendMessage.trim()
      ) {
        return backendMessage;
      }

      if (error.status === 0) {
        return (
          'Cannot connect to Spring Boot. ' +
          'Check that the backend is running on port 8080.'
        );
      }

      if (error.status === 400) {
        return backendMessage || 'The backend rejected the item details. Check the fields and try again.';
      }

      if (error.status === 404) {
        return backendMessage || 'The requested item was not found. Refresh the catalog and try again.';
      }

      if (error.status === 409) {
        return backendMessage || 'An item with this SKU already exists.';
      }

      if (error.status >= 500) {
        return `The server could not complete the request (HTTP ${error.status}). Try again later.`;
      }

      return `${fallback} (HTTP ${error.status}).`;
    }

    return fallback;
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
