import { NodeLogSink, NodeLogger } from '@smb-tech/logger-node';

if (!NodeLogSink.isInitialized()) {
  NodeLogSink.initialize({
    mode: 'async',
    flushIntervalMs: 10,
    maxQueueSize: 10000
  });
}

export const logger = NodeLogger.get('NextHealthRoute');
