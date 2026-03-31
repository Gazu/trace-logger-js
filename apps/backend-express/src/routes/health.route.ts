import { Router } from 'express';
import { NodeLogger, RequestContextStore } from '@smb-tech/logger-node';

const router = Router();
const logger = NodeLogger.get('HealthController');

router.get('/health', (_req, res) => {
  RequestContextStore.setManyMdc({
    operation: 'health-check',
    component: 'api'
  });

  logger.info((event) => {
    event
      .message('Health check executed')
      .tag('health')
      .with('service', 'backend-express')
      .with('status', 'UP');
  });

  RequestContextStore.removeMdc('operation');

  res.status(200).json({
    status: 'UP',
    traceId: RequestContextStore.getMdcValue('traceId')
  });
});

export { router as healthRouter };
