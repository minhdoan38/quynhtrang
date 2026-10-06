import { reportUnexpectedError } from './lib/observability/report.ts';

export interface InstrumentationRequest {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface InstrumentationContext {
  routerKind: 'Pages Router' | 'App Router';
  routePath: string;
  routeType: 'render' | 'route' | 'action' | 'proxy';
  renderSource?:
  | 'react-server-components'
  | 'react-server-components-payload'
  | 'server-rendering';
  revalidateReason?: 'on-demand' | 'stale';
  renderType?: 'dynamic' | 'dynamic-resume';
}

export async function register(): Promise<void> {
  // Provider-neutral server instrumentation initialization
}

export async function onRequestError(
  error: unknown,
  request: InstrumentationRequest,
  context: InstrumentationContext,
): Promise<void> {
  let digest: string | undefined;
  if (typeof error === 'object' && error !== null && 'digest' in error) {
    const rawDigest = error.digest;
    if (typeof rawDigest === 'string' || typeof rawDigest === 'number') {
      digest = String(rawDigest);
    }
  }

  const rawOpId =
    request.headers?.['x-operation-id'] ||
    request.headers?.['x-request-id'] ||
    digest;

  const operationId = typeof rawOpId === 'string' ? rawOpId : undefined;

  reportUnexpectedError({
    operation: `server_${context.routeType || 'request'}`,
    operationId,
    route: request.path,
    errorCode: digest ? 'DIGEST_ERROR' : undefined,
    status: 500,
    error,
  });
}
