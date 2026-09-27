import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ColorTarget, ColorValue, HexColor } from '@/lib/color/color-types';
import {
  getColorValue,
  setColorValue,
  supportsGradient,
  extractDesignColors,
} from '@/lib/color/color-target';
import {
  getDeviceRecentColors,
  addDeviceRecentColor,
  mergeRecentColors,
} from '@/lib/color/color-recents';
import { createSolidColor } from '@/lib/color/color-validation';
import type { DesignState } from '@/lib/product-state';

export interface UseColorEditorProps {
  isOpen: boolean;
  target: ColorTarget | null;
  state: DesignState;
  onUpdateState: (newState: DesignState) => void;
  onCommitUndo: (initialState: DesignState) => void;
  projectRecents: string[];
  onAddProjectRecent: (hex: HexColor) => void;
}

export function useColorEditor({
  isOpen,
  target,
  state,
  onUpdateState,
  onCommitUndo,
  projectRecents,
  onAddProjectRecent,
}: UseColorEditorProps) {
  const sessionBaseStateRef = useRef<DesignState | null>(null);
  const sessionInitialValueRef = useRef<ColorValue | null>(null);

  // Active value resolution
  const currentColor = useMemo<ColorValue>(() => {
    if (!target) return createSolidColor('#2E3338');
    return getColorValue(state, target) ?? createSolidColor('#2E3338');
  }, [state, target]);

  const isGradientSupported = useMemo(() => {
    return target ? supportsGradient(target) : false;
  }, [target]);

  // Derived Design Colors from document
  const designColors = useMemo(() => {
    return extractDesignColors(state);
  }, [state]);

  // Device recents loaded client-side
  const [deviceRecents, setDeviceRecents] = useState<HexColor[]>([]);

  useEffect(() => {
    setDeviceRecents(getDeviceRecentColors());
  }, []);

  // Merged recents (Project + Device, deduplicated, max 8)
  const recentColors = useMemo(() => {
    return mergeRecentColors(projectRecents, deviceRecents);
  }, [projectRecents, deviceRecents]);

  // Capture session base on target change
  const prevIsOpenRef = useRef(false);

  // Capture session base strictly when sheet opens
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current && target) {
      sessionBaseStateRef.current = state;
      sessionInitialValueRef.current = getColorValue(state, target);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, target, state]);

  // Live color change without creating undo entry
  const updateColorLive = useCallback(
    (newVal: ColorValue) => {
      if (!target) return;
      const next = setColorValue(state, target, newVal);
      onUpdateState(next);
    },
    [target, state, onUpdateState]
  );

  // Close session: commit single undo entry if changed, add to recents
  const closeSession = useCallback(() => {
    const base = sessionBaseStateRef.current;
    const initialVal = sessionInitialValueRef.current;
    sessionBaseStateRef.current = null;
    sessionInitialValueRef.current = null;

    if (!target || !base || !initialVal) return;

    const finalVal = getColorValue(state, target);
    if (JSON.stringify(initialVal) !== JSON.stringify(finalVal)) {
      onCommitUndo(base);

      // Record solid colors into recents
      if (finalVal) {
        if (finalVal.kind === 'solid') {
          onAddProjectRecent(finalVal.color);
          const updated = addDeviceRecentColor(finalVal.color);
          setDeviceRecents(updated);
        } else {
          onAddProjectRecent(finalVal.colors[0]);
          addDeviceRecentColor(finalVal.colors[0]);
          onAddProjectRecent(finalVal.colors[1]);
          const updated = addDeviceRecentColor(finalVal.colors[1]);
          setDeviceRecents(updated);
        }
      }
    }
  }, [target, state, onCommitUndo, onAddProjectRecent]);

  return {
    currentColor,
    updateColorLive,
    closeSession,
    designColors,
    recentColors,
    isGradientSupported,
  };
}
