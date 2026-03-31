import { RequestContextStore, runWithNodeContext } from '@smb-tech/logger-node';
import { logger } from '../../lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const ALLOWED_HEADERS = 'Content-Type, Authorization, x-request-id, X-B3-TraceId, X-B3-SpanId';
const ALLOWED_METHODS = 'GET, OPTIONS';

function buildCorsHeaders(extra?: Record<string, string>) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    ...extra
  };
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders()
  });
}

export async function GET(request: Request): Promise<Response> {
  const incomingTraceId = request.headers.get('x-b3-traceid') ?? undefined;

  return runWithNodeContext(() => {
    logger.info((event) => {
      event
        .message('Health check executed')
        .with('path', '/health')
        .with('method', 'GET')
        .with('runtime', 'next-nodejs');
    });

    const mdc = RequestContextStore.getMdc();

    return new Response(
      JSON.stringify({
        status: 'ok',
        traceId: mdc.traceId
      }),
      {
        status: 200,
        headers: buildCorsHeaders({
          'content-type': 'application/json',
          'x-request-id': mdc.requestId ?? '',
          'x-b3-traceid': mdc.traceId ?? '',
          'x-span-id': mdc.spanId ?? ''
        })
      }
    );
  }, { traceId: incomingTraceId });
}