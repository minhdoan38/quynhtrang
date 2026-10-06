const SUPPORT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createOperationId(prefix = 'op'): string {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'op';
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const base64Url = typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64url')
    : btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${safePrefix}_${base64Url}`;
}

export function createSupportCode(operationId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < operationId.length; i++) {
    hash ^= operationId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let value = Math.abs(hash >>> 0);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += SUPPORT_ALPHABET[value % SUPPORT_ALPHABET.length];
    value = Math.floor(value / SUPPORT_ALPHABET.length);
  }

  return code;
}
