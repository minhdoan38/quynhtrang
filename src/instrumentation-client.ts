import { reportUnexpectedError } from './lib/observability/report.ts';

let isRegistered = false;

export function registerClientInstrumentation(): void {
  if (typeof window === 'undefined' || isRegistered) return;
  isRegistered = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    reportUnexpectedError({
      operation: 'client_window_error',
      route: window.location.pathname,
      error: event.error ?? event.message,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportUnexpectedError({
      operation: 'client_unhandled_rejection',
      route: window.location.pathname,
      error: event.reason,
    });
  });
}

if (typeof window !== 'undefined') {
  registerClientInstrumentation();
}
