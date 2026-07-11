import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { AppLogger } from '../../logger/app-logger.service';
import { ApiErrorResponse } from '../interfaces/api-response.interface';
import { RequestWithId } from '../middlewares/request-id.middleware';

/**
 * Catches every exception thrown anywhere in the request pipeline (`@Catch()`
 * with no argument matches everything) and turns it into the project's
 * standard error envelope: `{ success: false, message, errors }`. Without
 * this, an unhandled Mongoose error or a stray bug would leak a raw stack
 * trace / Express default error page to the client — this filter is the
 * single place where "internal error" is translated into something safe to
 * show, and the full detail still goes to the logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & RequestWithId>();

    const { status, message, errors } = this.resolve(exception);

    this.logger.error(
      `${request.method} ${request.originalUrl} -> ${status}: ${message} [requestId=${request.id}]`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: ApiErrorResponse = { success: false, message, errors };
    response.status(status).json(body);
  }

  /**
   * Maps any thrown value to an HTTP status + client-safe message/errors.
   * Handles, in order: Nest's `HttpException` (including class-validator's
   * array-of-messages shape from the `ValidationPipe`), raw Mongoose
   * validation/cast errors (in case one escapes a service un-wrapped), a
   * MongoDB duplicate-key error (code 11000), and finally an opaque 500 for
   * anything else — never surfacing an unrecognized error's own message,
   * since it wasn't written with an end user in mind.
   */
  private resolve(exception: unknown): {
    status: number;
    message: string;
    errors: string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, message: payload, errors: [payload] };
      }

      const payloadObj = payload as {
        message?: string | string[];
        error?: string;
      };
      const messages = Array.isArray(payloadObj.message)
        ? payloadObj.message
        : [payloadObj.message ?? exception.message];

      return {
        status,
        message: Array.isArray(payloadObj.message)
          ? (payloadObj.error ?? 'Validation failed')
          : messages[0],
        errors: messages,
      };
    }

    if (exception instanceof MongooseError.ValidationError) {
      const errors = Object.values(exception.errors).map((e) => e.message);
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors,
      };
    }

    if (exception instanceof MongooseError.CastError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid identifier supplied',
        errors: ['Invalid identifier supplied'],
      };
    }

    if (this.isDuplicateKeyError(exception)) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'Duplicate value violates a unique constraint',
        errors: ['Duplicate value violates a unique constraint'],
      };
    }

    // Anything unrecognized is a bug, not user error — never echo its
    // message to the client; only the logs (above) get the detail.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errors: ['Internal server error'],
    };
  }

  private isDuplicateKeyError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      (exception as { code?: number }).code === 11000
    );
  }
}
