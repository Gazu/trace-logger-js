import { BrowserContextStore } from '@smb-tech/logger-react';

export function getTraceHeaders(): Record<string, string> {
  const mdc = BrowserContextStore.getMdc();

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

  return headers;
}