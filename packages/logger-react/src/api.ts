import {
  BrowserContextStore,
  BrowserTraceContextFactory,
  type BrowserContextOptions,
  type BrowserTraceContext
} from './context.js';

export type BrowserHttpTraceMode = 'root' | 'child' | 'reuse';

export interface BrowserHttpRequestOptions extends BrowserContextOptions {
  mode?: BrowserHttpTraceMode;
}

export function startHttpExecutionContext(options?: BrowserContextOptions): BrowserTraceContext {
  const context = BrowserTraceContextFactory.createExecution(options);
  BrowserContextStore.set(context);
  return context;
}

export function startHttpChildExecutionContext(options?: BrowserContextOptions): BrowserTraceContext {
  const context = BrowserTraceContextFactory.createChildExecution(options);
  BrowserContextStore.set(context);
  return context;
}

export function getTraceHeaders(context?: BrowserTraceContext): Record<string, string> {
  const mdc = context?.mdc ?? BrowserContextStore.getMdc();
  const headers: Record<string, string> = {};

  if (mdc.requestId) {
    headers['x-request-id'] = mdc.requestId;
  }

  if (mdc.traceId) {
    headers['X-B3-TraceId'] = mdc.traceId;
  }

  if (mdc.spanId) {
    headers['X-B3-SpanId'] = mdc.spanId;
  }

  if (mdc.parentSpanId) {
    headers['X-B3-ParentSpanId'] = mdc.parentSpanId;
  }

  return headers;
}

export function resolveBrowserHttpContext(
  options?: BrowserHttpRequestOptions
): BrowserTraceContext {
  const mode = options?.mode ?? 'root';

  if (mode === 'reuse') {
    return BrowserContextStore.get() ?? startHttpExecutionContext(options);
  }

  if (mode === 'child') {
    return startHttpChildExecutionContext(options);
  }

  return startHttpExecutionContext(options);
}

export function applyBrowserTraceHeaders(
  headers: Headers,
  context?: BrowserTraceContext
): Headers {
  Object.entries(getTraceHeaders(context)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return headers;
}

export function prepareTraceRequestInit(
  init?: RequestInit,
  options?: BrowserHttpRequestOptions
): { context: BrowserTraceContext; init: RequestInit } {
  const context = resolveBrowserHttpContext(options);
  const headers = new Headers(init?.headers);

  applyBrowserTraceHeaders(headers, context);

  return {
    context,
    init: {
      ...init,
      headers
    }
  };
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: BrowserHttpRequestOptions
): Promise<Response> {
  const request = prepareTraceRequestInit(init, options);

  return fetch(input, {
    ...request.init
  });
}
