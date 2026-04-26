import type { NextFunction, Request, Response } from 'express';
import { RequestContextStore, TraceContextFactory } from './context.js';

export interface ExpressTraceMiddlewareOptions {
  requestIdHeader?: string;
  traceIdHeader?: string;
  spanIdHeader?: string;
  parentSpanIdHeader?: string;
}

const DEFAULT_OPTIONS: Required<ExpressTraceMiddlewareOptions> = {
  requestIdHeader: 'x-request-id',
  traceIdHeader: 'x-b3-traceid',
  spanIdHeader: 'x-b3-spanid',
  parentSpanIdHeader: 'x-b3-parentspanid'
};

export function createExpressTraceMiddleware(options?: ExpressTraceMiddlewareOptions) {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  return function expressTraceMiddleware(req: Request, res: Response, next: NextFunction): void {
    const context = TraceContextFactory.createChild({
      requestId: req.header(resolvedOptions.requestIdHeader) ?? undefined,
      traceId: req.header(resolvedOptions.traceIdHeader) ?? undefined,
      parentSpanId:
        req.header(resolvedOptions.spanIdHeader) ??
        req.header(resolvedOptions.parentSpanIdHeader) ??
        undefined
    });

    applyTraceHeadersToNodeResponse(res, context.mdc);
    RequestContextStore.run(context, () => next());
  };
}

export function applyTraceHeadersToNodeResponse(
  response: Pick<Response, 'setHeader'>,
  mdc: Record<string, string>
): void {
  if (mdc.requestId) {
    response.setHeader('x-request-id', mdc.requestId);
  }

  if (mdc.traceId) {
    response.setHeader('X-B3-TraceId', mdc.traceId);
  }

  if (mdc.spanId) {
    response.setHeader('X-B3-SpanId', mdc.spanId);
  }

  if (mdc.parentSpanId) {
    response.setHeader('X-B3-ParentSpanId', mdc.parentSpanId);
  }
}
