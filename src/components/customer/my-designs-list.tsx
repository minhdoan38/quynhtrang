'use client';

import React from 'react';
import Link from 'next/link';
import { Palette, ArrowRight, Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignCanvas } from '@/components/customizer/design-canvas';
import { formatProjectUpdatedDate } from '@/lib/services/customer-auth.ts';
import type { DesignState, ProductId } from '@/lib/product-state.ts';

export { formatProjectUpdatedDate };

export interface CustomerProjectItem {
  id: string;
  productId: ProductId;
  variantId: string;
  templateId?: string | null;
  text?: string;
  document: DesignState;
  revision: number;
  updatedAt: string;
}

export interface MyDesignsListProps {
  projects: CustomerProjectItem[];
}

export function MyDesignsList({ projects }: MyDesignsListProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#DDD6CC] bg-white p-12 text-center max-w-md mx-auto my-8 space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#F8F3E8] flex items-center justify-center text-[#315F86] mx-auto">
          <Palette className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-[#2E3338]">Chưa có thiết kế nào</h2>
          <p className="text-xs text-[#666A6D] mt-1">
            Bắt đầu sáng tạo giấy gói quà, thiệp, sticker hoặc bìa sổ tay của riêng bạn ngay bây giờ.
          </p>
        </div>
        <Link href="/products" className="inline-block pt-2">
          <Button className="h-10 px-5 bg-[#315F86] hover:bg-[#244A69] text-white text-xs font-semibold rounded-xl gap-1.5">
            <Sparkles className="w-4 h-4" />
            <span>Bắt đầu thiết kế mới</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => {
        const doc = project.document;
        const updatedTimeMs = new Date(project.updatedAt).getTime();
        const timeAgo = formatProjectUpdatedDate(updatedTimeMs);

        return (
          <div
            key={project.id}
            className="rounded-2xl border border-[#ECE6DC] bg-white p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
          >
            {/* Visual Canvas Preview */}
            <div className="w-full aspect-square rounded-xl bg-[#F8F3E8] border border-[#ECE6DC] overflow-hidden flex items-center justify-center relative">
              <div className="scale-[0.5] sm:scale-[0.55] transform origin-center pointer-events-none">
                <DesignCanvas
                  productId={doc.productId}
                  text={doc.text}
                  color={doc.color}
                  backgroundColor={doc.backgroundColor}
                  image={doc.image}
                  productOptions={doc.productOptions}
                />
              </div>
            </div>

            {/* Metadata & Actions */}
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-sm text-[#2E3338] truncate capitalize">
                  {doc.productId === 'wrapping' && 'Giấy gói quà'}
                  {doc.productId === 'card' && 'Thiệp chúc mừng'}
                  {doc.productId === 'sticker' && 'Sticker dán'}
                  {doc.productId === 'notebook' && 'Bìa sổ tay'}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-[#666A6D] mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Cập nhật {timeAgo}</span>
                </div>
              </div>

              <Link
                href={`/?project=${project.id}`}
                className="block w-full"
              >
                <Button
                  variant="outline"
                  className="w-full h-9 border-[#DDD6CC] hover:bg-[#F8F3E8] text-[#2E3338] text-xs font-semibold rounded-lg gap-1.5"
                >
                  <span>Tiếp tục chỉnh sửa</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
