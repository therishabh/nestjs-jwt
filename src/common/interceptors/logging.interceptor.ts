import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AppLogger } from '../../logger/app-logger.service';
import { RequestWithId } from '../middlewares/request-id.middleware';

/**
 * Logs one line per request on completion: method, path, status code,
 * duration, and request ID. This is what lets someone reconstruct "what did
 * this server do in the last hour" from logs alone, without a debugger
 * attached — essential once the app is running unattended in production.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request & RequestWithId>();
    const response = httpContext.getResponse<Response>();
    const { method, originalUrl, id } = request;
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        this.logger.log(
          `${method} ${originalUrl} ${response.statusCode} - ${durationMs.toFixed(1)}ms`,
          undefined,
        );
        void id;
      }),
    );
  }
}
