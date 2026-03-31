import { useMemo, useState } from 'react';
import { BrowserContextStore, BrowserTraceContextFactory, ReactLogger } from '@smb-tech/logger-react';
import { getHealth } from './api/api';

const logger = ReactLogger.get('ReactDemoApp');

export function App() {
  const [responseText, setResponseText] = useState('Sin llamada todavía');
  const currentMdc = useMemo(() => BrowserContextStore.getMdc(), [responseText]);

  const refreshContext = () => {
    const context = BrowserTraceContextFactory.create({
      mdc: {
        screen: 'react-demo'
      }
    });

    BrowserContextStore.set(context);

    logger.info((event) => {
      event
        .message('Browser trace context recreated')
        .tag('react')
        .with('traceId', context.mdc.traceId)
        .with('requestId', context.mdc.requestId);
    });

    setResponseText(`Nuevo contexto generado: ${context.mdc.traceId}`);
  };

  const handleLog = () => {
    BrowserContextStore.setMdc('feature', 'button-click');
    logger.info((event) => {
      event
        .message('User clicked React button')
        .tag('ui')
        .with('component', 'App')
        .with('action', 'log-click');
    });
  };

  const callBackend = async () => {
    try {
      BrowserContextStore.setMdc('flow', 'frontend-to-backend');

      logger.info((event) => {
        event
          .message('Calling backend /health')
          .tag('http')
          .with('url', 'http://localhost:3000/health');
      });

      const response = await getHealth();
      const payload = response;

      logger.info((event) => {
        event
          .message('Backend response received')
          .tag('http')
          .with('statusCode', response.status)
          .with('payload', payload);
      });

      setResponseText(JSON.stringify(payload, null, 2));
    } catch (error) {
      logger.error((event) => {
        event
          .message('Backend call failed')
          .tag('http_error')
          .error(error instanceof Error ? error : new Error('Unknown browser error'));
      });

      setResponseText(String(error));
    }
  };

  return (
    <main style={{ fontFamily: 'Arial, sans-serif', padding: 24, maxWidth: 840, margin: '0 auto' }}>
      <h1>React logger demo</h1>
      <p>Abre la consola del navegador para ver los logs JSON generados por la librería.</p>

      <section style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button onClick={refreshContext}>New browser context</button>
        <button onClick={handleLog}>Log React event</button>
        <button onClick={callBackend}>Call backend /health</button>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>MDC actual</h2>
        <pre>{JSON.stringify(currentMdc, null, 2)}</pre>
      </section>

      <section>
        <h2>Última respuesta</h2>
        <pre>{responseText}</pre>
      </section>
    </main>
  );
}
