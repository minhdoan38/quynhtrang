import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { requireCurrentStaff } from '@/lib/admin/authorization.ts';
import { createServerSupabaseClient } from '@/lib/supabase/server.ts';
import { AssetRepository } from '@/lib/repositories/asset-repository.ts';

const MAX_BYTE_SIZE = 20 * 1024 * 1024; // 20 MiB

function validateMagicBytes(buffer: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    if (buffer.length < 12) return false;
    const isRiff =
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp =
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireCurrentStaff();
    const { id: orderId } = await props.params;

    const formData = await request.formData();
    const file = formData.get('file');
    const draftId = formData.get('draftId');
    const kind = (formData.get('kind') as string) || 'image';

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_FILE', message: 'Tập tin tải lên không hợp lệ' },
        { status: 400 }
      );
    }

    if (!draftId || typeof draftId !== 'string') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_DRAFT', message: 'Mã bản nháp không hợp lệ' },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTE_SIZE) {
      return NextResponse.json(
        { ok: false, code: 'FILE_TOO_LARGE', message: 'Dung lượng tập tin vượt quá giới hạn 20MB' },
        { status: 413 }
      );
    }

    const mimeType = file.type.toLowerCase();
    if (mimeType === 'image/svg+xml') {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN_MIME', message: 'Không chấp nhận tải lên định dạng SVG qua cổng này' },
        { status: 415 }
      );
    }

    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
      return NextResponse.json(
        { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Chỉ chấp nhận định dạng PNG, JPEG hoặc WebP' },
        { status: 415 }
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, mimeType)) {
      return NextResponse.json(
        { ok: false, code: 'CORRUPTED_FILE', message: 'Tập tin hình ảnh không khớp định dạng khai báo hoặc bị lỗi' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Verify draft ownership and lease
    const { data: draft, error: draftError } = await supabase
      .from('design_revision_drafts')
      .select('id, order_id, project_id, status, editor_user_id, lease_expires_at')
      .eq('id', draftId)
      .eq('order_id', orderId)
      .maybeSingle();

    if (draftError || !draft) {
      return NextResponse.json(
        { ok: false, code: 'DRAFT_NOT_FOUND', message: 'Bản nháp không tồn tại' },
        { status: 404 }
      );
    }

    if (draft.status !== 'editing' && draft.status !== 'ready_for_review') {
      return NextResponse.json(
        { ok: false, code: 'DRAFT_CLOSED', message: 'Bản nháp đã đóng' },
        { status: 409 }
      );
    }

    if (draft.editor_user_id !== staff.userId) {
      return NextResponse.json(
        { ok: false, code: 'LEASE_LOST', message: 'Bạn không phải là người đang giữ quyền sửa bản nháp này' },
        { status: 403 }
      );
    }

    const assetId = randomUUID();
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `drafts/${draftId}/${assetId}.${extension}`;
    const checksum = createHash('sha256').update(buffer).digest('hex');

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from('customer-assets')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, code: 'STORAGE_ERROR', message: `Lỗi lưu trữ: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const assetRepo = new AssetRepository(supabase);
    await assetRepo.create({
      projectId: draft.project_id,
      kind,
      storageBucket: 'customer-assets',
      storagePath,
      originalName: file.name,
      mimeType,
      byteSize: buffer.length,
      checksum,
    });

    await assetRepo.attachDraftAsset({
      draftId,
      assetId,
      kind,
      checksum,
    });

    return NextResponse.json({
      ok: true,
      assetId,
      url: `/api/assets/${assetId}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      { ok: false, code: 'SERVER_ERROR', message },
      { status: 500 }
    );
  }
}
