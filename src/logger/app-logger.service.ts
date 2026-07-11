import { Injectable, LoggerService, Scope } from '@nestjs/common';

/**
 * Custom logger implementing Nest's LoggerService interface. Nest lets you
 * swap the built-in console logger for any class shaped like this one via
 * `app.useLogger()`; using our own class (instead of the default Logger)
 * means every log line is centralized here, so swapping the transport later
 * (e.g. to ship logs to Datadog/CloudWatch) touches one file, not every
 * `new Logger()` call in the codebase.
 *
 * Scope.TRANSIENT gives every injecting class its own instance with its own
 * `context` (normally the class name), so log lines are traceable to their
 * source without manually passing a context string on every call.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: unknown, context?: string) {
    this.write('LOG', message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write('ERROR', message, context);
    if (trace) {
      console.error(trace);
    }
  }

  warn(message: unknown, context?: string) {
    this.write('WARN', message, context);
  }

  debug(message: unknown, context?: string) {
    if (process.env.NODE_ENV === 'production') return;
    this.write('DEBUG', message, context);
  }

  verbose(message: unknown, context?: string) {
    if (process.env.NODE_ENV === 'production') return;
    this.write('VERBOSE', message, context);
  }

  /** Dedicated channel for auth-related events (login, logout, lockouts, etc.). */
  auth(message: string, meta?: Record<string, unknown>) {
    this.write('AUTH', message, this.context, this.sanitize(meta));
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    meta?: Record<string, unknown>,
  ) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context ?? 'Application',
      message,
      ...(meta ? { meta } : {}),
    };
    console.log(JSON.stringify(payload));
  }

  /** Strips fields that must never reach logs, even if a caller passes them by mistake. */
  private sanitize(
    meta?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!meta) return meta;
    const sensitiveKeys = [
      'password',
      'newPassword',
      'oldPassword',
      'refreshToken',
      'accessToken',
      'token',
    ];
    const clean = { ...meta };
    for (const key of sensitiveKeys) {
      if (key in clean) clean[key] = '[REDACTED]';
    }
    return clean;
  }
}
