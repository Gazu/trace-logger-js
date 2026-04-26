import { RequestContextStore, runWithNodeContext, type NodeContextOptions } from './context.js';

export interface NextTraceOptions extends NodeContextOptions {
  requestIdHeader?: string;
  traceIdHeader?: string;
  spanIdHeader?: string;
  parentSpanIdHeader?: string;
}

const DEFAULT_OPTIONS: Required<Pick<NextTraceOptions, 'requestIdHeader' | 'traceIdHeader' | 'spanIdHeader' | 'parentSpanIdHeader'>> = {
  requestIdHeader: 'x-request-id',
  traceIdHeader: 'x-b3-traceid',
  spanIdHeader: 'x-b3-spanid',
  parentSpanIdHeader: 'x-b3-parentspanid'
};

export function withNextRequestContext<T>(
  request: Request,
  callback: () => T,
  options?: NextTraceOptions
): T {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  return runWithNodeContext(callback, {
    ...options,
    requestId: options?.requestId ?? request.headers.get(resolvedOptions.requestIdHeader) ?? undefined,
    traceId: options?.traceId ?? request.headers.get(resolvedOptions.traceIdHeader) ?? undefined,
    parentSpanId:
      options?.parentSpanId ??
      request.headers.get(resolvedOptions.spanIdHeader) ??
      request.headers.get(resolvedOptions.parentSpanIdHeader) ??
      undefined
  });
}

export function getNextTraceResponseHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  const mdc = RequestContextStore.getMdc();

  return {
    ...(mdc.requestId ? { 'x-request-id': mdc.requestId } : {}),
    ...(mdc.traceId ? { 'x-b3-traceid': mdc.traceId } : {}),
    ...(mdc.spanId ? { 'x-b3-spanid': mdc.spanId } : {}),
    ...(mdc.parentSpanId ? { 'x-b3-parentspanid': mdc.parentSpanId } : {}),
    ...(extra ?? {})
  };
}
