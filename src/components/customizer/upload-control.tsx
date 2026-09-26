import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Trash2 } from 'lucide-react';
import type { ImageState } from '@/lib/product-state';

interface UploadControlProps {
  image: ImageState | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export function UploadControl({ image, onUpload, onRemove }: UploadControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        onChange={handleFileChange}
        className="hidden"
        id="image-upload-input"
        data-action="upload-image"
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs flex items-center gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          {image ? 'Đổi ảnh khác' : 'Tải ảnh lên'}
        </Button>

        {image && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-xs text-destructive hover:bg-destructive/10 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa ảnh
          </Button>
        )}
      </div>

      {image && (
        <p className="text-xs text-muted-foreground truncate max-w-[260px]">
          {image.name} ({image.width || 0}×{image.height || 0}px)
        </p>
      )}
    </div>
  );
}
