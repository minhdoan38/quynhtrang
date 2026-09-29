import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('StickerBorderSheet exports as a valid component with required contract', () => {
  const componentPath = resolve(
    process.cwd(),
    'src/components/customizer/sticker-border-sheet.tsx'
  );
  const source = readFileSync(componentPath, 'utf8');

  assert.match(
    source,
    /export\s+function\s+StickerBorderSheet\s*\(/,
    'Component must export a function named StickerBorderSheet'
  );
  assert.match(
    source,
    /export\s+interface\s+StickerBorderSheetProps/,
    'Component must export StickerBorderSheetProps interface'
  );
  assert.match(
    source,
    /open:\s*boolean;/,
    'Props must include open'
  );
  assert.match(
    source,
    /onOpenChange:\s*\(open:\s*boolean\)\s*=>\s*void;/,
    'Props must include onOpenChange'
  );
  assert.match(
    source,
    /options:\s*StickerOptions;/,
    'Props must include options'
  );
  assert.match(
    source,
    /contourResult:\s*StickerContourResult;/,
    'Props must include contourResult'
  );
  assert.match(
    source,
    /onChangeOptions:\s*\(patch:\s*Partial<StickerOptions>\)\s*=>\s*void;/,
    'Props must include onChangeOptions'
  );
  assert.match(
    source,
    /onCommitOptions:\s*\(patch:\s*Partial<StickerOptions>\)\s*=>\s*void;/,
    'Props must include onCommitOptions'
  );
  assert.match(
    source,
    /onTriggerBackgroundRemoval\?:\s*\(\)\s*=>\s*void;/,
    'Props must include optional onTriggerBackgroundRemoval'
  );
});

test('StickerBorderSheet implements Vietnamese copy, status messages, and controls', () => {
  const componentPath = resolve(
    process.cwd(),
    'src/components/customizer/sticker-border-sheet.tsx'
  );
  const source = readFileSync(componentPath, 'utf8');

  // Header & status copy
  assert.match(source, /Viền sticker/);
  assert.match(source, /✓ Hình cắt ổn/);
  assert.match(source, /⚠ Một số chi tiết đang tách rời/);
  assert.match(
    source,
    /Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker\./
  );
  assert.match(source, /⚠ Có chi tiết quá nhỏ/);
  assert.match(source, /Tăng viền hoặc đơn giản thiết kế\./);
  assert.match(
    source,
    /Muốn sticker cắt theo chủ thể\? Hãy xóa nền ảnh trước\./
  );
  assert.match(source, /Xóa nền ảnh/);

  // Switch and slider copy
  assert.match(source, /Viền trắng/);
  assert.match(source, /Độ dày viền/);
  assert.match(source, /Mỏng/);
  assert.match(source, /Dày/);
  assert.match(source, /Xem đường cắt/);

  // Range and step limits
  assert.match(source, /min=["']0["']/);
  assert.match(source, /max=["']6["']/);
  assert.match(source, /step=["']0\.5["']/);

  // Prohibited terms in customer copy
  const customerCopy = [
    'Viền sticker',
    'Viền trắng',
    'Xem đường cắt',
    'Mỏng',
    'Dày',
    'Hình cắt ổn',
    'Một số chi tiết đang tách rời',
    'Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker.',
    'Có chi tiết quá nhỏ',
    'Tăng viền hoặc đơn giản thiết kế.',
    'Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước.',
    'Xóa nền ảnh',
  ].join(' ');
  assert.equal(/contour|offset path|vector cutline|alpha threshold|bleed/i.test(customerCopy), false);
});

test('StickerBorderSheet integrates with bottom navigation, editor sheets, and customizer shell', () => {
  const bottomNavPath = resolve(
    process.cwd(),
    'src/components/customizer/bottom-navigation.tsx'
  );
  const bottomNavSource = readFileSync(bottomNavPath, 'utf8');
  assert.match(bottomNavSource, /productId === 'sticker' && !selectedId/);
  assert.match(bottomNavSource, /Viền sticker/);
  assert.match(bottomNavSource, /onAction\('sticker-border'\)/);

  const editorSheetsPath = resolve(
    process.cwd(),
    'src/components/customizer/editor-sheets.tsx'
  );
  const editorSheetsSource = readFileSync(editorSheetsPath, 'utf8');
  assert.match(editorSheetsSource, /'sticker-border'/);
  assert.match(editorSheetsSource, /<StickerBorderSheet/);

  const shellPath = resolve(
    process.cwd(),
    'src/components/customizer/customizer-shell.tsx'
  );
  const shellSource = readFileSync(shellPath, 'utf8');
  assert.match(
    shellSource,
    /useMemo\(\s*\(\)\s*=>\s*computeStickerContour\(state\.elements,\s*state\.productOptions as StickerOptions\),\s*\[state\.elements,\s*state\.productOptions\]\s*\)/
  );
  assert.match(shellSource, /case 'sticker-border':/);
  assert.match(shellSource, /stickerOptions=\{state\.productId === 'sticker'/);
  assert.match(shellSource, /stickerContourResult=\{state\.productId === 'sticker'/);
  assert.match(shellSource, /onTriggerBackgroundRemoval=\{/);
});
