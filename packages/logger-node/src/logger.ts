import os from 'node:os';
import { Logger } from '@smb-tech/logger-core';
import type { RuntimeDetailsProvider } from '@smb-tech/logger-core';
import { RequestContextStore } from './context.js';
import { NodeLogSink } from './dispatcher.js';

class NodeRuntimeDetailsProvider implements RuntimeDetailsProvider {
  getThreadLabel(): string {
    return `pid-${process.pid}@${os.hostname()}`;
  }

  fallbackId(): string {
    return Math.random().toString(16).slice(2, 18).padEnd(16, '0');
  }
}

const runtimeDetailsProvider = new NodeRuntimeDetailsProvider();
const sink = new NodeLogSink();

export class NodeLogger {
  static get(contextName: string): Logger {
    return new Logger(
      contextName,
      {
        getMdc: () => RequestContextStore.getMdc()
      },
      sink,
      runtimeDetailsProvider
    );
  }
}
