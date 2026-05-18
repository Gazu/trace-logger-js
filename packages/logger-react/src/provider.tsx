import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { LoggerConfiguration } from '@smb-tech/logger-core';
import { BrowserContextStore, BrowserTraceContextFactory } from './context.js';

interface LoggingProviderProps {
  children: ReactNode;
  level?: string;
  timezone?: string;
  sensitiveKeys?: string[];
}

export function LoggingProvider({
  children,
  level,
  timezone,
  sensitiveKeys
}: LoggingProviderProps) {
  useEffect(() => {
    LoggerConfiguration.configure({
      level,
      timezone,
      sensitiveKeys
    });

    const existing = BrowserContextStore.get();
    if (!existing) {
      BrowserContextStore.set(BrowserTraceContextFactory.create());
    }
  }, []);

  return <>{children}</>;
}
