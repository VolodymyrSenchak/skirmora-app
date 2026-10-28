import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, ErrorCode } from '../models';
import { ERROR_REASONS } from '../ui/copy';

/** Errors the socket hands back in `connect_error` / action acks look the same. */
export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && typeof (value as ApiError).code === 'string';
}

/** Normalises anything HttpClient can throw into the `{ code, message, reason? }` shape the API promises. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: ApiError } | null;
    if (body && isApiError(body.error)) {
      return body.error;
    }
    // status 0 is a network failure or a CORS rejection — never a server verdict
    return { code: statusToCode(error.status), message: error.status === 0 ? 'No connection' : error.message };
  }
  return { code: 'internal-server-error', message: error instanceof Error ? error.message : 'Something went wrong' };
}

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'bad-request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not-found';
    case 409:
      return 'conflict';
    case 410:
      return 'gone';
    case 429:
      return 'too-many-requests';
    default:
      return 'internal-server-error';
  }
}

/** Copy for the codes that land on a form field, a budget bar or a toast (plan §12). */
export function errorMessage(error: ApiError): string {
  if (error.reason && ERROR_REASONS[error.reason]) {
    return ERROR_REASONS[error.reason];
  }
  switch (error.code) {
    case 'nickname-taken':
      return 'Це ім’я вже зайняте в кімнаті. Додайте літеру.';
    case 'unauthorized':
      return 'Неправильний пароль.';
    case 'not-found':
      return 'Кімнати з таким кодом немає. Перевірте цифри.';
    case 'session-full':
      return 'Кімната заповнена.';
    case 'session-finished':
      return 'Ця гра вже закінчилась.';
    case 'session-started':
      return 'Гра вже почалась.';
    case 'gone':
      return 'Кімната закрита.';
    case 'outdated':
      return 'Гру оновлено — створіть нову кімнату.';
    case 'not-your-turn':
      return 'Зараз не ваш хід.';
    case 'illegal-action':
      return 'Цей хід уже неможливий.';
    case 'invalid-army':
      return 'Армія не відповідає правилам.';
    case 'invalid-deploy':
      return 'Розстановка не відповідає правилам.';
    case 'conflict':
      return 'Гра вже пішла далі.';
    case 'too-many-requests':
      return 'Зачекайте секунду.';
    case 'forbidden':
      return 'Зараз цього зробити не можна.';
    case 'bad-request':
      return 'Некоректні дані.';
    default:
      return error.message === 'No connection' ? 'Немає з’єднання.' : 'Щось пішло не так.';
  }
}
