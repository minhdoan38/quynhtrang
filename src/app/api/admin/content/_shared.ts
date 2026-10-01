import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server.js';

import {
  AuthorizationError,
  requireStaff as authorizeStaff,
} from '../../../../lib/admin/authorization.ts';
import {
  parseLibraryMetadata,
  type LibraryKind,
  type LibraryMetadataPatch,
  type LibraryStatus,
  type MutationKey,
} from '../../../../lib/domain/asset-library.ts';
import type { StaffIdentity } from '../../../../lib/domain/order.ts';
import { AssetLibraryRepository } from '../../../../lib/repositories/asset-library-repository.ts';
import { LibraryServiceError } from '../../../../lib/services/asset-library.ts';
import { createPrivilegedSupabaseClient } from '../../../../lib/supabase/admin.ts';
import { createServerSupabaseClient } from '../../../../lib/supabase/server.ts';

export type { LibraryKind, LibraryMetadataPatch, LibraryStatus, MutationKey };
export interface LibraryRouteDependencies {
  requireStaff?: (request: Request, requiredRole?: 'admin' | 'editor') => Promise<StaffIdentity>;
  createRepository?: () => Promise<AssetLibraryRepository> | AssetLibraryRepository;
  createPrivilegedRepository?: () => Promise<AssetLibraryRepository> | AssetLibraryRepository;
}

export class InvalidRouteInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRouteInput';
  }
}

const serviceStatuses: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  DUPLICATE_BINARY: 409,
  IMMUTABLE_BINARY: 409,
  VALIDATION_FAILED: 422,
  LICENSE_REQUIRED: 422,
  REFERENCED_DRAFT: 409,
  DEPENDENCY_UNRESOLVED: 422,
  RENDERER_UNAVAILABLE: 422,
  STORAGE_FAILURE: 500,
};

export async function getStaffContext(
  request: Request,
  dependencies: LibraryRouteDependencies = {},
  requiredRole?: 'admin' | 'editor',
): Promise<{ staff: StaffIdentity; repo: AssetLibraryRepository }> {
  const staff = await (dependencies.requireStaff ?? authorizeStaff)(request, requiredRole);
  const repo = dependencies.createRepository
    ? await dependencies.createRepository()
    : new AssetLibraryRepository(await createServerSupabaseClient());
  return { staff, repo };
}

export async function getPrivilegedRepository(
  dependencies: LibraryRouteDependencies = {},
): Promise<AssetLibraryRepository> {
  if (dependencies.createPrivilegedRepository) return dependencies.createPrivilegedRepository();
  return new AssetLibraryRepository(createPrivilegedSupabaseClient());
}

export function routeError(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: error.message, code: error.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' },
      { status: error.status },
    );
  }
  if (error instanceof LibraryServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: serviceStatuses[error.code] ?? 500 },
    );
  }
  if (
    error instanceof InvalidRouteInput
    || error instanceof SyntaxError
    || error instanceof TypeError
    || error instanceof RangeError
  ) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json(
      { error: message, code: 'INVALID_INPUT' },
      { status: 400 },
    );
  }
  console.error('Asset library route failed', error);
  return NextResponse.json(
    { error: 'Asset library request failed', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidRouteInput('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

export function parseMutationKey(input: Record<string, unknown>): MutationKey {
  const expectedRevision = typeof input.expectedRevision === 'string'
    ? Number(input.expectedRevision)
    : input.expectedRevision;
  if (!Number.isInteger(expectedRevision) || (expectedRevision as number) < 0) {
    throw new InvalidRouteInput('expectedRevision must be a non-negative integer');
  }
  const requestId = input.requestId === undefined ? randomUUID() : input.requestId;
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    throw new InvalidRouteInput('requestId must be a non-empty string');
  }
  return { expectedRevision: expectedRevision as number, requestId: requestId.trim() };
}

export function parseMetadata(input: unknown): LibraryMetadataPatch {
  try {
    return parseLibraryMetadata(input ?? {});
  } catch (error) {
    throw new InvalidRouteInput(error instanceof Error ? error.message : 'Invalid metadata');
  }
}

export function parseMetadataForm(formData: FormData): LibraryMetadataPatch {
  const encoded = formData.get('metadata');
  if (encoded !== null) {
    if (typeof encoded !== 'string') throw new InvalidRouteInput('metadata must be JSON text');
    return parseMetadata(JSON.parse(encoded));
  }
  const metadata: Record<string, unknown> = {};
  for (const key of ['displayName', 'category', 'description', 'sampleText']) {
    const value = formData.get(key);
    if (typeof value === 'string') metadata[key] = value;
  }
  for (const key of ['tags', 'searchKeywords']) {
    const values = formData.getAll(key).filter((value): value is string => typeof value === 'string');
    if (values.length > 0) {
      metadata[key] = values.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
    }
  }
  return parseMetadata(metadata);
}

export function requireFile(formData: FormData): File {
  const file = formData.get('file');
  if (!(file instanceof File)) throw new InvalidRouteInput('file is required');
  if (file.size === 0) throw new InvalidRouteInput('file must not be empty');
  return file;
}

export function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseListQuery(request: Request): {
  status?: LibraryStatus;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} {
  const params = new URL(request.url).searchParams;
  const status = params.get('status');
  if (status && status !== 'draft' && status !== 'published' && status !== 'archived') {
    throw new InvalidRouteInput('status must be draft, published, or archived');
  }
  const parsePositive = (name: string): number | undefined => {
    const raw = params.get(name);
    if (raw === null) return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) throw new InvalidRouteInput(`${name} must be a positive integer`);
    return value;
  };
  return {
    ...(status ? { status: status as LibraryStatus } : {}),
    ...(params.get('category') ? { category: params.get('category')!.trim() } : {}),
    ...(params.get('search') ? { search: params.get('search')!.trim() } : {}),
    ...(parsePositive('page') ? { page: parsePositive('page') } : {}),
    ...(parsePositive('pageSize') ? { pageSize: parsePositive('pageSize') } : {}),
  };
}

export function ref(kind: LibraryKind, id: string) {
  if (!id.trim()) throw new InvalidRouteInput('Asset id is required');
  return { kind, id, checksum: '' } as const;
}

export function binaryResponse(bytes: Uint8Array, headers: HeadersInit): Response {
  return new Response(bytes as BodyInit, { status: 200, headers });
}
