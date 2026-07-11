import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const PROHIBITED_KEY_PATTERN = /^\$|\./;

/**
 * Prevents NoSQL injection: without this, a client body like
 * `{ "email": { "$gt": "" } }` would pass straight through to Mongoose and
 * be interpreted as a query operator, not a literal value. The npm package
 * `express-mongo-sanitize` does the same job but reassigns `req.query`
 * wholesale, which throws under Express 5 (used by Nest 11) because
 * `req.query` there is a getter-only accessor — so this mutates objects
 * in place instead of replacing them.
 */
@Injectable()
export class MongoSanitizeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    sanitizeInPlace(req.body);
    sanitizeInPlace(req.params);
    sanitizeInPlace(req.query);
    next();
  }
}

function sanitizeInPlace(value: unknown): void {
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (PROHIBITED_KEY_PATTERN.test(key)) {
      delete record[key];
      continue;
    }
    sanitizeInPlace(record[key]);
  }
}
