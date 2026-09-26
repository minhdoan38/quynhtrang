import React from 'react';
import type { ProductId } from '@/lib/product-state';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';

interface ProductControlsProps {
  productId: ProductId;
  text: string;
  color: string;
  backgroundColor: string;
  productOptions: Record<string, unknown>;
  onSetText: (val: string) => void;
  onSetColor: (val: string) => void;
  onSetBackgroundColor: (val: string) => void;
  onSetOption: (key: string, val: unknown) => void;
}

export function ProductControls({
  productId,
  text,
  color,
  backgroundColor,
  productOptions,
  onSetText,
  onSetColor,
  onSetBackgroundColor,
  onSetOption,
}: ProductControlsProps) {
  return (
    <div id="product-controls" className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="design-text" className="text-sm font-semibold">
          Dòng chữ của bạn
        </Label>
        <Textarea
          id="design-text"
          value={text}
          onChange={(e) => onSetText(e.target.value)}
          placeholder="Ví dụ: Chúc mừng sinh nhật"
          rows={2}
          maxLength={160}
          className="resize-none"
        />
        <span className="text-xs text-muted-foreground block text-right">
          {text.length}/160 ký tự
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="text-color" className="text-xs font-medium">
            Màu chữ
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="text-color"
              type="color"
              value={color}
              onChange={(e) => onSetColor(e.target.value)}
              className="h-9 w-14 p-1 cursor-pointer"
            />
            <span className="text-xs font-mono">{color}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="background-color" className="text-xs font-medium">
            Màu nền
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="background-color"
              type="color"
              value={backgroundColor}
              onChange={(e) => onSetBackgroundColor(e.target.value)}
              className="h-9 w-14 p-1 cursor-pointer"
            />
            <span className="text-xs font-mono">{backgroundColor}</span>
          </div>
        </div>
      </div>

      {productId === 'wrapping' && (
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Lặp họa tiết</Label>
            <RadioGroup
              value={String(productOptions.mode || 'repeat')}
              onValueChange={(val) => onSetOption('mode', val)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="repeat" id="mode-repeat" />
                <Label htmlFor="mode-repeat" className="text-xs cursor-pointer">Lặp đều</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="single" id="mode-single" />
                <Label htmlFor="mode-single" className="text-xs cursor-pointer">Một lần</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Cách sắp xếp</Label>
            <RadioGroup
              value={String(productOptions.repeatStyle || 'regular')}
              onValueChange={(val) => onSetOption('repeatStyle', val)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="regular" id="style-reg" />
                <Label htmlFor="style-reg" className="text-xs cursor-pointer">Đều</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="scattered" id="style-scat" />
                <Label htmlFor="style-scat" className="text-xs cursor-pointer">Tự nhiên</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="brick" id="style-brick" />
                <Label htmlFor="style-brick" className="text-xs cursor-pointer">Xếp lệch</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span>Kích thước họa tiết</span>
              <span>{Number(productOptions.patternScale) || 100}%</span>
            </div>
            <Slider
              value={[Number(productOptions.patternScale) || 100]}
              min={50}
              max={200}
              step={5}
              onValueChange={(val) => {
                const num = Array.isArray(val) ? val[0] : typeof val === 'number' ? val : 100;
                onSetOption('patternScale', num);
              }}
            />
          </div>
        </div>
      )}

      {productId === 'card' && (
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Mặt đang chỉnh</Label>
            <RadioGroup
              value={String(productOptions.surface || 'front')}
              onValueChange={(val) => onSetOption('surface', val)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="front" id="surface-front" />
                <Label htmlFor="surface-front" className="text-xs cursor-pointer">Mặt trước</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="inside" id="surface-inside" />
                <Label htmlFor="surface-inside" className="text-xs cursor-pointer">Mặt trong</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Cách gấp</Label>
            <RadioGroup
              value={String(productOptions.fold || 'half')}
              onValueChange={(val) => onSetOption('fold', val)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="half" id="fold-half" />
                <Label htmlFor="fold-half" className="text-xs cursor-pointer">Gấp đôi</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="flat" id="fold-flat" />
                <Label htmlFor="fold-flat" className="text-xs cursor-pointer">Tờ phẳng</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      )}

      {productId === 'sticker' && (
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="has-border"
              checked={Boolean(productOptions.hasWhiteBorder)}
              onChange={(e) => onSetOption('hasWhiteBorder', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <Label htmlFor="has-border" className="text-xs font-medium cursor-pointer">
              Có viền trắng
            </Label>
          </div>

          {Boolean(productOptions.hasWhiteBorder) && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span>Độ dày viền</span>
                <span>{Number(productOptions.borderWidth) || 0}px</span>
              </div>
              <Slider
                value={[Number(productOptions.borderWidth) || 0]}
                min={0}
                max={20}
                step={1}
                onValueChange={(val) => {
                  const num = Array.isArray(val) ? val[0] : typeof val === 'number' ? val : 0;
                  onSetOption('borderWidth', num);
                }}
              />
            </div>
          )}
        </div>
      )}

      {productId === 'notebook' && (
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Bề mặt bìa</Label>
            <RadioGroup
              value={String(productOptions.finish || 'matte')}
              onValueChange={(val) => onSetOption('finish', val)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="matte" id="finish-matte" />
                <Label htmlFor="finish-matte" className="text-xs cursor-pointer">Mờ</Label>
              </div>
              <div className="flex items-center space-x-1.5">
                <RadioGroupItem value="glossy" id="finish-glossy" />
                <Label htmlFor="finish-glossy" className="text-xs cursor-pointer">Bóng</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      )}
    </div>
  );
}
