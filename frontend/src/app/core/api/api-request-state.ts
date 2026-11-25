import { catchError, defer, map, Observable, of, startWith } from 'rxjs';

export type ApiRequestState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: unknown };

export function trackApiRequest<T>(request: Observable<T>): Observable<ApiRequestState<T>> {
  return defer(() => request).pipe(
    map((data): ApiRequestState<T> => ({ status: 'success', data })),
    startWith<ApiRequestState<T>>({ status: 'loading' }),
    catchError((error: unknown) => of<ApiRequestState<T>>({ status: 'error', error })),
  );
}
