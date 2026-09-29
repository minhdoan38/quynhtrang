import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('ImageQualitySheet exports as a valid component with required contract', () => {
  const componentPath = resolve(
    process.cwd(),
    'src/components/customizer/image-quality-sheet.tsx'
  );
  const source = readFileSync(componentPath, 'utf8');

  assert.match(
    source,
    /export\s+function\s+ImageQualitySheet\s*\(/,
    'Component must export a function named ImageQualitySheet'
  );
  assert.match(
    source,
    /export\s+interface\s+ImageQualitySheetProps/,
    'Component must export ImageQualitySheetProps interface'
  );
  assert.match(source, /open:\s*boolean;/, 'Props must include open');
  assert.match(
    source,
    /onOpenChange:\s*\(open:\s*boolean\)\s*=>\s*void;/,
    'Props must include onOpenChange'
  );
  assert.match(
    source,
    /report:\s*ImageQualityReport\s*\|\s*null;/,
    'Props must include report'
  );
  assert.match(
    source,
    /onScaleDown\?:\s*\(recommendedScale:\s*number\)\s*=>\s*void;/,
    'Props must include optional onScaleDown'
  );
  assert.match(
    source,
    /onReplaceImage\?:\s*\(\)\s*=>\s*void;/,
    'Props must include optional onReplaceImage'
  );
});

test('ImageQualitySheet implements Vietnamese headers, labels, and action buttons', () => {
  const componentPath = resolve(
    process.cwd(),
    'src/components/customizer/image-quality-sheet.tsx'
  );
  const source = readFileSync(componentPath, 'utf8');

  assert.match(source, /Chất lượng in ảnh/);
  assert.match(source, /Thu nhỏ ảnh/);
  assert.match(source, /Thay ảnh/);
  assert.match(source, /Đã hiểu/);
  assert.match(source, /report\.badgeLabel/);
  assert.match(source, /report\.title/);
  assert.match(source, /report\.description/);
  assert.match(source, /report\.advice/);
  assert.match(source, /report\?\.canScaleDown/);
  assert.match(source, /onScaleDown\(report\.recommendedScale\)/);
  assert.match(source, /onReplaceImage\(\)/);
});
