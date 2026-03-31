/* import { BrowserContextStore, BrowserTraceContextFactory } from './context.js';

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!BrowserContextStore.get()) {
    BrowserContextStore.set(BrowserTraceContextFactory.create());
  }

  const mdc = BrowserContextStore.getMdc();
  const headers = new Headers(init?.headers);

   if (mdc.requestId) {
    headers.set('x-request-id', mdc.requestId);
  }

  if (mdc.traceId) {
    headers.set('X-B3-TraceId', mdc.traceId);
  }

  if (mdc.spanId) {
    headers.set('X-B3-SpanId', mdc.spanId);
  }

  return fetch(input, {
    ...init,
    headers
  });
}
 */