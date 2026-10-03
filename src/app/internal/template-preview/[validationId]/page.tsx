import { createHmac, timingSafeEqual } from 'node:crypto';
import { notFound } from 'next/navigation.js';
import type { DesignState } from '@/lib/product-state';
import { CustomizerShell } from '@/components/customizer/customizer-shell';
import { getSupabaseSecretKey } from '@/lib/supabase/config.ts';
import { createPrivilegedSupabaseClient } from '@/lib/supabase/admin.ts';

interface TemplatePreviewPageProps {
  params: Promise<{ validationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getPreviewSecret(): string | null {
  const customToken = process.env.INTERNAL_RENDER_TOKEN?.trim();
  if (customToken) return customToken;
  const supabaseSecret = getSupabaseSecretKey()?.trim();
  if (supabaseSecret) return supabaseSecret;
  return null;
}

function checkAuthorization(
  validationId: string,
  sig?: string,
  exp?: string,
  token?: string,
): boolean {
  const secret = getPreviewSecret();
  if (!secret) return false;

  if (token) {
    const expected = Buffer.from(secret, 'utf-8');
    const provided = Buffer.from(token, 'utf-8');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  if (sig && exp) {
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || Date.now() > expNum) return false;

    const hmac = createHmac('sha256', secret);
    hmac.update(`${validationId}:${exp}`);
    const expectedSig = hmac.digest('hex');

    const expectedBuffer = Buffer.from(expectedSig, 'utf-8');
    const providedBuffer = Buffer.from(sig, 'utf-8');
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  return false;
}

export default async function InternalTemplatePreviewPage({
  params,
  searchParams,
}: TemplatePreviewPageProps) {
  const { validationId } = await params;
  const search = await searchParams;

  const sig = resolveParam(search.sig);
  const exp = resolveParam(search.exp);
  const token = resolveParam(search.token);

  if (!checkAuthorization(validationId, sig, exp, token)) {
    notFound();
  }

  let supabase;
  try {
    supabase = createPrivilegedSupabaseClient();
  } catch {
    notFound();
  }

  // 1. Try to load from template_validation_runs
  const { data: run } = await supabase
    .from('template_validation_runs')
    .select('id, template_id, draft_id, expires_at')
    .eq('id', validationId)
    .maybeSingle();

  let templateId: string | undefined;
  let document: DesignState | null = null;

  if (run) {
    if (new Date(run.expires_at).getTime() < Date.now()) {
      notFound();
    }
    templateId = run.template_id;
    const { data: draft } = await supabase
      .from('template_drafts')
      .select('design_document')
      .eq('id', run.draft_id)
      .maybeSingle();

    if (draft?.design_document && typeof draft.design_document === 'object') {
      document = draft.design_document as unknown as DesignState;
    }
  } else {
    // 2. Direct draft lookup
    const { data: draft } = await supabase
      .from('template_drafts')
      .select('template_id, design_document')
      .eq('id', validationId)
      .maybeSingle();

    if (draft?.design_document && typeof draft.design_document === 'object') {
      templateId = draft.template_id;
      document = draft.design_document as unknown as DesignState;
    }
  }

  if (!document) {
    notFound();
  }

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#F8F3E8]">
      <CustomizerShell
        context={{
          type: 'template-preview',
          templateId,
          initialDocument: document,
        }}
      />
    </main>
  );
}
