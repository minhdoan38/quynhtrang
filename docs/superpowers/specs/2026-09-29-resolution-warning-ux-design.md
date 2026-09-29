# State 30: Resolution Warning UX Design Specification

## Overview & Philosophy
The Resolution Warning system evaluates whether raster images will look sharp when physically printed, judging images at their actual printed size and communicating results in plain language.
- Core principle: **"Judge the image at its actual printed size, then explain the result in plain language."**
- Exactly three customer-facing states:
  - `Tốt` (`✓ Tốt`)
  - `Có thể hơi mờ` (`⚠ Có thể hơi mờ`)
  - `Ảnh quá nhỏ` (`⚠ Ảnh quá nhỏ`)
- Strictly NO raw DPI/PPI, false quality percentages, or technical print-production terminology in customer UI.
- Effective print quality calculation takes into account:
  - Intrinsic source pixels (width/height);
  - Crop fraction (usable cropped area);
  - Object scale in design;
  - Physical product printed dimensions (A1/A2 wrapping paper, A5 notebook, physical card panels, sticker sizes);
  - Wrapping pattern motif scale (when in pattern mode).
- Contextual badge near selected image with interactive explanation sheet offering actions:
  - `Thu nhỏ ảnh` (scale down to safer size);
  - `Thay ảnh` (replace with higher-resolution asset).
- Pure derived state: Quality updates dynamically on resize/crop/replace without creating history pollution.
- Preflight readiness (State 33): Structured quality reports reference exact `elementId` and `surfaceId`.

---

## 1. Domain Model & Product Thresholds

### 1.1 Quality Schema & Levels
In `src/lib/image-quality.ts`:
```ts
export type QualityLevel = 'good' | 'warning' | 'critical';

export interface ImageQualityReport {
  level: QualityLevel;
  badgeLabel: 'Tốt' | 'Có thể hơi mờ' | 'Ảnh quá nhỏ';
  title: string;
  description: string;
  advice: string;
  effectivePpi: number; // Internal only, never shown to customer
  canScaleDown?: boolean;
  recommendedScale?: number;
  elementId?: string;
  surfaceId?: string;
}

export interface ProductQualityThresholds {
  goodMinPpi: number;     // e.g. 200 PPI
  warningMinPpi: number;  // e.g. 130 PPI
}
```

### 1.2 Product-Specific Thresholds
```ts
export const PRODUCT_QUALITY_THRESHOLDS: Record<string, ProductQualityThresholds> = {
  // Handheld inspection products (Card, Sticker, Notebook) need higher PPI
  card: { goodMinPpi: 220, warningMinPpi: 150 },
  sticker: { goodMinPpi: 220, warningMinPpi: 150 },
  notebook: { goodMinPpi: 200, warningMinPpi: 140 },
  // Large format / distance viewed products (Wrapping Paper A1/A2)
  wrapping: { goodMinPpi: 180, warningMinPpi: 120 },
};
```

### 1.3 Physical Dimension Mapping
Physical print dimensions (in inches: $\text{mm} / 25.4$):
- Wrapping Paper: A1 = $23.39 \times 33.11$ in; A2 = $16.54 \times 23.39$ in. (Pattern mode scales by motif physical size).
- Card: Horizontal panel = $5.83 \times 4.13$ in; Vertical panel = $4.13 \times 5.83$ in.
- Sticker: $1.97 \times 1.97$ in (50mm) or $2.76 \times 1.97$ in (70mm).
- Notebook Cover: A5 = $5.83 \times 8.27$ in ($148 \times 210\text{ mm}$).

---

## 2. Dynamic Evaluation Engine

### 2.1 Formula
$$\text{Physical Width (in)} = \text{Product Physical Width (in)} \times \left(\frac{\text{Element Width}}{\text{Canvas Width}}\right) \times \text{Scale}$$
$$\text{Usable Source Pixels} = \text{Source Pixel Width} \times \text{Crop Fraction}$$
$$\text{Effective PPI} = \frac{\text{Usable Source Pixels}}{\text{Physical Width (in)}}$$

- For Wrapping Paper Pattern mode:
  Motif size is multiplied by $(\text{patternScale} / 100)$.
- Vector elements (Text, SVG shape, QR) are excluded.
- Rotation and opacity do NOT change effective resolution.

---

## 3. UI & Mobile Interaction

### 3.1 Contextual Quality Badge
On the selection box when an image is active:
- `✓ Tốt`: Subtle green badge (`bg-[#EBF3ED] text-[#2D5A3A] border-[#C2DEC9]`).
- `⚠ Có thể hơi mờ`: Amber badge (`bg-[#FEF6E7] text-[#9A6214] border-[#F4DCB0]`).
- `⚠ Ảnh quá nhỏ`: Red-rose badge (`bg-[#FDF0ED] text-[#A63626] border-[#F5C7C0]`).

### 3.2 Quality Explanation Sheet (`ImageQualitySheet`)
Tapping the badge opens a lightweight bottom sheet:
- Header: Badge + Status (`Có thể hơi mờ` / `Ảnh quá nhỏ`).
- Explanation:
  - *"Ảnh này đang được phóng khá lớn. Thành phẩm có thể kém nét khi in."* (Warning)
  - *"Ảnh này quá nhỏ để in rõ ở kích thước hiện tại. Dễ bị vỡ hạt hoặc nhòe khi in."* (Critical)
- Quick Action Buttons:
  - **Thu nhỏ ảnh**: Adjusts element scale to achieve good or warning quality.
  - **Thay ảnh**: Opens Replace Image flow directly.
  - **Đã hiểu**: Closes the sheet without blocking the user.

---

## 4. Preflight & Order Integration
- In `getPreflight(state)`:
  - Aggregates all raster image elements across all surfaces.
  - If any image is `warning`: adds preflight check `Ảnh có thể hơi mờ khi in` with `elementId` and `surfaceId`.
  - If any image is `critical`: adds preflight check `Ảnh quá nhỏ để in rõ` with `elementId` and `surfaceId`.
- Non-blocking during editing; guides user toward resolution before final print.
