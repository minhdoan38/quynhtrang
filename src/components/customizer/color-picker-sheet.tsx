'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, Plus, ArrowRight, ArrowDownRight, ArrowDown, ArrowDownLeft, X } from 'lucide-react';
import type {
  ColorValue,
  GradientDirection,
  HexColor,
} from '@/lib/color/color-types';
import {
  normalizeHexColor,
  createSolidColor,
  createDefaultLinearGradient,
  createDefaultRadialGradient,
  solidToGradient,
  gradientToSolid,
} from '@/lib/color/color-validation';

const BASIC_PALETTE: { name: string; hex: HexColor }[] = [
  { name: 'Mực đậm', hex: '#2E3338' },
  { name: 'Mực nhạt', hex: '#666A6D' },
  { name: 'Xanh mực', hex: '#315F86' },
  { name: 'Xanh nhạt', hex: '#DCEBF4' },
  { name: 'Hồng phấn', hex: '#E8BCC9' },
  { name: 'Hồng đậm', hex: '#B86C84' },
  { name: 'Vàng bơ', hex: '#F2DFA0' },
  { name: 'Xanh xô thơm', hex: '#C8D8C4' },
  { name: 'Xanh lá đậm', hex: '#5F7E67' },
  { name: 'Đỏ gạch', hex: '#C25953' },
  { name: 'Đỏ mận', hex: '#B3535D' },
  { name: 'Trắng', hex: '#FFFFFF' },
];

const DIRECTION_PRESETS: { dir: GradientDirection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { dir: 'right', label: 'Ngang', icon: ArrowRight },
  { dir: 'bottom-right', label: 'Chéo', icon: ArrowDownRight },
  { dir: 'bottom', label: 'Dọc', icon: ArrowDown },
  { dir: 'bottom-left', label: 'Chéo ngược', icon: ArrowDownLeft },
];

export interface ColorPickerSheetProps {
  currentColor: ColorValue;
  onUpdateColor: (val: ColorValue) => void;
  designColors: HexColor[];
  recentColors: HexColor[];
  isGradientSupported?: boolean;
  onClose: () => void;
}

export function ColorPickerContent({
  currentColor,
  onUpdateColor,
  designColors,
  recentColors,
  isGradientSupported = true,
  onClose,
}: ColorPickerSheetProps) {
  const [activeTab, setActiveTab] = useState<'solid' | 'gradient'>(() => {
    return currentColor.kind === 'gradient' && isGradientSupported ? 'gradient' : 'solid';
  });

  const [activeGradientStop, setActiveGradientStop] = useState<0 | 1>(0);
  const [isCustomExpanded, setIsCustomExpanded] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [hexError, setHexError] = useState(false);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Sync current active solid hex into input
  const currentSolidHex = currentColor.kind === 'solid'
    ? currentColor.color
    : currentColor.colors[activeGradientStop];

  useEffect(() => {
    setHexInput(currentSolidHex);
    setHexError(false);
  }, [currentSolidHex]);

  // Tab switching
  const handleTabChange = (tab: 'solid' | 'gradient') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (tab === 'gradient') {
      if (currentColor.kind === 'solid') {
        onUpdateColor(solidToGradient(currentColor));
      }
    } else {
      if (currentColor.kind === 'gradient') {
        onUpdateColor(gradientToSolid(currentColor));
      }
    }
  };

  // Picking a color swatch (Solid or Stop)
  const handleSelectHex = (hex: HexColor) => {
    if (activeTab === 'solid' || currentColor.kind !== 'gradient') {
      onUpdateColor(createSolidColor(hex));
    } else {
      const newColors: [HexColor, HexColor] = [...currentColor.colors];
      newColors[activeGradientStop] = hex;
      if (currentColor.gradientType === 'radial') {
        onUpdateColor({ ...currentColor, colors: newColors });
      } else {
        onUpdateColor({ ...currentColor, colors: newColors });
      }
    }
  };

  // Hex text input change
  const handleHexInputChange = (val: string) => {
    setHexInput(val);
    const norm = normalizeHexColor(val);
    if (norm) {
      setHexError(false);
      handleSelectHex(norm);
    } else {
      setHexError(true);
    }
  };

  // Gradient type toggle (linear / radial)
  const handleGradientTypeChange = (type: 'linear' | 'radial') => {
    if (currentColor.kind !== 'gradient') return;
    if (type === 'linear') {
      onUpdateColor(createDefaultLinearGradient(currentColor.colors[0], currentColor.colors[1], 'right'));
    } else {
      onUpdateColor(createDefaultRadialGradient(currentColor.colors[0], currentColor.colors[1]));
    }
  };

  // Gradient direction change
  const handleDirectionChange = (dir: GradientDirection) => {
    if (currentColor.kind !== 'gradient' || currentColor.gradientType !== 'linear') return;
    onUpdateColor({ ...currentColor, direction: dir });
  };

  return (
    <div className="space-y-4 pb-2 text-[#2E3338]">
      {/* Header with Title and Close Button */}
      <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-2">
        <h2 className="text-sm font-semibold text-[#2E3338]">Chọn màu sắc</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng màu"
          className="p-1 rounded-lg text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs: Màu đơn | Gradient */}
      {isGradientSupported && (
        <div className="flex p-0.5 rounded-xl bg-[#F8F3E8] border border-[#ECE6DC]">
          <button
            type="button"
            onClick={() => handleTabChange('solid')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'solid'
                ? 'bg-white text-[#2E3338] shadow-xs'
                : 'text-[#666A6D] hover:text-[#2E3338]'
            }`}
          >
            Màu đơn
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('gradient')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'gradient'
                ? 'bg-white text-[#2E3338] shadow-xs'
                : 'text-[#666A6D] hover:text-[#2E3338]'
            }`}
          >
            Gradient
          </button>
        </div>
      )}

      {/* Gradient Controls Panel */}
      {activeTab === 'gradient' && currentColor.kind === 'gradient' && (
        <div className="space-y-3 p-3 rounded-xl bg-[#F8F3E8]/60 border border-[#ECE6DC]">
          {/* Linear vs Radial switch */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleGradientTypeChange('linear')}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
                currentColor.gradientType === 'linear'
                  ? 'border-[#315F86] bg-white text-[#315F86] font-semibold shadow-xs'
                  : 'border-[#DDD6CC] bg-white text-[#666A6D]'
              }`}
            >
              Linear
            </button>
            <button
              type="button"
              onClick={() => handleGradientTypeChange('radial')}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
                currentColor.gradientType === 'radial'
                  ? 'border-[#315F86] bg-white text-[#315F86] font-semibold shadow-xs'
                  : 'border-[#DDD6CC] bg-white text-[#666A6D]'
              }`}
            >
              Radial
            </button>
          </div>

          {/* Stop Pickers: Màu 1 & Màu 2 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setActiveGradientStop(0)}
              className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border bg-white transition-all ${
                activeGradientStop === 0 ? 'border-[#315F86] ring-2 ring-[#315F86]' : 'border-[#DDD6CC]'
              }`}
            >
              <span className="text-xs font-medium">Màu 1</span>
              <span
                className="w-5 h-5 rounded-full border border-black/15 shadow-xs"
                style={{ backgroundColor: currentColor.colors[0] }}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveGradientStop(1)}
              className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border bg-white transition-all ${
                activeGradientStop === 1 ? 'border-[#315F86] ring-2 ring-[#315F86]' : 'border-[#DDD6CC]'
              }`}
            >
              <span className="text-xs font-medium">Màu 2</span>
              <span
                className="w-5 h-5 rounded-full border border-black/15 shadow-xs"
                style={{ backgroundColor: currentColor.colors[1] }}
              />
            </button>
          </div>

          {/* Direction Presets (Linear Only) */}
          {currentColor.gradientType === 'linear' && (
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-medium text-[#666A6D]">Hướng gradient</span>
              <div className="grid grid-cols-4 gap-2">
                {DIRECTION_PRESETS.map((p) => {
                  const Icon = p.icon;
                  const isSelected = currentColor.direction === p.dir;
                  return (
                    <button
                      key={p.dir}
                      type="button"
                      onClick={() => handleDirectionChange(p.dir)}
                      title={p.label}
                      className={`flex flex-col items-center justify-center py-2 rounded-lg border bg-white transition-all ${
                        isSelected
                          ? 'border-[#315F86] text-[#315F86] bg-[#DCEBF4]/40 font-semibold'
                          : 'border-[#DDD6CC] text-[#666A6D] hover:bg-[#F8F3E8]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 1: Màu trong thiết kế (Design Colors) */}
      {designColors.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-[#666A6D] uppercase tracking-wider">
            Màu trong thiết kế
          </span>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {designColors.map((hex) => {
              const isSelected = currentSolidHex.toUpperCase() === hex.toUpperCase();
              return (
                <button
                  key={`design-${hex}`}
                  type="button"
                  onClick={() => handleSelectHex(hex)}
                  title={hex}
                  className={`w-8 h-8 rounded-full border border-black/10 flex items-center justify-center transition-transform active:scale-95 shadow-xs ${
                    isSelected ? 'ring-2 ring-[#315F86] ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {isSelected && (
                    <Check
                      className={`w-4 h-4 ${
                        hex.toUpperCase() === '#FFFFFF' || hex.toUpperCase() === '#FFFDF8'
                          ? 'text-black'
                          : 'text-white'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: Gần đây (Recent Colors) */}
      {recentColors.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-[#666A6D] uppercase tracking-wider">
            Gần đây
          </span>
          <div className="flex flex-wrap gap-2 pt-0.5">
            {recentColors.map((hex) => {
              const isSelected = currentSolidHex.toUpperCase() === hex.toUpperCase();
              return (
                <button
                  key={`recent-${hex}`}
                  type="button"
                  onClick={() => handleSelectHex(hex)}
                  title={hex}
                  className={`w-8 h-8 rounded-full border border-black/10 flex items-center justify-center transition-transform active:scale-95 shadow-xs ${
                    isSelected ? 'ring-2 ring-[#315F86] ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {isSelected && (
                    <Check
                      className={`w-4 h-4 ${
                        hex.toUpperCase() === '#FFFFFF' || hex.toUpperCase() === '#FFFDF8'
                          ? 'text-black'
                          : 'text-white'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: Bảng màu cơ bản (Basic Palette) */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-[#666A6D] uppercase tracking-wider">
          Bảng màu cơ bản
        </span>
        <div className="grid grid-cols-6 gap-2 pt-0.5">
          {BASIC_PALETTE.map((p) => {
            const isSelected = currentSolidHex.toUpperCase() === p.hex.toUpperCase();
            return (
              <button
                key={p.hex}
                type="button"
                onClick={() => handleSelectHex(p.hex)}
                title={p.name}
                className={`w-8 h-8 rounded-full border border-black/10 mx-auto flex items-center justify-center transition-transform active:scale-95 shadow-xs ${
                  isSelected ? 'ring-2 ring-[#315F86] ring-offset-2' : ''
                }`}
                style={{ backgroundColor: p.hex }}
              >
                {isSelected && (
                  <Check
                    className={`w-4 h-4 ${
                      p.hex === '#FFFFFF' || p.hex === '#F2DFA0' ? 'text-black' : 'text-white'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: Màu tùy chỉnh (Custom Color: Native Picker + HEX Input) */}
      <div className="pt-2 border-t border-[#ECE6DC]">
        {!isCustomExpanded ? (
          <button
            type="button"
            onClick={() => setIsCustomExpanded(true)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#315F86]" />
              <span className="text-xs font-medium text-[#2E3338]">Thêm màu tùy chỉnh</span>
            </div>
            <span
              className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
              style={{ backgroundColor: currentSolidHex }}
            />
          </button>
        ) : (
          <div className="p-3 rounded-xl border border-[#ECE6DC] bg-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#2E3338]">Màu tùy chỉnh</span>
              <button
                type="button"
                onClick={() => setIsCustomExpanded(false)}
                className="text-xs text-[#666A6D] hover:text-[#2E3338]"
              >
                Thu gọn
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Native swatch trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => nativeInputRef.current?.click()}
                  title="Mở bảng chọn màu hệ thống"
                  className="w-10 h-10 rounded-xl border border-[#DDD6CC] shadow-xs flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                  style={{ backgroundColor: currentSolidHex }}
                />
                <input
                  ref={nativeInputRef}
                  type="color"
                  value={currentSolidHex}
                  onChange={(e) => {
                    const norm = normalizeHexColor(e.target.value);
                    if (norm) handleSelectHex(norm);
                  }}
                  className="sr-only"
                />
              </div>

              {/* HEX text field */}
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDD6CC] bg-[#FFFDF8]">
                  <span className="text-xs font-mono text-[#666A6D]">HEX</span>
                  <input
                    type="text"
                    value={hexInput}
                    onChange={(e) => handleHexInputChange(e.target.value)}
                    placeholder="#RRGGBB"
                    maxLength={7}
                    className="w-full text-xs font-mono font-medium uppercase outline-none bg-transparent text-[#2E3338]"
                  />
                </div>
                {hexError && (
                  <p className="text-[10px] text-[#B3535D] font-medium">Mã HEX không hợp lệ (ví dụ: #315F86)</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
