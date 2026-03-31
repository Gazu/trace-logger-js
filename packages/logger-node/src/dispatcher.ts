import type { LogLevel, LogSink } from '@smb-tech/logger-core';

export type LoggerMode = 'sync' | 'async';

export interface LoggerConfig {
  mode: LoggerMode;
  flushIntervalMs?: number;
  maxQueueSize?: number;
}

type StreamType = 'stdout' | 'stderr';

export class NodeLogSink implements LogSink {
  private static initialized = false;
  private static mode: LoggerMode = 'sync';
  private static flushIntervalMs = 10;
  private static maxQueueSize = 10000;
  private static queue: Array<{ line: string; stream: StreamType }> = [];
  private static timer?: NodeJS.Timeout;
  private static flushing = false;

  static initialize(config: LoggerConfig): void {
    if (this.initialized) {
      throw new Error('NodeLogSink has already been initialized');
    }

    this.mode = config.mode;
    this.flushIntervalMs = config.flushIntervalMs ?? 10;
    this.maxQueueSize = config.maxQueueSize ?? 10000;

    if (this.mode === 'async') {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);

      this.timer.unref?.();
    }

    this.initialized = true;
  }

  static isInitialized(): boolean {
    return this.initialized;
  }

  static async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.flush();
  }

  dispatch(line: string, level: LogLevel): void {
    if (!NodeLogSink.initialized) {
      throw new Error('NodeLogSink is not initialized');
    }

    const stream: StreamType = level === 'ERROR' || level === 'WARN' ? 'stderr' : 'stdout';

    if (NodeLogSink.mode === 'sync') {
      NodeLogSink.write(line, stream);
      return;
    }

    if (NodeLogSink.queue.length >= NodeLogSink.maxQueueSize) {
      NodeLogSink.write(line, stream);
      return;
    }

    NodeLogSink.queue.push({ line, stream });
  }

  private static async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      return;
    }

    this.flushing = true;

    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift();
        if (entry) {
          this.write(entry.line, entry.stream);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private static write(line: string, stream: StreamType): void {
    const output = `${line}\n`;
    if (stream === 'stderr') {
      process.stderr.write(output);
      return;
    }

    process.stdout.write(output);
  }
}
