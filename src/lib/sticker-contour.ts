import type { CanvasElement, StickerOptions } from './product-state.ts';

export type StickerContourStatus = 'empty' | 'valid' | 'disconnected' | 'tiny-details';

export interface StickerContourResult {
  status: StickerContourStatus;
  islandCount: number;
  hasUnremovedBackground: boolean;
  borderSvgPath: string;
  cutlineSvgPath: string;
  warningMessage?: string;
  guidanceMessage?: string;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

interface ExpandedBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function roundedRectPath(box: ExpandedBox, radius: number): string {
  const width = Math.max(0, box.right - box.left);
  const height = Math.max(0, box.bottom - box.top);
  const r = Math.min(Math.max(0, radius), width / 2, height / 2);
  const n = (value: number) => (Object.is(value, -0) ? '0' : String(Number(value.toFixed(3))));
  const left = n(box.left);
  const top = n(box.top);
  const right = n(box.right);
  const bottom = n(box.bottom);
  const xStart = n(box.left + r);
  const xEnd = n(box.right - r);
  const yStart = n(box.top + r);
  const yEnd = n(box.bottom - r);

  return `M${xStart} ${top} L${xEnd} ${top} Q${right} ${top} ${right} ${yStart} L${right} ${yEnd} Q${right} ${bottom} ${xEnd} ${bottom} L${xStart} ${bottom} Q${left} ${bottom} ${left} ${yEnd} L${left} ${yStart} Q${left} ${top} ${xStart} ${top} Z`;
}

function boxesTouch(a: ExpandedBox, b: ExpandedBox): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function countIslands(boxes: readonly ExpandedBox[]): number {
  const visited = new Set<number>();
  let islands = 0;

  for (let start = 0; start < boxes.length; start += 1) {
    if (visited.has(start)) continue;
    islands += 1;
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.pop() as number;
      for (let next = 0; next < boxes.length; next += 1) {
        if (!visited.has(next) && boxesTouch(boxes[current], boxes[next])) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  return islands;
}

export function computeStickerContour(
  elements: readonly CanvasElement[] | undefined,
  options: StickerOptions
): StickerContourResult {
  if (!elements || elements.length === 0) {
    return {
      status: 'empty',
      islandCount: 0,
      hasUnremovedBackground: false,
      borderSvgPath: '',
      cutlineSvgPath: '',
    };
  }

  const expansion = options.hasWhiteBorder ? Math.max(2, options.borderWidth * 4) : 2;
  const boxes = elements.map((element): ExpandedBox => ({
    left: element.x - expansion,
    top: element.y - expansion,
    right: element.x + element.width + expansion,
    bottom: element.y + element.height + expansion,
  }));
  const islandCount = countIslands(boxes);
  const minX = Math.min(...boxes.map((box) => box.left));
  const minY = Math.min(...boxes.map((box) => box.top));
  const maxX = Math.max(...boxes.map((box) => box.right));
  const maxY = Math.max(...boxes.map((box) => box.bottom));
  const bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  const outerBox = { left: minX, top: minY, right: maxX, bottom: maxY };

  let status: StickerContourStatus = 'valid';
  let warningMessage: string | undefined;
  let guidanceMessage: string | undefined;
  if (islandCount > 1) {
    status = 'disconnected';
    warningMessage = 'Một số chi tiết đang tách rời.';
    guidanceMessage = 'Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker.';
  } else if (elements.some((element) => element.width < 5 || element.height < 5)) {
    status = 'tiny-details';
    warningMessage = 'Một số chi tiết quá nhỏ để cắt đẹp.';
    guidanceMessage = 'Tăng viền hoặc đơn giản thiết kế.';
  }

  const hasUnremovedBackground = elements.some(
    (element) =>
      element.type === 'image' &&
      !element.data?.derivedSrc &&
      !element.data?.isBackgroundRemoved
  );
  if (hasUnremovedBackground && !guidanceMessage) {
    guidanceMessage = 'Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước.';
  }

  const radius = Math.min(12, Math.max(2, Math.min(bounds.width, bounds.height) / 4));
  return {
    status,
    islandCount,
    hasUnremovedBackground,
    borderSvgPath: roundedRectPath(outerBox, radius),
    cutlineSvgPath: roundedRectPath(outerBox, Math.max(1, radius / 2)),
    warningMessage,
    guidanceMessage,
    bounds,
  };
}
