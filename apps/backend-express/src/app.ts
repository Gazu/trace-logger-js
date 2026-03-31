import express from 'express';
import { NodeLogger } from '@smb-tech/logger-node';
import { requestTraceMiddleware } from './middleware/express.js'
import { healthRouter } from './routes/health.route.js';

export function createApp() {
  const app = express();
  const logger = NodeLogger.get('HttpServer');

  app.use(express.json());
  app.use(requestTraceMiddleware);

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-request-id, X-B3-TraceId, X-B3-SpanId'
    );
    const startedAt = Date.now();

    res.on('finish', () => {
      logger.info((event) => {
        event
          .message('HTTP request completed')
          .tag('http')
          .with('method', req.method)
          .with('path', req.originalUrl)
          .with('statusCode', res.statusCode)
          .with('durationMs', Date.now() - startedAt);
      });
    });

    next();
  });

  app.use(healthRouter);

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error((event) => {
      event
        .message('Unhandled application error')
        .tag('http_error')
        .error(error);
    });

    res.status(500).json({ status: 'ERROR' });
  });

  return app;
}
