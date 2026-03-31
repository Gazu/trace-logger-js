import { createApp } from './app.js';
import { NodeLogger, NodeLogSink } from '@smb-tech/logger-node';

NodeLogSink.initialize({
  mode: 'async',
  flushIntervalMs: 10,
  maxQueueSize: 10000
});

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
const logger = NodeLogger.get('Bootstrap');

const server = app.listen(port, () => {
  logger.info((event) => {
    event
      .message('Server started')
      .with('port', port)
      .with('environment', process.env.NODE_ENV ?? 'development');
  });
});

let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  server.close(async () => {
    await NodeLogSink.shutdown();
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
