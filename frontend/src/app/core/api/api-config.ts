import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export type DataSourceMode = 'mock' | 'api';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});

export const DATA_SOURCE_MODE = new InjectionToken<DataSourceMode>('DATA_SOURCE_MODE', {
  providedIn: 'root',
  factory: () => environment.dataSource,
});
