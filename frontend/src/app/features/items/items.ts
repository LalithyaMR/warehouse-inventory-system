import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, Validators, FormBuilder } from '@angular/forms';
import { DuplicateSkuError, ItemsService } from './items.service';
import { InventoryItem, ITEM_CATEGORIES, ITEM_UNITS, ItemStatus } from './item.model';
import { sortRows, TableSortState } from '../../core/ui/table-sort';

type ItemFormField = 'name' | 'sku' | 'category' | 'unit' | 'minStock' | 'status';
type ItemSortColumn = 'name' | 'sku' | 'category' | 'unit' | 'minStock' | 'status';

@Component({
  selector: 'app-items',
  imports: [ReactiveFormsModule],
  templateUrl: './items.html',
  styleUrl: './items.css',
})
export class Items {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly itemsService = inject(ItemsService);

  protected readonly categories = ITEM_CATEGORIES;
  protected readonly units = ITEM_UNITS;
  protected readonly statuses: readonly ItemStatus[] = ['Active', 'Inactive'];
  protected readonly items = toSignal(this.itemsService.items$, { initialValue: [] });
  protected readonly searchTerm = signal('');
  protected readonly selectedCategory = signal('All categories');
  protected readonly selectedStatus = signal('All statuses');
  protected readonly formOpen = signal(false);
  protected readonly itemToEdit = signal<InventoryItem | null>(null);
  protected readonly itemToDelete = signal<InventoryItem | null>(null);
  protected readonly saveError = signal('');
  protected readonly notice = signal('');
  protected readonly sorting = new TableSortState<ItemSortColumn>('name');

  protected submitted = false;

  protected readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sku: [
      '',
      [
        Validators.required,
        Validators.maxLength(40),
        Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/),
      ],
    ],
    category: ['', Validators.required],
    unit: ['', Validators.required],
    minStock: [
      0,
      [Validators.required, Validators.min(0), Validators.max(999999), Validators.pattern(/^\d+$/)],
    ],
    status: this.formBuilder.control<ItemStatus>('Active', Validators.required),
  });

  protected readonly filteredItems = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    const category = this.selectedCategory();
    const status = this.selectedStatus();

    const filteredItems = this.items().filter((item) => {
      const matchesSearch =
        query.length === 0 ||
        item.name.toLocaleLowerCase().includes(query) ||
        item.sku.toLocaleLowerCase().includes(query);
      const matchesCategory = category === 'All categories' || item.category === category;
      const matchesStatus = status === 'All statuses' || item.status === status;

      return matchesSearch && matchesCategory && matchesStatus;
    });

    return sortRows(filteredItems, (item) => item[this.sorting.column()], this.sorting.direction());
  });

  protected readonly activeCount = computed(
    () => this.items().filter((item) => item.status === 'Active').length,
  );
  protected readonly inactiveCount = computed(
    () => this.items().filter((item) => item.status === 'Inactive').length,
  );

  protected hasActiveFilters(): boolean {
    return (
      this.searchTerm().length > 0 ||
      this.selectedCategory() !== 'All categories' ||
      this.selectedStatus() !== 'All statuses'
    );
  }

  protected setSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected setCategory(event: Event): void {
    this.selectedCategory.set((event.target as HTMLSelectElement).value);
  }

  protected setStatus(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value);
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('All categories');
    this.selectedStatus.set('All statuses');
  }

  protected openAddForm(): void {
    this.itemToEdit.set(null);
    this.form.reset({
      name: '',
      sku: '',
      category: '',
      unit: '',
      minStock: 0,
      status: 'Active',
    });
    this.openForm();
  }

  protected openEditForm(item: InventoryItem): void {
    this.itemToEdit.set(item);
    this.form.reset({
      name: item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit,
      minStock: item.minStock,
      status: item.status,
    });
    this.openForm();
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.itemToEdit.set(null);
    this.saveError.set('');
  }

  protected clearSaveError(): void {
    this.saveError.set('');
  }

  protected shouldShowError(field: ItemFormField): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || this.submitted);
  }

  protected validationMessage(field: ItemFormField): string {
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
    if (control.hasError('min') || control.hasError('max')) {
      return 'Enter a value between 0 and 999,999.';
    }

    return 'Check this value.';
  }

  protected saveItem(): void {
    this.submitted = true;
    this.saveError.set('');
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const values = this.form.getRawValue();
    const itemData = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      category: values.category,
      unit: values.unit,
      minStock: values.minStock,
      status: values.status,
    };

    try {
      const existingItem = this.itemToEdit();
      if (existingItem) {
        this.itemsService.updateItem({ ...itemData, id: existingItem.id });
        this.notice.set(`${itemData.name} was updated.`);
      } else {
        this.itemsService.addItem(itemData);
        this.notice.set(`${itemData.name} was added.`);
      }

      this.closeForm();
    } catch (error) {
      if (error instanceof DuplicateSkuError) {
        this.saveError.set(error.message);
        return;
      }

      throw error;
    }
  }

  protected requestDelete(item: InventoryItem): void {
    this.itemToDelete.set(item);
  }

  protected cancelDelete(): void {
    this.itemToDelete.set(null);
  }

  protected confirmDelete(): void {
    const item = this.itemToDelete();
    if (!item) {
      return;
    }

    this.itemsService.deleteItem(item.id);
    this.notice.set(`${item.name} was deleted.`);
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
