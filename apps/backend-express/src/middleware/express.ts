import type { NextFunction, Request, Response } from 'express';
import { RequestContextStore, TraceContextFactory } from '@smb-tech/logger-node';

export function requestTraceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingTraceId = req.header('X-B3-TraceId') ?? undefined;
  const context = TraceContextFactory.create({ traceId: incomingTraceId });

  res.setHeader('x-request-id', context.mdc.requestId);
  res.setHeader('X-B3-TraceId', context.mdc.traceId);
  res.setHeader('X-B3-SpanId', context.mdc.spanId);

  RequestContextStore.run(context, () => next());
}
