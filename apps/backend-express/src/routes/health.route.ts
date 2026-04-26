import { Router } from 'express';
import {
  NodeLogger,
  NodeLogSink,
  RequestContextStore,
  nodeFetch,
  withNodeHttpChildContext
} from '@smb-tech/logger-node';

const router = Router();
const logger = NodeLogger.get('HealthController');
const upstreamHealthUrl = process.env.UPSTREAM_HEALTH_URL ?? 'http://127.0.0.1:3001/health';
const internalMetricsEnabled = process.env.LOGGER_INTERNAL_METRICS_ENABLED?.trim().toLowerCase() === 'true';

router.get('/health', (_req, res) => {
  RequestContextStore.setManyMdc({
    operation: 'health-check',
    component: 'api'
  });

  logger.info((event) => {
    event
      .message('Health check executed')
      .tag('health')
      .with('status', 'UP');
  });

  RequestContextStore.removeMdc('operation');

  res.status(200).json({
    status: 'UP',
    traceId: RequestContextStore.getMdcValue('traceId'),
    spanId: RequestContextStore.getMdcValue('spanId'),
    parentSpanId: RequestContextStore.getMdcValue('parentSpanId')
  });
});

router.get('/health/upstream', async (_req, res, next) => {
  try {
    RequestContextStore.setManyMdc({
      operation: 'health-upstream-check',
      component: 'api'
    });

    const upstreamResult = await withNodeHttpChildContext(async () => {
      logger.info((event) => {
        event
          .message('Calling upstream health endpoint')
          .tag('http')
          .with('url', upstreamHealthUrl)
          .with('traceId', RequestContextStore.getMdcValue('traceId'))
          .with('spanId', RequestContextStore.getMdcValue('spanId'))
          .with('parentSpanId', RequestContextStore.getMdcValue('parentSpanId'));
      });

      const response = await nodeFetch(upstreamHealthUrl, undefined, {
        reuseCurrentContext: true
      });
      const payload = await response.json() as Record<string, unknown>;

      logger.info((event) => {
        event
          .message('Upstream health response received')
          .tag('http')
          .with('statusCode', response.status)
          .with('payload', payload);
      });

      return {
        statusCode: response.status,
        spanId: RequestContextStore.getMdcValue('spanId'),
        parentSpanId: RequestContextStore.getMdcValue('parentSpanId'),
        payload
      };
    }, {
      mdc: {
        dependency: 'backend-next'
      }
    });

    RequestContextStore.removeMdc('operation');

    res.status(200).json({
      status: 'UP',
      traceId: RequestContextStore.getMdcValue('traceId'),
      spanId: RequestContextStore.getMdcValue('spanId'),
      parentSpanId: RequestContextStore.getMdcValue('parentSpanId'),
      upstream: upstreamResult
    });
  } catch (error) {
    next(error);
  }
});

router.get('/internal/logger-metrics', (_req, res) => {
  if (!internalMetricsEnabled) {
    res.status(404).json({ status: 'DISABLED' });
    return;
  }

  res.status(200).json(NodeLogSink.getMetrics());
});

export { router as healthRouter };
