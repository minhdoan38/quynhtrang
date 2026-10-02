import { createHash } from 'node:crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as fontkit from 'fontkit';
import sharp from 'sharp';

import type { FontFormat, StickerFormat } from '../domain/asset-library.ts';

export interface ValidatedSticker {
  canonicalBytes: Uint8Array;
  format: StickerFormat;
  width: number;
  height: number;
  checksum: string;
  thumbnailBytes: Uint8Array;
}

export interface ValidatedFont {
  format: FontFormat;
  familyName: string;
  postscriptName: string;
  weightMin: number;
  weightMax: number;
  style: 'normal' | 'italic';
  checksum: string;
  glyphCount: number;
  unitsPerEm: number;
  missingCodepoints: number[];
  embeddingRestricted: boolean;
}

const MAX_FONT_BYTES = 10 * 1024 * 1024;
const MAX_RASTER_BYTES = 10 * 1024 * 1024;
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_DECOMPRESSION_PIXELS = 40_000_000;
const MAX_RASTER_DIMENSION = 8192;
const THUMBNAIL_SIZE = 320;

const ALLOWED_SVG_ELEMENTS: Record<string, true> = {
  svg: true,
  g: true,
  path: true,
  rect: true,
  circle: true,
  ellipse: true,
  line: true,
  polyline: true,
  polygon: true,
  defs: true,
  lineargradient: true,
  radialgradient: true,
  stop: true,
  clippath: true,
  mask: true,
  use: true,
};

const ALLOWED_SVG_ATTRIBUTES: Record<string, true> = {
  viewbox: true,
  width: true,
  height: true,
  xmlns: true,
  'xmlns:xlink': true,
  d: true,
  fill: true,
  stroke: true,
  'stroke-width': true,
  'stroke-linecap': true,
  'stroke-linejoin': true,
  'stroke-miterlimit': true,
  'stroke-dasharray': true,
  'stroke-dashoffset': true,
  opacity: true,
  'fill-opacity': true,
  'stroke-opacity': true,
  transform: true,
  id: true,
  gradientunits: true,
  gradienttransform: true,
  x: true,
  y: true,
  rx: true,
  ry: true,
  x1: true,
  y1: true,
  x2: true,
  y2: true,
  cx: true,
  cy: true,
  r: true,
  fx: true,
  fy: true,
  offset: true,
  'stop-color': true,
  'stop-opacity': true,
  'clip-path': true,
  mask: true,
  style: true,
  href: true,
  'xlink:href': true,
  points: true,
};

const ALLOWED_NAMESPACES: Record<string, true> = {
  'http://www.w3.org/2000/svg': true,
  'http://www.w3.org/1999/xlink': true,
  'http://www.w3.org/xml/1998/namespace': true,
};

const VIETNAMESE_CODEPOINTS: readonly number[] = [
  // Lowercase vowels with tone marks
  0x0061, 0x00e0, 0x00e1, 0x1ea3, 0x00e3, 0x1ea1,
  0x0103, 0x1eb1, 0x1eaf, 0x1eb3, 0x1eb5, 0x1eb7,
  0x00e2, 0x1ea7, 0x1ea5, 0x1ea9, 0x1eab, 0x1ead,
  0x0065, 0x00e8, 0x00e9, 0x1ebb, 0x1ebd, 0x1eb9,
  0x00ea, 0x1ec1, 0x1ebf, 0x1ec3, 0x1ec5, 0x1ec7,
  0x0069, 0x00ec, 0x00ed, 0x1ec9, 0x0129, 0x1ecb,
  0x006f, 0x00f2, 0x00f3, 0x1ecf, 0x00f5, 0x1ecd,
  0x00f4, 0x1ed3, 0x1ed1, 0x1ed5, 0x1ed7, 0x1ed9,
  0x01a1, 0x1edd, 0x1edb, 0x1edf, 0x1ee1, 0x1ee3,
  0x0075, 0x00f9, 0x00fa, 0x1ee7, 0x0169, 0x1ee5,
  0x01b0, 0x1eeb, 0x1ee9, 0x1eed, 0x1eef, 0x1ef1,
  0x0079, 0x1ef3, 0x00fd, 0x1ef7, 0x1ef9, 0x1ef5,
  0x0064, 0x0111,
  // Uppercase vowels with tone marks
  0x0041, 0x00c0, 0x00c1, 0x1ea2, 0x00c3, 0x1ea0,
  0x0102, 0x1eb0, 0x1eae, 0x1eb2, 0x1eb4, 0x1eb6,
  0x00c2, 0x1ea6, 0x1ea4, 0x1ea8, 0x1eaa, 0x1eac,
  0x0045, 0x00c8, 0x00c9, 0x1eba, 0x1ebc, 0x1eb8,
  0x00ca, 0x1ec0, 0x1ebe, 0x1ec2, 0x1ec4, 0x1ec6,
  0x0049, 0x00cc, 0x00cd, 0x1ec8, 0x0128, 0x1eca,
  0x004f, 0x00d2, 0x00d3, 0x1ece, 0x00d5, 0x1ecc,
  0x00d4, 0x1ed2, 0x1ed0, 0x1ed4, 0x1ed6, 0x1ed8,
  0x01a0, 0x1edc, 0x1eda, 0x1ede, 0x1ee0, 0x1ee2,
  0x0055, 0x00d9, 0x00da, 0x1ee6, 0x0168, 0x1ee4,
  0x01af, 0x1eea, 0x1ee8, 0x1eec, 0x1eee, 0x1ef0,
  0x0059, 0x1ef2, 0x00dd, 0x1ef6, 0x1ef8, 0x1ef4,
  0x0044, 0x0110,
];

function isLikelySvg(bytes: Uint8Array): boolean {
  const prefix = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512)))
    .toString('utf8')
    .trimStart();
  return prefix.startsWith('<svg') || prefix.startsWith('<?xml') || prefix.startsWith('<!DOCTYPE');
}

function parseFontFormat(bytes: Uint8Array, filename?: string): FontFormat {
  if (bytes.length < 4) {
    throw new Error('Font binary too small: invalid font header');
  }
  const tag = Buffer.from(bytes.subarray(0, 4)).toString('ascii');
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];

  if (tag === 'ttcf' || tag === 'FFIL' || tag === 'LWFN') {
    throw new Error('Font collections and suitcases are not supported');
  }
  if (tag === 'OTTO') return 'otf';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'wOF2') return 'woff2';
  if ((b0 === 0 && b1 === 1 && b2 === 0 && b3 === 0) || tag === 'true') {
    if (filename && /\.otf$/i.test(filename)) return 'otf';
    return 'ttf';
  }
  throw new Error(`Unsupported or invalid font format signature: "${tag}"`);
}

export async function validateFont(bytes: Uint8Array, filename?: string): Promise<ValidatedFont> {
  if (bytes.length > MAX_FONT_BYTES) {
    throw new Error(`Font exceeds maximum size limit of 10 MiB (${bytes.length} bytes)`);
  }

  const format = parseFontFormat(bytes, filename);
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let font: fontkit.Font;
  try {
    const parsed = fontkit.create(buffer);
    if ('fonts' in parsed) {
      throw new Error('Font collections and suitcases are not supported');
    }
    font = parsed;
  } catch (error) {
    throw new Error(`Invalid font binary: failed to parse font (${error instanceof Error ? error.message : String(error)})`);
  }

  const familyName = font.familyName || font.fullName || '';
  const postscriptName = font.postscriptName || '';

  if (!familyName || !postscriptName) {
    throw new Error('Font is missing required family or PostScript name metadata');
  }

  const weightAxis = font.variationAxes?.wght;
  let weightMin = 400;
  let weightMax = 400;
  if (weightAxis) {
    weightMin = weightAxis.min;
    weightMax = weightAxis.max;
  } else if (font['OS/2']?.usWeightClass) {
    weightMin = font['OS/2'].usWeightClass;
    weightMax = font['OS/2'].usWeightClass;
  }

  const os2 = font['OS/2'];
  const isItalic =
    Boolean(os2?.fsSelection?.italic) ||
    (typeof font.italicAngle === 'number' && font.italicAngle !== 0) ||
    /italic|oblique/i.test(postscriptName) ||
    /italic|oblique/i.test(font.subfamilyName || '');
  const style: 'normal' | 'italic' = isItalic ? 'italic' : 'normal';

  const embeddingRestricted = Boolean(os2?.fsType?.noEmbedding);

  const missingCodepoints: number[] = [];
  for (const cp of VIETNAMESE_CODEPOINTS) {
    if (!font.hasGlyphForCodePoint(cp)) {
      missingCodepoints.push(cp);
    }
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');

  return {
    format,
    familyName,
    postscriptName,
    weightMin,
    weightMax,
    style,
    checksum,
    glyphCount: font.numGlyphs ?? 0,
    unitsPerEm: font.unitsPerEm ?? 1000,
    missingCodepoints,
    embeddingRestricted,
  };
}

async function validateSvgSticker(bytes: Uint8Array): Promise<ValidatedSticker> {
  if (bytes.length > MAX_SVG_BYTES) {
    throw new Error(`SVG exceeds maximum size limit of 2 MiB (${bytes.length} bytes)`);
  }

  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8');

  if (/<!DOCTYPE/i.test(text)) {
    throw new Error('SVG contains forbidden DOCTYPE declaration');
  }
  if (/<\?(?!xml\b)/i.test(text)) {
    throw new Error('SVG contains forbidden processing instructions');
  }
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)[a-zA-Z0-9_]+;/i.test(text)) {
    throw new Error('SVG contains forbidden entity references');
  }

  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === 'fatalError' || level === 'error' || level === 'warning') {
        throw new Error(`SVG XML parse ${level}: ${msg}`);
      }
    },
  });

  const doc = (() => {
    try {
      return parser.parseFromString(text, 'image/svg+xml');
    } catch (error) {
      throw new Error(`Malformed SVG document: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();

  if (doc.doctype) {
    throw new Error('SVG contains forbidden DOCTYPE declaration');
  }

  const svgElement = doc.documentElement;
  if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('Root element must be <svg>');
  }

  interface SvgNode {
    nodeType: number;
    tagName?: string;
    attributes?: {
      length: number;
      item(index: number): { name: string; value: string } | null;
    };
    childNodes?: {
      length: number;
      item(index: number): SvgNode | null;
    };
    getAttribute?(name: string): string | null;
  }

  interface SvgElementNode extends SvgNode {
    tagName: string;
    attributes: {
      length: number;
      item(index: number): { name: string; value: string } | null;
    };
    childNodes: {
      length: number;
      item(index: number): SvgNode | null;
    };
    getAttribute(name: string): string | null;
  }

  const elementsById = new Map<string, SvgElementNode>();
  const idOutgoingRefs = new Map<string, Set<string>>();

  function isSvgElement(candidate: SvgNode): candidate is SvgElementNode {
    return candidate.nodeType === 1 && typeof candidate.tagName === 'string' && typeof candidate.getAttribute === 'function';
  }

  function validateNode(node: SvgNode, ancestorIds: string[] = []): void {
    if (node.nodeType === 7) {
      throw new Error('SVG contains forbidden processing instruction');
    }
    if (node.nodeType === 10) {
      throw new Error('SVG contains forbidden document type');
    }
    if (node.nodeType === 5) {
      throw new Error('SVG contains forbidden entity reference');
    }

    if (!isSvgElement(node)) return;
    const tag = node.tagName.toLowerCase();

    if (!ALLOWED_SVG_ELEMENTS[tag]) {
      if (tag === 'text' || tag === 'tspan') {
        throw new Error(`SVG element <${node.tagName}> is not allowed: text must be outlined to vector paths`);
      }
      throw new Error(`SVG element <${node.tagName}> is not allowed`);
    }

    const elementId = node.getAttribute('id');
    const currentAncestors = elementId ? [...ancestorIds, elementId] : ancestorIds;
    if (elementId) {
      if (elementsById.has(elementId)) {
        throw new Error(`Duplicate element ID: #${elementId}`);
      }
      elementsById.set(elementId, node);
      if (!idOutgoingRefs.has(elementId)) {
        idOutgoingRefs.set(elementId, new Set());
      }
      for (const anc of ancestorIds) {
        idOutgoingRefs.get(anc)?.add(elementId);
      }
    }
    const attrs = node.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs.item(i);
      if (!attr) continue;
      const attrName = attr.name;
      const attrLower = attrName.toLowerCase();
      const attrVal = attr.value;

      if (/^on/i.test(attrName)) {
        throw new Error(`Inline event handler attribute "${attrName}" is forbidden in SVG`);
      }

      if (!ALLOWED_SVG_ATTRIBUTES[attrLower]) {
        throw new Error(`Attribute "${attrName}" is not allowed in SVG`);
      }

      if (attrLower === 'xmlns' || attrLower === 'xmlns:xlink') {
        if (!ALLOWED_NAMESPACES[attrVal.toLowerCase()]) {
          throw new Error(`Forbidden XML namespace URI "${attrVal}" in ${attrName}`);
        }
        continue;
      }

      const normalizedVal = attrVal.replace(/[\u0000-\u001f\s]/g, '').toLowerCase();
      if (
        normalizedVal.includes('javascript:') ||
        normalizedVal.includes('data:') ||
        normalizedVal.includes('http:') ||
        normalizedVal.includes('https:') ||
        normalizedVal.includes('//')
      ) {
        throw new Error(`External URL or script in attribute "${attrName}" is forbidden: ${attrVal}`);
      }

      if (attrLower === 'href' || attrLower === 'xlink:href') {
        if (!attrVal.startsWith('#')) {
          throw new Error(`External URL reference in "${attrName}" is forbidden: ${attrVal}`);
        }
        const targetId = attrVal.slice(1);
        if (currentAncestors.includes(targetId)) {
          throw new Error(`Circular reference detected: element inside #${targetId} references #${targetId}`);
        }
        for (const anc of currentAncestors) {
          idOutgoingRefs.get(anc)?.add(targetId);
        }
      }

      const urlMatches = attrVal.matchAll(/url\(\s*['"]?#([^'")]+)['"]?\s*\)/g);
      for (const match of urlMatches) {
        const targetId = match[1];
        if (currentAncestors.includes(targetId)) {
          throw new Error(`Circular reference detected: element inside #${targetId} references #${targetId}`);
        }
        for (const anc of currentAncestors) {
          idOutgoingRefs.get(anc)?.add(targetId);
        }
      }
      if (/url\(/i.test(attrVal)) {
        const invalidUrlMatch = attrVal.match(/url\(\s*['"]?(?!#)([^'")]+)['"]?\s*\)/i);
        if (invalidUrlMatch) {
          throw new Error(`External URL in url(...) is forbidden in "${attrName}": ${invalidUrlMatch[0]}`);
        }
      }
    }

    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children.item(i);
      if (child) {
        validateNode(child, currentAncestors);
      }
    }
  }

  if (svgElement) {
    validateNode(svgElement as unknown as SvgNode);
  }

  function checkTargetExists(node: SvgNode): void {
    if (!isSvgElement(node)) return;
    const href = node.getAttribute('href') || node.getAttribute('xlink:href');
    if (href?.startsWith('#')) {
      const targetId = href.slice(1);
      if (!elementsById.has(targetId)) {
        throw new Error(`Referenced element #${targetId} does not exist`);
      }
    }
    const attrs = node.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs.item(i);
      if (!attr) continue;
      const matches = attr.value.matchAll(/url\(\s*['"]?#([^'")]+)['"]?\s*\)/g);
      for (const m of matches) {
        if (!elementsById.has(m[1])) {
          throw new Error(`Referenced element #${m[1]} does not exist`);
        }
      }
    }
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children.item(i);
      if (child) checkTargetExists(child);
    }
  }

  if (svgElement) {
    checkTargetExists(svgElement as unknown as SvgNode);
  }

  const cycleState = new Map<string, 0 | 1 | 2>();
  function detectCycles(id: string): void {
    const st = cycleState.get(id) ?? 0;
    if (st === 1) {
      throw new Error(`Circular reference detected involving #${id}`);
    }
    if (st === 2) return;
    cycleState.set(id, 1);
    const neighbors = idOutgoingRefs.get(id);
    if (neighbors) {
      for (const neighbor of neighbors) {
        detectCycles(neighbor);
      }
    }
    cycleState.set(id, 2);
  }

  for (const id of elementsById.keys()) {
    if ((cycleState.get(id) ?? 0) === 0) {
      detectCycles(id);
    }
  }

  let width = 0;
  let height = 0;
  const widthAttr = svgElement.getAttribute('width');
  const heightAttr = svgElement.getAttribute('height');
  const viewBoxAttr = svgElement.getAttribute('viewBox');

  if (viewBoxAttr) {
    const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const vbWidth = parts[2];
      const vbHeight = parts[3];
      if (vbWidth > 0 && vbHeight > 0) {
        width = vbWidth;
        height = vbHeight;
      }
    }
  }

  if (widthAttr && heightAttr) {
    const parsedW = parseFloat(widthAttr);
    const parsedH = parseFloat(heightAttr);
    if (Number.isFinite(parsedW) && parsedW > 0 && Number.isFinite(parsedH) && parsedH > 0) {
      width = parsedW;
      height = parsedH;
    }
  }

  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('SVG dimensions or viewBox must define positive finite numbers');
  }

  const serializer = new XMLSerializer();
  const canonicalXml = serializer.serializeToString(doc);
  const canonicalBytes = new Uint8Array(Buffer.from(canonicalXml, 'utf8'));
  const checksum = createHash('sha256').update(canonicalBytes).digest('hex');
  const thumbnailBuffer = await sharp(Buffer.from(canonicalBytes))
    .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: 'inside' })
    .png()
    .toBuffer();

  return {
    canonicalBytes,
    format: 'svg',
    width,
    height,
    checksum,
    thumbnailBytes: new Uint8Array(thumbnailBuffer),
  };
}

async function validateRasterSticker(bytes: Uint8Array): Promise<ValidatedSticker> {
  if (bytes.length > MAX_RASTER_BYTES) {
    throw new Error(`Raster image exceeds maximum size limit of 10 MiB (${bytes.length} bytes)`);
  }

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const image = sharp(buffer);
  const meta = await image.metadata();

  if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
    throw new Error(`Unsupported raster image format: ${String(meta.format)}`);
  }

  if (meta.pages && meta.pages > 1) {
    throw new Error('Animated images are not supported');
  }

  if (!meta.width || !meta.height) {
    throw new Error('Invalid raster image dimensions');
  }

  if (
    meta.width * meta.height > MAX_DECOMPRESSION_PIXELS ||
    meta.width > MAX_RASTER_DIMENSION ||
    meta.height > MAX_RASTER_DIMENSION
  ) {
    throw new Error('Image exceeds maximum allowed dimensions (decompression bomb protection)');
  }

  const rotatedImage = sharp(buffer).rotate();
  const canonicalBuffer = await rotatedImage.toBuffer();
  const canonicalMeta = await sharp(canonicalBuffer).metadata();
  const width = canonicalMeta.width ?? meta.width;
  const height = canonicalMeta.height ?? meta.height;

  const thumbnailBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: 'inside' })
    .png()
    .toBuffer();

  const canonicalBytes = new Uint8Array(canonicalBuffer);
  const checksum = createHash('sha256').update(canonicalBytes).digest('hex');

  return {
    canonicalBytes,
    format: meta.format as StickerFormat,
    width,
    height,
    checksum,
    thumbnailBytes: new Uint8Array(thumbnailBuffer),
  };
}

export async function validateSticker(bytes: Uint8Array, filename?: string): Promise<ValidatedSticker> {
  if (filename && /\.svg$/i.test(filename)) {
    return validateSvgSticker(bytes);
  }
  if (isLikelySvg(bytes)) {
    return validateSvgSticker(bytes);
  }
  try {
    return await validateRasterSticker(bytes);
  } catch (error) {
    if (filename && !/\.(png|jpe?g|webp)$/i.test(filename)) {
      throw new Error(`Unsupported sticker format: ${filename}`);
    }
    throw error;
  }
}
