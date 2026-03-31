import { Logger } from '@smb-tech/logger-core';
import type { LogLevel, LogSink, RuntimeDetailsProvider } from '@smb-tech/logger-core';
import { BrowserContextStore } from './context.js';

class BrowserLogSink implements LogSink {
  dispatch(line: string, level: LogLevel): void {
    if (level === 'ERROR' || level === 'WARN') {
      console.error(line);
      return;
    }

    console.log(line);
  }
}

class BrowserRuntimeDetailsProvider implements RuntimeDetailsProvider {
  getThreadLabel(): string {
    return 'browser-main-thread';
  }

  fallbackId(): string {
    return crypto.randomUUID();
  }
}

const sink = new BrowserLogSink();
const runtimeDetailsProvider = new BrowserRuntimeDetailsProvider();

export class ReactLogger {
  static get(contextName: string): Logger {
    return new Logger(
      contextName,
      {
        getMdc: () => BrowserContextStore.getMdc()
      },
      sink,
      runtimeDetailsProvider
    );
  }
}
