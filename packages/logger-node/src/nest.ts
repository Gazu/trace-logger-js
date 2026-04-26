import type { NextFunction, Request, Response } from 'express';
import { RequestContextStore, TraceContextFactory, type NodeContextOptions } from './context.js';
import { applyTraceHeadersToNodeResponse } from './express.js';

export interface NestTraceOptions extends NodeContextOptions {
  requestIdHeader?: string;
  traceIdHeader?: string;
  spanIdHeader?: string;
  parentSpanIdHeader?: string;
}

interface NestExecutionContextLike {
  switchToHttp(): {
    getRequest<T = unknown>(): T;
    getResponse<T = unknown>(): T;
  };
}

interface NestCallHandlerLike<T = unknown> {
  handle(): T;
}

const DEFAULT_OPTIONS: Required<Pick<NestTraceOptions, 'requestIdHeader' | 'traceIdHeader' | 'spanIdHeader' | 'parentSpanIdHeader'>> = {
  requestIdHeader: 'x-request-id',
  traceIdHeader: 'x-b3-traceid',
  spanIdHeader: 'x-b3-spanid',
  parentSpanIdHeader: 'x-b3-parentspanid'
};

export function createNestTraceMiddleware(options?: NestTraceOptions) {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  return function nestTraceMiddleware(req: Request, res: Response, next: NextFunction): void {
    const context = createNestRequestContext(req, resolvedOptions);
    applyTraceHeadersToNodeResponse(res, context.mdc);
    RequestContextStore.run(context, () => next());
  };
}

export function createNestTraceInterceptor(options?: NestTraceOptions) {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  return {
    intercept(context: NestExecutionContextLike, next: NestCallHandlerLike): unknown {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();
      const traceContext = createNestRequestContext(req, resolvedOptions);

      if (res) {
        applyTraceHeadersToNodeResponse(res, traceContext.mdc);
      }

      return RequestContextStore.run(traceContext, () => next.handle());
    }
  };
}

function createNestRequestContext(
  req: Request,
  options: Required<Pick<NestTraceOptions, 'requestIdHeader' | 'traceIdHeader' | 'spanIdHeader' | 'parentSpanIdHeader'>>
) {
  return TraceContextFactory.createChild({
    requestId: readHeader(req, options.requestIdHeader),
    traceId: readHeader(req, options.traceIdHeader),
    parentSpanId:
      readHeader(req, options.spanIdHeader) ??
      readHeader(req, options.parentSpanIdHeader)
  });
}

function readHeader(req: Request, headerName: string): string | undefined {
  const header = req.header?.(headerName) ?? req.headers?.[headerName.toLowerCase()];

  if (Array.isArray(header)) {
    return header[0];
  }

  return typeof header === 'string' ? header : undefined;
}
