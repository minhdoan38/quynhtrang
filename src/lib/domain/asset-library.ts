export type LibraryStatus = 'draft' | 'published' | 'archived';
export type LibraryKind = 'sticker' | 'font-face';
export type FontCategory = 'sans' | 'serif' | 'handwriting' | 'display';
export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';
export type StickerFormat = 'svg' | 'png' | 'jpeg' | 'webp';
export type StaffRole = 'admin' | 'editor';

export type LibraryErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND'
  | 'REVISION_CONFLICT' | 'VALIDATION_FAILED' | 'LICENSE_REQUIRED'
  | 'DUPLICATE_BINARY' | 'IMMUTABLE_BINARY' | 'REFERENCED_DRAFT'
  | 'DEPENDENCY_UNRESOLVED' | 'RENDERER_UNAVAILABLE' | 'STORAGE_FAILURE';

export interface LibraryRef {
  kind: LibraryKind;
  id: string;
  checksum: string;
}

export interface StoredBinary {
  bucket: 'library-drafts' | 'fonts' | 'sticker-library';
  key: string;
  checksum: string;
  byteSize: number;
  mimeType: string;
}

export interface LicenseAcknowledgement {
  source: string;
  name: string;
  text: string;
  webEmbedding: boolean;
  commercialPrint: boolean;
}

export interface LibraryMetadataPatch {
  displayName?: string;
  category?: string;
  tags?: string[];
  searchKeywords?: string[];
  description?: string;
  sampleText?: string;
}

export interface LibraryRecord {
  ref: LibraryRef;
  status: LibraryStatus;
  revision: number;
  everPublishedAt: string | null;
  binary: StoredBinary;
  thumbnail: StoredBinary | null;
  displayName: string;
  category: string;
  tags: string[];
  searchKeywords: string[];
  description: string;
  sampleText: string | null;
  license: LicenseAcknowledgement | null;
  validationId: string | null;
}

export interface FontFaceRecord extends LibraryRecord {
  familyId: string;
  cssFamily: string;
  format: FontFormat;
  weightMin: number;
  weightMax: number;
  style: 'normal' | 'italic';
  internalFamily: string;
  postscriptName: string;
}

export interface ValidationReceipt {
  id: string;
  ref: LibraryRef;
  revision: number;
  validatorVersion: string;
  engineFingerprint: string;
  passed: boolean;
  failures: { code: string; detail: string }[];
  missingCodepoints: number[];
  browserProofHash: string | null;
  productionProofHash: string | null;
}

export interface MutationKey {
  expectedRevision: number;
  requestId: string;
}

export interface BulkItemResult {
  ref: LibraryRef;
  ok: boolean;
  revision?: number;
  error?: LibraryErrorCode;
  message?: string;
}

const LIBRARY_STATUSES: readonly LibraryStatus[] = ['draft', 'published', 'archived'];
const LIBRARY_KINDS: readonly LibraryKind[] = ['sticker', 'font-face'];
const METADATA_KEYS: readonly (keyof LibraryMetadataPatch)[] = [
  'displayName',
  'category',
  'tags',
  'searchKeywords',
  'description',
  'sampleText',
];


function parseBoundedString(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new RangeError(`${field} must be ${minLength}-${maxLength} characters`);
  }
  return trimmed;
}

function parseList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new TypeError(`${field} must contain at most 20 items`);
  }
  return value.map((item) => parseBoundedString(item, `${field} item`, 1, 40));
}

export function parseLibraryMetadata(input: unknown): LibraryMetadataPatch {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Library metadata must be an object');
  }

  const metadata = input as Record<string, unknown>;

  for (const key of Object.keys(metadata)) {
    if (!(METADATA_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Unsupported library metadata field: ${key}`);
    }
  }

  const output: LibraryMetadataPatch = {};
  if (Object.prototype.hasOwnProperty.call(metadata, 'displayName')) {
    output.displayName = parseBoundedString(metadata.displayName, 'displayName', 1, 120);
  }
  if (Object.prototype.hasOwnProperty.call(metadata, 'category')) {
    output.category = parseBoundedString(metadata.category, 'category', 1, 50);
  }
  if (Object.prototype.hasOwnProperty.call(metadata, 'tags')) {
    output.tags = parseList(metadata.tags, 'tags');
  }
  if (Object.prototype.hasOwnProperty.call(metadata, 'searchKeywords')) {
    output.searchKeywords = parseList(metadata.searchKeywords, 'searchKeywords');
  }
  if (Object.prototype.hasOwnProperty.call(metadata, 'description')) {
    output.description = parseBoundedString(metadata.description, 'description', 0, 2000);
  }
  if (Object.prototype.hasOwnProperty.call(metadata, 'sampleText')) {
    output.sampleText = parseBoundedString(metadata.sampleText, 'sampleText', 0, 500);
  }
  return output;
}

export function assertLibraryTransition(from: LibraryStatus, to: LibraryStatus): void {
  if (!(LIBRARY_STATUSES as readonly string[]).includes(from) || !(LIBRARY_STATUSES as readonly string[]).includes(to)) {
    throw new Error(`Invalid library status: ${String(from)} -> ${String(to)}`);
  }
  if (from === to) return;
  const allowed = from === 'draft' && to === 'published'
    || from === 'published' && to === 'archived'
    || from === 'archived' && to === 'published';
  if (!allowed) {
    throw new Error(`Invalid library transition: ${from} -> ${to}`);
  }
}

export function canManageLibrary(role: StaffRole, kind: LibraryKind): boolean {
  return (role === 'admin' || role === 'editor')
    && (LIBRARY_KINDS as readonly string[]).includes(kind);
}

export function canDeleteDraft(
  role: StaffRole,
  status: LibraryStatus,
  everPublishedAt: string | null,
): boolean {
  return role === 'admin' && status === 'draft' && everPublishedAt === null;
}

export function normalizeAssetId(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-');
}
