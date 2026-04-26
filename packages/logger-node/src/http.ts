import {
  RequestContextStore,
  TraceContextFactory,
  runWithNodeChildContext,
  type NodeContextOptions,
  type RequestTraceContext
} from './context.js';

export interface NodeHttpRequestOptions extends NodeContextOptions {
  headers?: HeadersInit;
  reuseCurrentContext?: boolean;
}

export function createNodeHttpChildContext(options?: NodeContextOptions): RequestTraceContext {
  const currentMdc = RequestContextStore.getMdc();
  const persistentMdc = RequestContextStore.getPersistentMdc();

  return TraceContextFactory.createChild({
    requestId: options?.requestId ?? currentMdc.requestId,
    traceId: options?.traceId ?? currentMdc.traceId,
    spanId: options?.spanId ?? currentMdc.spanId,
    parentSpanId: options?.parentSpanId,
    mdc: {
      ...persistentMdc,
      ...(options?.mdc ?? {})
    }
  });
}

export function getNodeTraceHeaders(
  context: RequestTraceContext | Record<string, string> = RequestContextStore.getMdc()
): Record<string, string> {
  const mdc = isRequestTraceContext(context) ? context.mdc : context;
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

function isRequestTraceContext(
  value: RequestTraceContext | Record<string, string>
): value is RequestTraceContext {
  return 'mdc' in value;
}

export function applyNodeTraceHeaders(
  headers: Headers,
  context: RequestTraceContext | Record<string, string> = RequestContextStore.getMdc()
): Headers {
  Object.entries(getNodeTraceHeaders(context)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return headers;
}

export function withNodeHttpChildContext<T>(callback: () => T, options?: NodeContextOptions): T {
  return runWithNodeChildContext(callback, options);
}

export async function nodeFetch(
  input: string | URL | Request,
  init?: RequestInit,
  options?: NodeHttpRequestOptions
): Promise<Response> {
  if (options?.reuseCurrentContext) {
    const headers = new Headers(options.headers ?? init?.headers);
    applyNodeTraceHeaders(headers);

    return fetch(input, {
      ...init,
      headers
    });
  }

  return withNodeHttpChildContext(async () => {
    const headers = new Headers(options?.headers ?? init?.headers);
    applyNodeTraceHeaders(headers);

    return fetch(input, {
      ...init,
      headers
    });
  }, options);
}
