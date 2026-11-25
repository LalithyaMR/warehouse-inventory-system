import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { API_BASE_URL, DATA_SOURCE_MODE } from './api-config';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly dataSource = inject(DATA_SOURCE_MODE);

  get<TResponse>(resourcePath: string): Observable<TResponse> {
    return defer(() => this.http.get<TResponse>(this.resolveUrl(resourcePath)));
  }

  post<TResponse, TRequest>(resourcePath: string, body: TRequest): Observable<TResponse> {
    return defer(() => this.http.post<TResponse>(this.resolveUrl(resourcePath), body));
  }

  put<TResponse, TRequest>(resourcePath: string, body: TRequest): Observable<TResponse> {
    return defer(() => this.http.put<TResponse>(this.resolveUrl(resourcePath), body));
  }

  delete<TResponse = void>(resourcePath: string): Observable<TResponse> {
    return defer(() => this.http.delete<TResponse>(this.resolveUrl(resourcePath)));
  }

  private resolveUrl(resourcePath: string): string {
    if (this.dataSource !== 'api') {
      throw new Error('API requests are disabled while dataSource is set to mock.');
    }

    const baseUrl = this.baseUrl.trim().replace(/\/+$/, '');
    const path = resourcePath.trim().replace(/^\/+/, '');

    if (!baseUrl) {
      throw new Error(
        'API base URL is not configured. Set it after the backend contract is available.',
      );
    }
    if (!path) {
      throw new Error('An API resource path is required.');
    }

    return `${baseUrl}/${path}`;
  }
}
