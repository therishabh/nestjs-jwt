import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface RequestWithId extends Request {
  id: string;
}

/**
 * Assigns every incoming request a unique ID, echoed back as `X-Request-Id`.
 * This is what lets a client-reported bug ("call failed at 10:32") be traced
 * to one exact log line across the logging interceptor and exception filter,
 * instead of grepping timestamps in a pile of concurrent request logs.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  }
}
