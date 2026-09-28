'use client';

import React, { useState } from 'react';
import {
  RotateCcw,
  Palette,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import type { PatternConfig, PatternRepeatMode } from '@/lib/product-state';
import {
  REPEAT_MODE_OPTIONS,
  PATTERN_SCALE_LIMITS,
  PATTERN_SPACING_LIMITS,
  ROTATION_PRESETS,
  CUSTOMER_LABELS,
} from '@/lib/pattern-controls-constants';

export {
  REPEAT_MODE_OPTIONS,
  PATTERN_SCALE_LIMITS,
  PATTERN_SPACING_LIMITS,
  ROTATION_PRESETS,
  CUSTOMER_LABELS,
};
export type { RepeatModeOption } from '@/lib/pattern-controls-constants';

export interface PatternControlsSheetProps {
  config: PatternConfig;
  onLiveUpdate: (patch: Partial<PatternConfig>) => void;
  onCommitChange: (
    actionType:
      | 'change-pattern-repeat'
      | 'change-pattern-scale'
      | 'change-pattern-spacing'
      | 'change-pattern-background'
      | 'rotate-pattern',
    label: string,
    patch: Partial<PatternConfig>
  ) => void;
  onOpenColorSheet: () => void;
  onResetDefault: () => void;
  onClose: () => void;
}

export function PatternControlsSheet({
  config,
  onLiveUpdate,
  onCommitChange,
  onOpenColorSheet,
  onResetDefault,
  onClose,
}: PatternControlsSheetProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const activeRepeatMode = config.repeatMode || 'basic';
  const scaleValue = config.scale ?? PATTERN_SCALE_LIMITS.default;
  const spacingValue = config.spacingX ?? PATTERN_SPACING_LIMITS.default;
  const rotationValue = config.rotation ?? 0;
  const backgroundColor = config.backgroundColor || '#ffffff';

  const handleSelectRepeat = (mode: PatternRepeatMode) => {
    onLiveUpdate({ repeatMode: mode });
    onCommitChange('change-pattern-repeat', CUSTOMER_LABELS.repeatMode, {
      repeatMode: mode,
    });
  };

  const handleScalePointerUp = (finalScale: number) => {
    onCommitChange('change-pattern-scale', CUSTOMER_LABELS.scale, {
      scale: finalScale,
    });
  };

  const handleSpacingPointerUp = (finalSpacing: number) => {
    onCommitChange('change-pattern-spacing', CUSTOMER_LABELS.spacing, {
      spacingX: finalSpacing,
      spacingY: finalSpacing,
    });
  };

  const handleSelectRotation = (angle: number) => {
    onLiveUpdate({ rotation: angle });
    onCommitChange('rotate-pattern', CUSTOMER_LABELS.rotate, {
      rotation: angle,
    });
  };

  return (
    <div className="space-y-4 pb-2 text-[#2E3338]" data-testid="pattern-controls-sheet">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-2">
        <h2 className="text-sm font-semibold text-[#2E3338]">{CUSTOMER_LABELS.repeatMode} & {CUSTOMER_LABELS.scale}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng chỉnh họa tiết"
          className="p-1 rounded-lg text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 1. Primary: Visual Repeat Mode Cards */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-[#2E3338]">
          {CUSTOMER_LABELS.repeatMode}
        </span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={CUSTOMER_LABELS.repeatMode}>
          {REPEAT_MODE_OPTIONS.map((opt) => {
            const isSelected = activeRepeatMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelectRepeat(opt.mode)}
                className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${isSelected
                    ? 'border-[#315F86] bg-[#DCEBF4]/40 text-[#315F86] font-semibold'
                    : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] text-[#2E3338]'
                  }`}
              >
                {/* SVG Visual preview mini-diagram */}
                <div className="w-10 h-10 rounded-lg bg-[#F8F3E8] border border-[#ECE6DC] flex items-center justify-center shrink-0 overflow-hidden">
                  <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                    className="w-7 h-7 text-[#315F86]"
                  >
                    {opt.mode === 'basic' && (
                      <g fill="currentColor">
                        <circle cx="9" cy="9" r="3.5" />
                        <circle cx="23" cy="9" r="3.5" />
                        <circle cx="9" cy="23" r="3.5" />
                        <circle cx="23" cy="23" r="3.5" />
                      </g>
                    )}
                    {opt.mode === 'half-drop' && (
                      <g fill="currentColor">
                        <circle cx="9" cy="7" r="3" />
                        <circle cx="9" cy="23" r="3" />
                        <circle cx="23" cy="15" r="3" />
                      </g>
                    )}
                    {opt.mode === 'half-brick' && (
                      <g fill="currentColor">
                        <circle cx="7" cy="9" r="3" />
                        <circle cx="23" cy="9" r="3" />
                        <circle cx="15" cy="23" r="3" />
                      </g>
                    )}
                    {opt.mode === 'mirror' && (
                      <g stroke="currentColor" strokeWidth="2" fill="none">
                        <path d="M 6 16 L 12 10 L 12 22 Z" fill="currentColor" opacity="0.8" />
                        <path d="M 26 16 L 20 10 L 20 22 Z" fill="currentColor" />
                      </g>
                    )}
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-xs">{opt.label}</div>
                  <div className="text-[10px] text-[#666A6D] line-clamp-1">{opt.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Scale Slider */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between items-center text-xs">
          <label htmlFor="pattern-scale-slider" className="font-semibold text-[#2E3338]">
            {CUSTOMER_LABELS.scale}
          </label>
          <span className="text-[#666A6D] font-mono text-[11px]">{Math.round(scaleValue)}%</span>
        </div>
        <input
          id="pattern-scale-slider"
          type="range"
          min={PATTERN_SCALE_LIMITS.min}
          max={PATTERN_SCALE_LIMITS.max}
          step={PATTERN_SCALE_LIMITS.step}
          value={scaleValue}
          onChange={(e) => {
            const nextScale = Number(e.target.value);
            onLiveUpdate({ scale: nextScale });
          }}
          onPointerUp={(e) => {
            handleScalePointerUp(Number((e.target as HTMLInputElement).value));
          }}
          className="w-full accent-[#315F86] cursor-pointer h-2 bg-[#ECE6DC] rounded-lg"
        />
        <div className="flex justify-between text-[11px] text-[#666A6D]">
          <span>{CUSTOMER_LABELS.scaleSmall}</span>
          <span>{CUSTOMER_LABELS.scaleLarge}</span>
        </div>
      </div>

      {/* 3. Spacing Slider */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between items-center text-xs">
          <label htmlFor="pattern-spacing-slider" className="font-semibold text-[#2E3338]">
            {CUSTOMER_LABELS.spacing}
          </label>
          <span className="text-[#666A6D] font-mono text-[11px]">{Math.round(spacingValue)}px</span>
        </div>
        <input
          id="pattern-spacing-slider"
          type="range"
          min={PATTERN_SPACING_LIMITS.min}
          max={PATTERN_SPACING_LIMITS.max}
          step={PATTERN_SPACING_LIMITS.step}
          value={spacingValue}
          onChange={(e) => {
            const nextSpacing = Number(e.target.value);
            onLiveUpdate({ spacingX: nextSpacing, spacingY: nextSpacing });
          }}
          onPointerUp={(e) => {
            handleSpacingPointerUp(Number((e.target as HTMLInputElement).value));
          }}
          className="w-full accent-[#315F86] cursor-pointer h-2 bg-[#ECE6DC] rounded-lg"
        />
        <div className="flex justify-between text-[11px] text-[#666A6D]">
          <span>{CUSTOMER_LABELS.spacingClose}</span>
          <span>{CUSTOMER_LABELS.spacingFar}</span>
        </div>
      </div>

      {/* 4. Background Color Entry Button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={onOpenColorSheet}
          aria-label="Chọn màu nền họa tiết"
          className="w-full flex items-center justify-between p-3 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] transition-all text-xs font-medium"
        >
          <div className="flex items-center gap-2.5">
            <Palette className="w-4 h-4 text-[#315F86]" />
            <span className="font-semibold text-[#2E3338]">{CUSTOMER_LABELS.background}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[#666A6D]">{backgroundColor}</span>
            <div
              className="w-5 h-5 rounded-full border border-black/15 shadow-2xs"
              style={{ backgroundColor }}
            />
          </div>
        </button>
      </div>

      {/* 5. Secondary Accordion: Rotation & Reset */}
      <div className="pt-2 border-t border-[#ECE6DC]">
        <button
          type="button"
          onClick={() => setIsAdvancedOpen((prev) => !prev)}
          aria-expanded={isAdvancedOpen}
          className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-[#666A6D] hover:text-[#2E3338]"
        >
          <span>••• Tùy chọn nâng cao</span>
          {isAdvancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isAdvancedOpen && (
          <div className="space-y-3 pt-2">
            {/* Rotation Presets */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#2E3338]">
                {CUSTOMER_LABELS.rotate}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {ROTATION_PRESETS.map((deg) => {
                  const isRotSelected = rotationValue === deg;
                  return (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => handleSelectRotation(deg)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${isRotSelected
                          ? 'border-[#315F86] bg-[#DCEBF4]/40 text-[#315F86] font-semibold'
                          : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] text-[#2E3338]'
                        }`}
                    >
                      {deg}°
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reset Defaults button */}
            <button
              type="button"
              onClick={onResetDefault}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[#ECE6DC] hover:bg-[#F8F3E8] text-[#666A6D] hover:text-[#2E3338] text-xs font-medium transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{CUSTOMER_LABELS.reset}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
