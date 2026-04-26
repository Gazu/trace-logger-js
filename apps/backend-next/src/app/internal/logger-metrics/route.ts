import { NodeLogSink } from '@smb-tech/logger-node';
import '../../../lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const enabled = process.env.LOGGER_INTERNAL_METRICS_ENABLED?.trim().toLowerCase() === 'true';

  if (!enabled) {
    return new Response(JSON.stringify({ status: 'DISABLED' }), {
      status: 404,
      headers: {
        'content-type': 'application/json'
      }
    });
  }

  return new Response(JSON.stringify(NodeLogSink.getMetrics()), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}
