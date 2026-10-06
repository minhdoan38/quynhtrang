import { createOperationId } from '../reliability/operation-id.ts';

export interface DocumentStats {
  elementCount: number;
  schemaVersion: number;
  approximateSize: number;
}

export interface StructuredErrorEvent {
  operation?: string;
  operationId?: string;
  route?: string;
  role?: string;
  productType?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  release?: string;
  error?: unknown;
  document?: unknown;
  [key: string]: unknown;
}

export interface ReportedErrorRecord {
  operation: string;
  operationId: string;
  route?: string;
  role?: string;
  productType?: string;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  release?: string;
  documentStats?: DocumentStats;
}

export type ReliabilityMetricName =
  | 'order_creation_failure'
  | 'autosave_failure'
  | 'payment_confirmation_conflict'
  | 'renderer_failure'
  | 'production_start_failure'
  | 'template_publish_failure'
  | 'commercial_publish_failure'
  | 'unexpected_error';

export interface RecordedMetric {
  metricName: ReliabilityMetricName;
  tags: Record<string, string>;
}

const ALLOWED_METRIC_NAMES: Record<ReliabilityMetricName, true> = {
  order_creation_failure: true,
  autosave_failure: true,
  payment_confirmation_conflict: true,
  renderer_failure: true,
  production_start_failure: true,
  template_publish_failure: true,
  commercial_publish_failure: true,
  unexpected_error: true,
};

const ALLOWED_ROLES: Record<string, true> = {
  customer: true,
  admin: true,
  editor: true,
  system: true,
  guest: true,
};

const SENSITIVE_PATTERN =
  /syntax error|relation\s+"?\w+"?|column\s+"?\w+"?|insert into|select\s+.*from|delete from|update\s+.*set|pg_|42p01|pgrst|postgrest|duplicate key|unique constraint|foreign key|violates\s+\w+|check constraint|null value in column|customer-assets|approved-renders|\/storage\/v1|bearer\s+|service_role|eyJ[a-zA-Z0-9_-]+|\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b|\b0\d{9,10}\b|\b\d{6}\b|x-amz-signature=[^&\s]+|sig=[^&\s]+|token=[^&\s]+|secret|nguyễn trãi|hà nội|\bat\s+.*:\d+:\d+|c:\\|\/home\/|\/app\//i;

function cleanString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed || SENSITIVE_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function extractDocumentStats(doc: unknown): DocumentStats | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const obj = doc as Record<string, unknown>;
  const elements = Array.isArray(obj.elements) ? obj.elements : [];
  const schemaVersion =
    typeof obj.documentSchemaVersion === 'number'
      ? obj.documentSchemaVersion
      : typeof obj.schemaVersion === 'number'
        ? obj.schemaVersion
        : 1;

  let approximateSize = 0;
  try {
    approximateSize = JSON.stringify(doc).length;
  } catch {
    approximateSize = 0;
  }

  return {
    elementCount: elements.length,
    schemaVersion,
    approximateSize,
  };
}

export function reportUnexpectedError(event: StructuredErrorEvent): ReportedErrorRecord {
  const operation = cleanString(event.operation) || 'unexpected_operation';
  const operationId = cleanString(event.operationId) || createOperationId(operation);
  const rawRoute = typeof event.route === 'string' ? event.route.split('?')[0].trim() : undefined;
  const route = rawRoute && !SENSITIVE_PATTERN.test(rawRoute) ? rawRoute : undefined;
  const role = cleanString(event.role);
  const productType = cleanString(event.productType);
  const errorCode = cleanString(event.errorCode);
  const release = cleanString(event.release) || process.env.NEXT_PUBLIC_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;

  let status: number | undefined;
  if (typeof event.status === 'number' && Number.isInteger(event.status) && event.status >= 100 && event.status <= 599) {
    status = event.status;
  }

  let durationMs: number | undefined;
  if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) && event.durationMs >= 0) {
    durationMs = Math.round(event.durationMs);
  }

  const documentStats = event.document ? extractDocumentStats(event.document) : undefined;

  const record: ReportedErrorRecord = {
    operation,
    operationId,
    ...(route ? { route } : {}),
    ...(role ? { role } : {}),
    ...(productType ? { productType } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(release ? { release } : {}),
    ...(documentStats ? { documentStats } : {}),
  };

  try {
    // ponytail: provider-neutral console sink; OpenTelemetry exporter attaches here
    console.error(`[observability:error] ${JSON.stringify(record)}`);
  } catch {
    // Non-throwing guarantee
  }

  return record;
}

export function recordReliabilityMetric(
  metricName: string,
  rawTags?: Record<string, unknown>,
): RecordedMetric {
  const validName: ReliabilityMetricName =
    metricName in ALLOWED_METRIC_NAMES
      ? (metricName as ReliabilityMetricName)
      : 'unexpected_error';

  const tags: Record<string, string> = {};
  if (rawTags && typeof rawTags === 'object') {
    if (typeof rawTags.role === 'string' && ALLOWED_ROLES[rawTags.role]) {
      tags.role = rawTags.role;
    }

    if (typeof rawTags.status === 'number') {
      if (rawTags.status >= 500) tags.status = '5xx';
      else if (rawTags.status >= 400) tags.status = '4xx';
      else tags.status = `${rawTags.status}`;
    } else if (typeof rawTags.status === 'string' && /^(4xx|5xx|\d{3})$/.test(rawTags.status)) {
      tags.status = rawTags.status;
    }

    if (typeof rawTags.errorCode === 'string' && /^[A-Z0-9_]{3,40}$/.test(rawTags.errorCode)) {
      tags.errorCode = rawTags.errorCode;
    }
  }

  const metric: RecordedMetric = {
    metricName: validName,
    tags,
  };

  try {
    // ponytail: structured metric emission
    console.info(`[observability:metric] ${JSON.stringify(metric)}`);
  } catch {
    // Non-throwing guarantee
  }

  return metric;
}
