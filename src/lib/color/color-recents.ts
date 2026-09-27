import type { HexColor } from './color-types.ts';
import { normalizeHexColor } from './color-validation.ts';

export const MAX_RECENT_COLORS = 8;
const DEVICE_RECENT_COLORS_KEY = 'customizer_device_recent_colors';

export function getDeviceRecentColors(): HexColor[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(DEVICE_RECENT_COLORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: HexColor[] = [];
    for (const item of parsed) {
      const norm = normalizeHexColor(String(item));
      if (norm && !valid.includes(norm)) {
        valid.push(norm);
      }
      if (valid.length >= MAX_RECENT_COLORS) break;
    }
    return valid;
  } catch {
    return [];
  }
}

export function addDeviceRecentColor(hex: string): HexColor[] {
  const norm = normalizeHexColor(hex);
  if (!norm) return getDeviceRecentColors();
  const current = getDeviceRecentColors().filter((c) => c !== norm);
  const updated = [norm, ...current].slice(0, MAX_RECENT_COLORS);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(DEVICE_RECENT_COLORS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quota errors
    }
  }
  return updated;
}

export function mergeRecentColors(projectRecents: string[] = [], deviceRecents: string[] = []): HexColor[] {
  const result: HexColor[] = [];
  const seen = new Set<string>();

  const processList = (list: string[]) => {
    for (const item of list) {
      const norm = normalizeHexColor(item);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        result.push(norm);
        if (result.length >= MAX_RECENT_COLORS) return;
      }
    }
  };

  processList(projectRecents);
  if (result.length < MAX_RECENT_COLORS) {
    processList(deviceRecents);
  }
  return result;
}
