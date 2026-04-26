import type { LogLevel, LogSink } from '@smb-tech/logger-core';

export type LoggerMode = 'sync' | 'async';
export type OverflowStrategy = 'drop' | 'sync-fallback';

export interface LoggerConfig {
  mode: LoggerMode;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  overflowStrategy?: OverflowStrategy;
  shutdownTimeoutMs?: number;
  metricsEnabled?: boolean;
}

export interface NodeLogMetricsSnapshot {
  enabled: boolean;
  mode: LoggerMode;
  overflowStrategy: OverflowStrategy;
  queueSize: number;
  maxQueueSize: number;
  maxObservedQueueSize: number;
  totalDispatched: number;
  totalWritten: number;
  totalQueued: number;
  totalDropped: number;
  totalSyncFallbacks: number;
  totalFlushes: number;
  totalFlushDurationMs: number;
  totalWriteErrors: number;
  lastFlushDurationMs: number;
}

type StreamType = 'stdout' | 'stderr';

interface QueueEntry {
  line: string;
  stream: StreamType;
}

export class NodeLogSink implements LogSink {
  private static initialized = false;
  private static mode: LoggerMode = 'sync';
  private static flushIntervalMs = 10;
  private static maxQueueSize = 10000;
  private static overflowStrategy: OverflowStrategy = 'sync-fallback';
  private static shutdownTimeoutMs = 2000;
  private static metricsEnabled = false;
  private static queue: QueueEntry[] = [];
  private static timer?: NodeJS.Timeout;
  private static flushing = false;
  private static metrics = createInitialMetrics();

  static initialize(config: LoggerConfig): void {
    if (this.initialized) {
      throw new Error('NodeLogSink has already been initialized');
    }

    this.mode = config.mode;
    this.flushIntervalMs = config.flushIntervalMs ?? 10;
    this.maxQueueSize = config.maxQueueSize ?? 10000;
    this.overflowStrategy = config.overflowStrategy ?? 'sync-fallback';
    this.shutdownTimeoutMs = config.shutdownTimeoutMs ?? 2000;
    this.metricsEnabled = config.metricsEnabled ?? false;
    this.metrics = createInitialMetrics({
      enabled: this.metricsEnabled,
      mode: this.mode,
      overflowStrategy: this.overflowStrategy,
      maxQueueSize: this.maxQueueSize
    });

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

  static getMetrics(): NodeLogMetricsSnapshot {
    return {
      ...this.metrics,
      queueSize: this.queue.length
    };
  }

  static async shutdown(options?: { timeoutMs?: number }): Promise<NodeLogMetricsSnapshot> {
    if (!this.initialized) {
      return this.getMetrics();
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    const timeoutMs = options?.timeoutMs ?? this.shutdownTimeoutMs;

    try {
      await Promise.race([
        this.flush(),
        wait(timeoutMs)
      ]);
    } finally {
      this.flushQueueSync();
      this.initialized = false;
    }

    return this.getMetrics();
  }

  dispatch(line: string, level: LogLevel): void {
    if (!NodeLogSink.initialized) {
      throw new Error('NodeLogSink is not initialized');
    }

    const stream: StreamType = level === 'ERROR' || level === 'WARN' ? 'stderr' : 'stdout';
    NodeLogSink.trackMetric('totalDispatched');

    if (NodeLogSink.mode === 'sync') {
      NodeLogSink.safeWrite(line, stream);
      return;
    }

    if (NodeLogSink.queue.length >= NodeLogSink.maxQueueSize) {
      if (NodeLogSink.overflowStrategy === 'drop') {
        NodeLogSink.trackMetric('totalDropped');
        return;
      }

      NodeLogSink.trackMetric('totalSyncFallbacks');
      NodeLogSink.safeWrite(line, stream);
      return;
    }

    NodeLogSink.queue.push({ line, stream });
    NodeLogSink.trackMetric('totalQueued');
    NodeLogSink.updateMaxObservedQueueSize();
  }

  private static async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      return;
    }

    this.flushing = true;
    const startedAt = Date.now();

    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift();
        if (entry) {
          this.safeWrite(entry.line, entry.stream);
        }
      }
    } finally {
      const duration = Date.now() - startedAt;
      this.trackMetric('totalFlushes');
      this.addMetric('totalFlushDurationMs', duration);
      if (this.metricsEnabled) {
        this.metrics.lastFlushDurationMs = duration;
      }
      this.flushing = false;
    }
  }

  private static flushQueueSync(): void {
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        this.safeWrite(entry.line, entry.stream);
      }
    }
  }

  private static safeWrite(line: string, stream: StreamType): void {
    try {
      this.write(line, stream);
      this.trackMetric('totalWritten');
    } catch (_error) {
      this.trackMetric('totalWriteErrors');
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

  private static updateMaxObservedQueueSize(): void {
    if (!this.metricsEnabled) {
      return;
    }

    this.metrics.maxObservedQueueSize = Math.max(
      this.metrics.maxObservedQueueSize,
      this.queue.length
    );
  }

  private static trackMetric(metric: keyof Pick<NodeLogMetricsSnapshot,
    'totalDispatched' |
    'totalWritten' |
    'totalQueued' |
    'totalDropped' |
    'totalSyncFallbacks' |
    'totalFlushes' |
    'totalWriteErrors'
  >): void {
    if (!this.metricsEnabled) {
      return;
    }

    this.metrics[metric] += 1;
  }

  private static addMetric(
    metric: keyof Pick<NodeLogMetricsSnapshot, 'totalFlushDurationMs'>,
    value: number
  ): void {
    if (!this.metricsEnabled) {
      return;
    }

    this.metrics[metric] += value;
  }
}

function createInitialMetrics(
  overrides?: Partial<NodeLogMetricsSnapshot>
): NodeLogMetricsSnapshot {
  return {
    enabled: false,
    mode: 'sync',
    overflowStrategy: 'sync-fallback',
    queueSize: 0,
    maxQueueSize: 10000,
    maxObservedQueueSize: 0,
    totalDispatched: 0,
    totalWritten: 0,
    totalQueued: 0,
    totalDropped: 0,
    totalSyncFallbacks: 0,
    totalFlushes: 0,
    totalFlushDurationMs: 0,
    totalWriteErrors: 0,
    lastFlushDurationMs: 0,
    ...(overrides ?? {})
  };
}

function wait(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}
