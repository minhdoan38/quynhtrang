import React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  ImagePlus,
  Type,
  Sparkles,
  Layers,
  Crop,
  Copy,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
  FolderMinus,
  CheckSquare,
} from 'lucide-react';
import { TEMPLATES, type ProductId, type CanvasElement } from '@/lib/product-state';
import { AddContentSheet } from './add-content-sheet';
import { ImageSourceChooser } from './image-source-chooser';
import { LayersSheetContent } from './layers-sheet-content';
import type { ImageSourceType, TextStylePreset, ShapePrimitiveType, ImageSourceContext } from '@/lib/add-content';
import { FontBrowserContent } from './font-browser-sheet';
import { ColorPickerContent } from './color-picker-sheet';
import { MaskSheetContent } from './mask-sheet-content';
import type { MaskType } from '@/lib/image-mask';
import type { ColorValue, HexColor } from '@/lib/color/color-types';
import { createSolidColor } from '@/lib/color/color-validation';
import type { PatternConfig } from '@/lib/product-state';
import { PatternControlsSheet } from './pattern-controls-sheet';
export type ActiveSheetType =
  | 'add'
  | 'image-source'
  | 'templates'
  | 'layers'
  | 'font'
  | 'color'
  | 'opacity'
  | 'mask'
  | 'font-size'
  | 'align'
  | 'more'
  | 'pattern'
  | null;
interface EditorSheetsProps {
  activeSheet: ActiveSheetType;
  onClose: () => void;
  selectedTarget: 'image' | 'text' | 'group' | null;
  selectedElementId?: string | null;
  selectionMode?: 'default' | 'multi-select' | 'group-edit';
  selectedElementIds?: string[];
  activeGroupId?: string | null;
  onEnterMultiSelect?: () => void;
  onExitMultiSelect?: () => void;
  onToggleSelectElement?: (id: string) => void;
  onSelectChildInGroup?: (groupId: string, childId: string) => void;
  onUngroup?: () => void;
  elements?: CanvasElement[];
  surface?: string;
  productId: ProductId;
  templateId: string | null;
  text: string;
  hasImage: boolean;
  imageThumbnailSrc?: string;
  color: string;
  colorValue?: ColorValue;
  onUpdateColorValue?: (val: ColorValue) => void;
  designColors?: HexColor[];
  recentColors?: HexColor[];
  isGradientSupported?: boolean;
  isLocked: boolean;
  imageOpacity: number;
  fontSize: number;
  fontFamily: string;
  textAlign?: 'left' | 'center' | 'right';
  onSelectTemplate: (tplId: string) => void;
  onOpenTemplateBrowser: () => void;
  onAddText: (preset?: TextStylePreset) => void;
  onUploadImageClick: (source?: ImageSourceType, context?: ImageSourceContext) => void;
  imageSourceContext?: ImageSourceContext;
  onAddShape?: (shape: ShapePrimitiveType) => void;
  onSetColor: (color: string) => void;
  onSetFont: (font: string) => void;
  onSetFontSize: (size: number) => void;
  onSetTextAlign?: (align: 'left' | 'center' | 'right') => void;
  onSetOpacity: (opacity: number) => void;
  onCommitOpacity?: (opacity: number) => void;
  currentMask?: string | null;
  onSelectMask?: (maskId: MaskType) => void;
  onMaskClick?: () => void;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDeleteTarget: () => void;
  onSelectLayer: (layer: 'text' | 'image' | string) => void;
  onReorderElements?: (orderedIds: string[]) => void;
  onOpenAddSheet?: () => void;
  patternConfig?: PatternConfig;
  onLiveUpdatePatternConfig?: (patch: Partial<PatternConfig>) => void;
  onCommitPatternChange?: (
    actionType:
      | 'change-pattern-repeat'
      | 'change-pattern-scale'
      | 'change-pattern-spacing'
      | 'change-pattern-background'
      | 'rotate-pattern',
    label: string,
    patch: Partial<PatternConfig>
  ) => void;
  onOpenColorSheet?: () => void;
  onResetPatternDefault?: () => void;
}

const PALETTE = [
  { name: 'Mực đậm', hex: '#2E3338' },
  { name: 'Mực nhạt', hex: '#666A6D' },
  { name: 'Xanh mực', hex: '#315F86' },
  { name: 'Hồng phấn', hex: '#E8BCC9' },
  { name: 'Vàng bơ', hex: '#F2DFA0' },
  { name: 'Xanh xô thơm', hex: '#C8D8C4' },
  { name: 'Đỏ gạch', hex: '#C25953' },
  { name: 'Trắng', hex: '#FFFFFF' },
];


export function EditorSheets({
  activeSheet,
  onClose,
  selectedTarget,
  selectedElementId,
  elements,
  surface = 'front',
  productId,
  templateId,
  text,
  hasImage,
  imageThumbnailSrc,
  color,
  colorValue,
  onUpdateColorValue,
  designColors,
  recentColors,
  isGradientSupported,
  isLocked,
  imageOpacity,
  fontSize,
  fontFamily,
  textAlign = 'center',
  onSelectTemplate,
  onOpenTemplateBrowser,
  onAddText,
  onUploadImageClick,
  imageSourceContext,
  onAddShape,
  onSetColor,
  onSetFont,
  onSetFontSize,
  onSetTextAlign,
  onSetOpacity,
  onCommitOpacity,
  currentMask,
  onSelectMask,
  onMaskClick,
  onToggleLock,
  onDuplicate,
  onBringForward,
  onSendBackward,
  onDeleteTarget,
  onSelectLayer,
  onReorderElements,
  onOpenAddSheet,
  selectionMode = 'default',
  selectedElementIds = [],
  activeGroupId = null,
  onEnterMultiSelect,
  onExitMultiSelect,
  onToggleSelectElement,
  onSelectChildInGroup,
  onUngroup,
  patternConfig,
  onLiveUpdatePatternConfig,
  onCommitPatternChange,
  onOpenColorSheet,
  onResetPatternDefault,
}: EditorSheetsProps) {
  const isOpen = activeSheet !== null;

  return (
    <Drawer
      open={isOpen}
      snapPoints={
        activeSheet === 'layers'
          ? ['420px', '82vh']
          : activeSheet === 'font'
            ? ['460px', '85vh']
            : activeSheet === 'color'
              ? ['440px', '80vh']
              : activeSheet === 'pattern'
                ? ['480px', '85vh']
                : undefined
      }
      showSwipeHandle={activeSheet === 'layers' || activeSheet === 'font' || activeSheet === 'color' || activeSheet === 'pattern'}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent className="max-w-md mx-auto bg-[#FFFDF8] border-t border-[#ECE6DC] text-[#2E3338] px-4 pb-6 pt-2 rounded-t-2xl shadow-xl">
        {/* ADD SHEET */}
        {activeSheet === 'add' && (
          <AddContentSheet
            onClose={onClose}
            onSelectImageSource={(source) => {
              onUploadImageClick(source);
            }}
            onSelectTextStyle={(preset) => {
              onAddText(preset);
            }}
            onSelectShape={(shape) => {
              if (onAddShape) onAddShape(shape);
            }}
          />
        )}
        {/* PATTERN CONTROLS SHEET */}
        {activeSheet === 'pattern' && patternConfig && (
          <PatternControlsSheet
            config={patternConfig}
            onLiveUpdate={(patch) => onLiveUpdatePatternConfig?.(patch)}
            onCommitChange={(actionType, label, patch) =>
              onCommitPatternChange?.(actionType, label, patch)
            }
            onOpenColorSheet={() => onOpenColorSheet?.()}
            onResetDefault={() => onResetPatternDefault?.()}
            onClose={onClose}
          />
        )}
        {/* IMAGE SOURCE SHEET (REPLACE IMAGE) */}
        {activeSheet === 'image-source' && (
          <ImageSourceChooser
            context={imageSourceContext ?? { mode: 'replace', targetElementId: selectedElementId ?? 'image-1' }}
            onClose={onClose}
            onSelectSource={(source, ctx) => {
              onClose();
              onUploadImageClick(source, ctx);
            }}
          />
        )}
        {activeSheet === 'templates' && (
          <div className="space-y-4">
            <DrawerHeader className="px-0 py-2">
              <DrawerTitle className="text-sm font-semibold text-center text-[#2E3338]">
                Chọn mẫu thiết kế
              </DrawerTitle>
            </DrawerHeader>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {['blank', 'minimal', 'celebrate'].map((key) => {
                const tpl = TEMPLATES[key];
                if (!tpl) return null;
                const isSelected = templateId === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onSelectTemplate(key);
                      onClose();
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${isSelected
                      ? 'border-[#315F86] bg-[#DCEBF4]/40 font-semibold'
                      : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8]'
                      }`}
                  >
                    <span className="text-xs">{tpl.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTemplateBrowser();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#315F86] text-[#315F86] bg-white hover:bg-[#DCEBF4]/30 text-xs font-semibold transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Duyệt tất cả mẫu có sẵn</span>
            </button>
          </div>
        )}

        {/* LAYERS SHEET */}
        {activeSheet === 'layers' && (
          <LayersSheetContent
            elements={
              elements && elements.length > 0
                ? elements
                : [
                  ...(text
                    ? [
                      {
                        id: 'text-1',
                        type: 'text' as const,
                        x: 50,
                        y: 75,
                        width: 70,
                        height: 20,
                        rotation: 0,
                        zIndex: 2,
                        data: { text },
                      },
                    ]
                    : []),
                  ...(hasImage
                    ? [
                      {
                        id: 'image-1',
                        type: 'image' as const,
                        x: 50,
                        y: 45,
                        width: 60,
                        height: 60,
                        rotation: 0,
                        zIndex: 1,
                        locked: isLocked,
                        data: { src: imageThumbnailSrc },
                      },
                    ]
                    : []),
                ]
            }
            selectedId={
              selectedElementId ||
              (selectedTarget === 'image'
                ? 'image-1'
                : selectedTarget === 'text'
                  ? 'text-1'
                  : null)
            }
            surface={surface}
            onSelect={(id) => {
              if (id) {
                onSelectLayer(id);
              }
            }}
            onReorder={(ids) => {
              onReorderElements?.(ids);
            }}
            onAddClick={() => {
              onOpenAddSheet?.();
            }}
            onClose={onClose}
            imageThumbnailSrc={imageThumbnailSrc}
            selectionMode={selectionMode}
            selectedElementIds={selectedElementIds}
            activeGroupId={activeGroupId}
            onEnterMultiSelect={onEnterMultiSelect}
            onExitMultiSelect={onExitMultiSelect}
            onToggleSelectElement={onToggleSelectElement}
            onSelectChildInGroup={onSelectChildInGroup}
          />
        )}

        {/* FONT SHEET */}
        {activeSheet === 'font' && (
          <FontBrowserContent
            currentFamily={fontFamily}
            onPreviewFont={(fam) => onSetFont(fam)}
            onClose={onClose}
          />
        )}

        {/* COLOR SHEET */}
        {activeSheet === 'color' && (
          <ColorPickerContent
            currentColor={colorValue || createSolidColor(color || '#315F86')}
            onUpdateColor={(val) => {
              if (onUpdateColorValue) {
                onUpdateColorValue(val);
              } else {
                onSetColor(val.kind === 'solid' ? val.color : val.colors[0]);
              }
            }}
            designColors={designColors || []}
            recentColors={recentColors || []}
            isGradientSupported={isGradientSupported ?? true}
            onClose={onClose}
          />
        )}

        {/* OPACITY SHEET */}
        {activeSheet === 'opacity' && (
          <div className="space-y-4">
            <DrawerHeader className="px-0 py-2">
              <DrawerTitle className="text-sm font-semibold text-center text-[#2E3338]">
                Độ mờ ảnh ({imageOpacity}%)
              </DrawerTitle>
            </DrawerHeader>
            <div className="py-4 px-2">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={imageOpacity}
                onChange={(e) => onSetOpacity(Number(e.target.value))}
                onPointerUp={(e) => onCommitOpacity?.(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => onCommitOpacity?.(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => onCommitOpacity?.(Number((e.target as HTMLInputElement).value))}
                className="w-full accent-[#315F86] cursor-pointer h-2 bg-[#ECE6DC] rounded-lg"
              />
              <div className="flex justify-between text-xs text-[#666A6D] mt-2 font-medium">
                <span>0% (Trong suốt)</span>
                <span>100% (Rõ nét)</span>
              </div>
            </div>
          </div>
        )}
        {/* MASK SHEET */}
        {activeSheet === 'mask' && (
          <MaskSheetContent
            currentMask={currentMask}
            onSelectMask={(maskId) => onSelectMask?.(maskId)}
            onClose={onClose}
          />
        )}


        {/* FONT SIZE SHEET */}
        {activeSheet === 'font-size' && (
          <div className="space-y-4">
            <DrawerHeader className="px-0 py-2">
              <DrawerTitle className="text-sm font-semibold text-center text-[#2E3338]">
                Cỡ chữ ({fontSize}px)
              </DrawerTitle>
            </DrawerHeader>
            <div className="py-4 px-2">
              <input
                type="range"
                min="14"
                max="36"
                step="1"
                value={fontSize}
                onChange={(e) => onSetFontSize(Number(e.target.value))}
                className="w-full accent-[#315F86] cursor-pointer h-2 bg-[#ECE6DC] rounded-lg"
              />
              <div className="flex justify-between text-xs text-[#666A6D] mt-2 font-medium">
                <span>14px (Nhỏ)</span>
                <span>36px (Lớn)</span>
              </div>
            </div>
          </div>
        )}


        {/* ALIGNMENT SHEET */}
        {activeSheet === 'align' && (
          <div className="space-y-4">
            <DrawerHeader className="px-0 py-2">
              <DrawerTitle className="text-sm font-semibold text-center text-[#2E3338]">
                Căn chỉnh dòng chữ
              </DrawerTitle>
            </DrawerHeader>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {[
                { id: 'left' as const, label: 'Trái', icon: AlignLeft },
                { id: 'center' as const, label: 'Giữa', icon: AlignCenter },
                { id: 'right' as const, label: 'Phải', icon: AlignRight },
              ].map(({ id, label, icon: Icon }) => {
                const isSelected = textAlign === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      onSetTextAlign?.(id);
                      onClose();
                    }}
                    className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border transition-all text-xs font-medium ${isSelected
                      ? 'border-[#315F86] bg-[#DCEBF4]/40 text-[#315F86]'
                      : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] text-[#2E3338]'
                      }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* MORE SHEET */}
        {activeSheet === 'more' && (
          <div className="space-y-2">
            <DrawerHeader className="px-0 py-2">
              <DrawerTitle className="text-sm font-semibold text-center text-[#2E3338]">
                Thao tác khác
              </DrawerTitle>
            </DrawerHeader>
            <div className="space-y-1 pt-1">
              {selectedTarget === 'image' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onMaskClick?.();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium"
                >
                  <Crop className="w-4 h-4 text-[#315F86]" />
                  <span>Mặt nạ cắt (Mask)</span>
                </button>
              )}
              {selectedTarget === 'group' && (
                <button
                  type="button"
                  onClick={() => {
                    onUngroup?.();
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium"
                >
                  <FolderMinus className="w-4 h-4 text-[#315F86]" />
                  <span>Bỏ nhóm (Ungroup)</span>
                </button>
              )}

              {selectionMode !== 'multi-select' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEnterMultiSelect?.();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium"
                >
                  <CheckSquare className="w-4 h-4 text-[#315F86]" />
                  <span>Chọn nhiều</span>
                </button>
              )}

              <button
                onClick={() => {
                  onDuplicate();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium"
              >
                <Copy className="w-4 h-4 text-[#315F86]" />
                <span>Nhân bản</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onToggleLock();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium"
              >
                {isLocked ? (
                  <>
                    <Unlock className="w-4 h-4 text-[#315F86]" />
                    <span>Mở khóa</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-[#315F86]" />
                    <span>Khóa đối tượng</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  onBringForward();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium"
              >
                <ArrowUp className="w-4 h-4 text-[#315F86]" />
                <span>Đưa lên trên</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSendBackward();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F8F3E8] active:scale-98 transition-all text-xs font-medium"
              >
                <ArrowDown className="w-4 h-4 text-[#315F86]" />
                <span>Đưa xuống dưới</span>
              </button>

              <div className="pt-2 border-t border-[#ECE6DC]" />

              <button
                type="button"
                onClick={() => {
                  onDeleteTarget();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-[#F6DADD] text-[#B3535D] active:scale-98 transition-all text-xs font-semibold"
              >
                <Trash2 className="w-4 h-4 text-[#B3535D]" />
                <span>Xóa đối tượng</span>
              </button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
