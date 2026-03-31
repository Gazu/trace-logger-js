import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserContextStore, BrowserTraceContextFactory } from './context.js';

interface LoggingProviderProps {
  children: ReactNode;
}

export function LoggingProvider({ children }: LoggingProviderProps) {
  useEffect(() => {
    const existing = BrowserContextStore.get();
    if (!existing) {
      BrowserContextStore.set(BrowserTraceContextFactory.create());
    }
  }, []);

  return <>{children}</>;
}
