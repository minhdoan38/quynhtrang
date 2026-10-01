'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Image as ImageIcon,
  Type,
  Smile,
  Shapes,
  QrCode,
  Barcode,
  ArrowLeft,
  X,
  Camera,
  FolderOpen,
  ImagePlus,
  AlertCircle,
  Square,
  RectangleHorizontal,
  Circle,
  Triangle,
  Minus,
  Search,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import {
  ADD_MENU_ITEMS,
  SHAPE_DEFINITIONS,
  getProviderStatus,
  getPublishedStickers,
  type AddContentType,
  type AddSubflow,
  type ImageSourceType,
  type TextStylePreset,
  type ShapePrimitiveType,
  type PublishedSticker,
} from '@/lib/add-content';
import { ImageSourceChooser } from './image-source-chooser';
interface AddContentSheetProps {
  onClose: () => void;
  onSelectImageSource: (source: ImageSourceType) => void;
  onSelectTextStyle: (preset: TextStylePreset) => void;
  onSelectShape: (shape: ShapePrimitiveType) => void;
  onSelectSticker?: (sticker: PublishedSticker) => void;
}

export function AddContentSheet({
  onClose,
  onSelectImageSource,
  onSelectTextStyle,
  onSelectShape,
  onSelectSticker,
}: AddContentSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [subflow, setSubflow] = useState<AddSubflow>({ mode: 'root' });
  const [stickers, setStickers] = useState<PublishedSticker[]>([]);
  const [stickerQuery, setStickerQuery] = useState('');
  const [stickerCategory, setStickerCategory] = useState('all');
  const [stickerLoading, setStickerLoading] = useState(false);
  const [stickerError, setStickerError] = useState(false);
  const [stickerAttempt, setStickerAttempt] = useState(0);

  useEffect(() => {
    if (subflow.mode !== 'sticker-browser') return;
    let active = true;
    setStickerLoading(true);
    setStickerError(false);
    getPublishedStickers()
      .then((items) => {
        if (!active) return;
        setStickers(items);
        setStickerLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setStickerError(true);
        setStickerLoading(false);
      });
    return () => { active = false; };
  }, [subflow.mode, stickerAttempt]);

  const stickerCategories = useMemo(
    () => Array.from(new Set(stickers.map((sticker) => sticker.category).filter(Boolean))),
    [stickers]
  );
  const visibleStickers = useMemo(() => {
    const query = stickerQuery.trim().toLocaleLowerCase('vi');
    return stickers.filter((sticker) => {
      if (stickerCategory !== 'all' && sticker.category !== stickerCategory) return false;
      if (!query) return true;
      return [sticker.title, sticker.id, sticker.category, ...sticker.tags]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('vi').includes(query));
    });
  }, [stickerCategory, stickerQuery, stickers]);

  // GSAP animation for subflow replacement (smooth lateral transition without sheet stacking)
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          reduceMotion: '(prefers-reduced-motion: reduce)',
        },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };
          if (reduceMotion) {
            gsap.set('.add-flow-content', { opacity: 1, x: 0 });
            return;
          }

          gsap.fromTo(
            '.add-flow-content',
            { opacity: 0, x: subflow.mode === 'root' ? -10 : 10 },
            {
              opacity: 1,
              x: 0,
              duration: 0.22,
              ease: 'power2.out',
              clearProps: 'transform',
            }
          );
        }
      );
      return () => mm.revert();
    },
    { dependencies: [subflow.mode], scope: containerRef }
  );

  const handleTileClick = (id: AddContentType) => {
    switch (id) {
      case 'image':
        setSubflow({ mode: 'image-source' });
        break;
      case 'text':
        setSubflow({ mode: 'text-style' });
        break;
      case 'sticker':
        setSubflow({ mode: 'sticker-browser' });
        break;
      case 'shape':
        setSubflow({ mode: 'shape-browser' });
        break;
      case 'qr':
        setSubflow({ mode: 'qr-generator' });
        break;
      case 'barcode':
        setSubflow({ mode: 'barcode-generator' });
        break;
    }
  };

  const renderIcon = (id: AddContentType, isPrimary: boolean) => {
    const iconClass = isPrimary ? 'w-5 h-5 text-[#315F86]' : 'w-5 h-5 text-[#2E3338]';
    switch (id) {
      case 'image':
        return <ImageIcon className={iconClass} />;
      case 'text':
        return <Type className={iconClass} />;
      case 'sticker':
        return <Smile className={iconClass} />;
      case 'shape':
        return <Shapes className={iconClass} />;
      case 'qr':
        return <QrCode className={iconClass} />;
      case 'barcode':
        return <Barcode className={iconClass} />;
    }
  };

  const renderShapeIcon = (type: ShapePrimitiveType) => {
    switch (type) {
      case 'square':
        return <Square className="w-4 h-4 text-[#315F86]" />;
      case 'rectangle':
      case 'rounded-rectangle':
        return <RectangleHorizontal className="w-4 h-4 text-[#315F86]" />;
      case 'circle':
      case 'oval':
        return <Circle className="w-4 h-4 text-[#315F86]" />;
      case 'triangle':
        return <Triangle className="w-4 h-4 text-[#315F86]" />;
      case 'line':
        return <Minus className="w-4 h-4 text-[#315F86]" />;
    }
  };

  return (
    <div ref={containerRef} className="space-y-3 py-1">
      {/* Top Header with Contextual Back & Title */}
      <div className="flex items-center justify-between border-b border-[#ECE6DC] pb-2.5">
        <div className="flex items-center gap-1.5 min-h-[32px]">
          {subflow.mode !== 'root' ? (
            <button
              type="button"
              onClick={() => setSubflow({ mode: 'root' })}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#2E3338] hover:text-[#315F86] p-1 -ml-1 rounded-md"
              aria-label="Quay lại danh mục thêm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Thêm</span>
            </button>
          ) : (
            <span className="text-sm font-semibold text-[#2E3338]">Thêm</span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-[#666A6D] hover:bg-[#F8F3E8] hover:text-[#2E3338]"
          aria-label="Đóng bảng thêm"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 1. ROOT ADD MENU (6 content types in 2-column grid) */}
      {subflow.mode === 'root' && (
        <div className="add-flow-content grid grid-cols-2 gap-2.5 pt-1">
          {ADD_MENU_ITEMS.map((item) => {
            const isPrimary = item.priority === 'primary';
            const isUtility = item.priority === 'utility';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTileClick(item.id)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.98] ${isPrimary
                  ? 'border-[#315F86]/30 bg-white hover:border-[#315F86] shadow-xs'
                  : isUtility
                    ? 'border-[#ECE6DC] bg-[#FFFDF8] hover:bg-white text-[#666A6D]'
                    : 'border-[#ECE6DC] bg-white hover:bg-[#F8F3E8]'
                  }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPrimary
                    ? 'bg-[#DCEBF4]'
                    : isUtility
                      ? 'bg-[#ECE6DC]/60'
                      : 'bg-[#F8F3E8]'
                    }`}
                >
                  {renderIcon(item.id, isPrimary)}
                </div>
                <div className="min-w-0">
                  <span
                    className={`block text-xs truncate ${isPrimary ? 'font-bold text-[#2E3338]' : 'font-semibold text-[#2E3338]'
                      }`}
                  >
                    {item.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 2. IMAGE SOURCE SUBFLOW */}
      {subflow.mode === 'image-source' && (
        <div className="add-flow-content pt-1">
          <ImageSourceChooser
            context={{ mode: 'add' }}
            showBack={true}
            onBack={() => setSubflow({ mode: 'root' })}
            onClose={onClose}
            onSelectSource={(source) => {
              onClose();
              onSelectImageSource(source);
            }}
          />
        </div>
      )}

      {/* 3. TEXT STYLE SUBFLOW (Heading vs Body) */}
      {subflow.mode === 'text-style' && (
        <div className="add-flow-content space-y-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectTextStyle('heading');
            }}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-[#315F86]/30 bg-white hover:border-[#315F86] transition-all text-left shadow-xs"
          >
            <div className="w-9 h-9 rounded-lg bg-[#DCEBF4] text-[#315F86] flex items-center justify-center shrink-0 font-bold text-sm">
              H
            </div>
            <div>
              <span className="block text-sm font-bold text-[#2E3338]">Thêm tiêu đề</span>
              <span className="block text-xs text-[#666A6D]">Nhập tiêu đề</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectTextStyle('body');
            }}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] transition-all text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-[#F8F3E8] text-[#2E3338] flex items-center justify-center shrink-0 text-xs font-medium">
              Aa
            </div>
            <div>
              <span className="block text-xs font-semibold text-[#2E3338]">Thêm nội dung</span>
              <span className="block text-xs text-[#666A6D]">Nhập nội dung</span>
            </div>
          </button>
        </div>
      )}

      {/* 4. SHAPE BROWSER SUBFLOW */}
      {subflow.mode === 'shape-browser' && (
        <div className="add-flow-content space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            {SHAPE_DEFINITIONS.map((shape) => (
              <button
                key={shape.type}
                type="button"
                onClick={() => {
                  onClose();
                  onSelectShape(shape.type);
                }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-[#ECE6DC] bg-white hover:bg-[#F8F3E8] active:scale-95 transition-all text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-[#DCEBF4] flex items-center justify-center shrink-0">
                  {renderShapeIcon(shape.type)}
                </div>
                <span className="text-xs font-semibold text-[#2E3338] truncate">{shape.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. STICKER BROWSER */}
      {subflow.mode === 'sticker-browser' && (
        <div className="add-flow-content space-y-3 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666A6D]" />
            <input
              type="search"
              value={stickerQuery}
              onChange={(event) => setStickerQuery(event.target.value)}
              placeholder="Tìm sticker..."
              aria-label="Tìm sticker"
              className="h-10 w-full rounded-xl border border-[#DDD6CC] bg-white pl-9 pr-3 text-xs focus:border-[#315F86] focus:outline-none"
            />
          </div>
          {stickerCategories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Danh mục sticker">
              {['all', ...stickerCategories].map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setStickerCategory(category)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${stickerCategory === category ? 'bg-[#315F86] text-white' : 'bg-[#F8F3E8] text-[#2E3338]'}`}
                >
                  {category === 'all' ? 'Tất cả' : category}
                </button>
              ))}
            </div>
          )}
          {stickerLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-xs text-[#666A6D]"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải sticker...</div>
          ) : stickerError ? (
            <div role="alert" className="space-y-3 rounded-xl border border-[#F5C7C0] bg-[#FDF0ED] p-5 text-center">
              <p className="text-xs font-semibold text-[#A63626]">Không thể tải bộ sưu tập sticker.</p>
              <button type="button" onClick={() => setStickerAttempt((attempt) => attempt + 1)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#315F86]"><RotateCcw className="h-3.5 w-3.5" /> Thử lại</button>
            </div>
          ) : visibleStickers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#DDD6CC] bg-[#FFFDF8] p-8 text-center text-xs font-medium text-[#666A6D]">Không tìm thấy sticker phù hợp</div>
          ) : (
            <div className="grid max-h-[48vh] grid-cols-3 gap-2 overflow-y-auto overscroll-contain">
              {visibleStickers.map((sticker) => {
                const src = sticker.thumbnailPath
                  ? `/api/library/sticker/${encodeURIComponent(sticker.id)}?thumb=true`
                  : `/api/library/sticker/${encodeURIComponent(sticker.id)}`;
                return (
                  <button
                    key={sticker.id}
                    type="button"
                    onClick={() => { onSelectSticker?.(sticker); onClose(); }}
                    className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-[#ECE6DC] bg-white p-2 hover:border-[#315F86] active:scale-95"
                    aria-label={`Thêm sticker ${sticker.title || sticker.id}`}
                  >
                    <img src={src} alt="" className="min-h-0 w-full flex-1 object-contain" loading="lazy" />
                    <span className="w-full truncate text-[10px] font-medium text-[#2E3338]">{sticker.title || sticker.id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. QR & BARCODE GENERATOR (Contract-only / Honest State) */}
      {(subflow.mode === 'qr-generator' || subflow.mode === 'barcode-generator') && (
        <div className="add-flow-content space-y-3 pt-2 text-center">
          <div className="p-4 rounded-xl border border-[#ECE6DC] bg-[#FFFDF8] text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-[#F8F3E8] flex items-center justify-center text-[#2E3338]">
              <AlertCircle className="w-5 h-5 text-[#A86E22]" />
            </div>
            <p className="text-xs font-semibold text-[#2E3338]">
              {subflow.mode === 'qr-generator'
                ? getProviderStatus('qr').message
                : getProviderStatus('barcode').message}
            </p>
            <p className="text-xs text-[#666A6D]">
              Tính năng tiện ích này yêu cầu thư viện mã hóa client-side bảo mật và sẽ sẵn sàng trong bản nâng cấp tiếp theo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
