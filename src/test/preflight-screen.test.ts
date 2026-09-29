import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createInitialState,
  type DesignState,
  type DesignSummary,
  type PreflightCheck,
  type PreflightResult,
} from '../lib/product-state.ts';

const preflightScreenPath = resolve(
  process.cwd(),
  'src/components/customizer/editor-preflight-mode.tsx',
);
const preflightScreenSource = readFileSync(preflightScreenPath, 'utf8');

const baseSummary: DesignSummary = {
  product: 'Thiệp gập đôi',
  variant: 'Ngang',
  quantity: 10,
  unitPrice: 25000,
  totalPrice: 250000,
  priceLabel: '250.000đ',
};

function createPreflight(overrides: Partial<PreflightResult> = {}): PreflightResult {
  const checks = overrides.checks ?? [];
  const errorCount = checks.filter((c) => c.level === 'error').length;
  const warningCount = checks.filter((c) => c.level === 'warning').length;
  const passCount = checks.filter((c) => c.level === 'pass').length;

  return {
    level: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'pass',
    checks,
    hasErrors: errorCount > 0,
    hasWarnings: warningCount > 0,
    passCount,
    warningCount,
    errorCount,
    ...overrides,
  };
}

function resolvePreflightStatus(preflight: PreflightResult): {
  title: string;
  description: string;
  isCheckoutDisabled: boolean;
} {
  const hasErrors = preflight.level === 'error' || preflight.hasErrors;
  const hasWarnings = !hasErrors && (preflight.level === 'warning' || preflight.hasWarnings);

  if (hasErrors) {
    return {
      title: 'Cần sửa trước khi tiếp tục',
      description: 'Vui lòng sửa các điểm dưới đây để đảm bảo chất lượng thành phẩm.',
      isCheckoutDisabled: true,
    };
  }

  if (hasWarnings) {
    return {
      title: 'Có một vài chỗ cần kiểm tra',
      description: 'Bạn có thể sửa các chi tiết dưới đây hoặc vẫn tiếp tục nếu thấy ổn.',
      isCheckoutDisabled: false,
    };
  }

  return {
    title: 'Thiết kế đã sẵn sàng',
    description: 'Mọi thứ trông ổn để tiếp tục đặt hàng.',
    isCheckoutDisabled: false,
  };
}

function sortPreflightIssues(checks: PreflightCheck[]): PreflightCheck[] {
  return checks
    .filter((check) => check.level === 'warning' || check.level === 'error')
    .sort((a, b) => (a.level === 'error' && b.level !== 'error' ? -1 : a.level !== 'error' && b.level === 'error' ? 1 : 0));
}

function handleIssueFixClick(
  check: PreflightCheck,
  onFix?: (check: PreflightCheck) => void,
  onBackToEdit?: (focusTarget?: 'image' | 'text') => void,
): void {
  if (onFix) {
    onFix(check);
    return;
  }
  onBackToEdit?.(check.category === 'image' ? 'image' : undefined);
}

test('preflight screen source matches contract and required customer terminology', () => {
  assert.match(preflightScreenSource, /export interface EditorPreflightModeProps/);
  assert.match(preflightScreenSource, /onFix\?:\s*\(check:\s*PreflightCheck\)\s*=>\s*void;/);
  assert.match(preflightScreenSource, /Kiểm tra thiết kế/);
  assert.match(preflightScreenSource, /\{summary\.product\}\s*·\s*\{summary\.variant\}/);
  assert.match(preflightScreenSource, /Cần sửa trước khi tiếp tục/);
  assert.match(preflightScreenSource, /Vui lòng sửa các điểm dưới đây để đảm bảo chất lượng thành phẩm\./);
  assert.match(preflightScreenSource, /Có một vài chỗ cần kiểm tra/);
  assert.match(preflightScreenSource, /Bạn có thể sửa các chi tiết dưới đây hoặc vẫn tiếp tục nếu thấy ổn\./);
  assert.match(preflightScreenSource, /Thiết kế đã sẵn sàng/);
  assert.match(preflightScreenSource, /Mọi thứ trông ổn để tiếp tục đặt hàng\./);
  assert.match(preflightScreenSource, />Sửa<\/span>/);
  assert.match(preflightScreenSource, /\{preflight\.passCount\}\s*kiểm tra đã đạt tiêu chuẩn/);
  assert.match(preflightScreenSource, /Kiểm tra lại chữ, tên, ngày tháng và thông tin quan trọng trước khi đặt in\./);
  assert.match(preflightScreenSource, />Quay lại sửa<\/span>/);
  assert.match(preflightScreenSource, />Tiếp tục đặt in<\/span>/);
  assert.match(preflightScreenSource, /disabled=\{hasErrors\}/);
});

test('status resolver evaluates pass, warning, and error states correctly', () => {
  const passResult = createPreflight({ level: 'pass', checks: [], passCount: 2 });
  const passStatus = resolvePreflightStatus(passResult);
  assert.equal(passStatus.title, 'Thiết kế đã sẵn sàng');
  assert.equal(passStatus.description, 'Mọi thứ trông ổn để tiếp tục đặt hàng.');
  assert.equal(passStatus.isCheckoutDisabled, false);

  const warningResult = createPreflight({
    level: 'warning',
    hasWarnings: true,
    warningCount: 1,
    checks: [
      {
        id: 'warn-1',
        level: 'warning',
        label: 'Chi tiết hơi sát mép',
        description: 'Kéo vào trong một chút.',
      },
    ],
  });
  const warningStatus = resolvePreflightStatus(warningResult);
  assert.equal(warningStatus.title, 'Có một vài chỗ cần kiểm tra');
  assert.equal(warningStatus.description, 'Bạn có thể sửa các chi tiết dưới đây hoặc vẫn tiếp tục nếu thấy ổn.');
  assert.equal(warningStatus.isCheckoutDisabled, false);

  const errorResult = createPreflight({
    level: 'error',
    hasErrors: true,
    errorCount: 1,
    checks: [
      {
        id: 'err-1',
        level: 'error',
        label: 'Chưa có nội dung',
        description: 'Thêm nội dung trước khi in.',
      },
    ],
  });
  const errorStatus = resolvePreflightStatus(errorResult);
  assert.equal(errorStatus.title, 'Cần sửa trước khi tiếp tục');
  assert.equal(errorStatus.description, 'Vui lòng sửa các điểm dưới đây để đảm bảo chất lượng thành phẩm.');
  assert.equal(errorStatus.isCheckoutDisabled, true);
});

test('issue cards filter pass checks and sort errors before warnings', () => {
  const checks: PreflightCheck[] = [
    { id: 'pass-1', level: 'pass', label: 'Pass Check' },
    { id: 'warn-1', level: 'warning', label: 'Warning Check' },
    { id: 'err-1', level: 'error', label: 'Error Check' },
  ];

  const sortedIssues = sortPreflightIssues(checks);
  assert.deepEqual(
    sortedIssues.map((item) => item.id),
    ['err-1', 'warn-1'],
  );
});

test('clicking fix button triggers onFix or falls back to onBackToEdit with target', () => {
  const imageWarning: PreflightCheck = {
    id: 'img-1',
    level: 'warning',
    category: 'image',
    label: 'Ảnh mờ',
  };
  const textError: PreflightCheck = {
    id: 'txt-1',
    level: 'error',
    category: 'safe-area',
    label: 'Chữ ngoài mép',
  };

  const fixedChecks: PreflightCheck[] = [];
  handleIssueFixClick(textError, (check) => fixedChecks.push(check));
  assert.equal(fixedChecks.length, 1);
  assert.equal(fixedChecks[0]?.id, 'txt-1');

  const backTargets: Array<'image' | 'text' | undefined> = [];
  handleIssueFixClick(imageWarning, undefined, (target) => backTargets.push(target));
  handleIssueFixClick(textError, undefined, (target) => backTargets.push(target));

  assert.deepEqual(backTargets, ['image', undefined]);
});

test('component source maintains summary details, pass count box, and disabled button behavior', () => {
  assert.match(
    preflightScreenSource,
    /const issues = preflight\.checks\s*\.filter\(\(check\) => check\.level === 'warning' \|\| check\.level === 'error'\)\s*\.sort\(\(a, b\) => \(a\.level === 'error' && b\.level !== 'error' \? -1 : a\.level !== 'error' && b\.level === 'error' \? 1 : 0\)\);/,
  );
  assert.match(
    preflightScreenSource,
    /onFix\s*\?\s*onFix\(check\)\s*:\s*onBackToEdit\(check\.category === 'image' \? 'image' : undefined\)/,
  );
  assert.match(
    preflightScreenSource,
    /preflight\.passCount > 0 && \(\s*<div className="rounded-xl border border-\[#DDD6CC\] bg-\[#F8F3E8\]\/40 p-3 flex items-center gap-2\.5 text-xs text-\[#5F7E67\] font-medium">/,
  );
  assert.match(
    preflightScreenSource,
    /disabled=\{hasErrors\}[\s\S]*?disabled:cursor-not-allowed disabled:opacity-50/,
  );

  const state: DesignState = createInitialState('notebook');
  assert.equal(state.productId, 'notebook');
  assert.equal(baseSummary.product, 'Thiệp gập đôi');
});
