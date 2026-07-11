import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse } from '../interfaces/api-response.interface';
import { RAW_RESPONSE_KEY } from '../constants/auth.constants';

interface ControllerResult {
  message?: string;
  data?: unknown;
}

/**
 * Every successful response, from every controller, is shaped into
 * `{ success: true, message, data }` here — controllers stay focused on
 * business logic and just return `{ message, data }` (or plain data, which
 * gets wrapped with a default message). Centralizing this in one
 * interceptor means the response envelope can't drift between endpoints
 * because a developer forgot to wrap it by hand.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T> | T> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRaw) return next.handle();

    return next.handle().pipe(
      map((result: T | ControllerResult) => {
        const isWrapped =
          result !== null &&
          typeof result === 'object' &&
          ('message' in result || 'data' in result);

        const message = isWrapped
          ? (result.message ?? 'Request successful')
          : 'Request successful';

        const data = isWrapped ? (result.data ?? null) : (result ?? null);

        return { success: true, message, data } as ApiSuccessResponse<T>;
      }),
    );
  }
}
