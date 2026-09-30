import type { ProductId } from './product-state';
import type { PublishedTemplate } from './domain/catalog.ts';
import { CatalogRepository } from './repositories/catalog-repository.ts';

export type { PublishedTemplate };

export interface CatalogVariant {
  id: string;
  name: string;
  dimensions: string;
  price: number;
  bestFor: string;
}

export interface CatalogProduct {
  id: ProductId;
  slug: string;
  name: string;
  cardTitle: string;
  variantSummary: string;
  englishName: string;
  tagline: string;
  description: string;
  paperSpecs: {
    paperType: string;
    printSurfaces: string;
    packaging: string;
  };
  variants: CatalogVariant[];
  capabilities: string[];
  tone: {
    bg: string;
    cardBg: string;
    border: string;
    badgeVariant: 'sage' | 'rose' | 'honey' | 'slate';
    tape: string;
    accent: string;
  };
  startingPrice: number;
}

export const CATALOG_PRODUCTS: Record<ProductId, CatalogProduct> = {
  wrapping: {
    id: 'wrapping',
    slug: 'wrapping-paper',
    name: 'Giấy gói quà',
    cardTitle: 'Giấy gói quà',
    variantSummary: 'A1 · A2',
    englishName: 'Wrapping Paper',
    tagline: 'Gói ghém yêu thương trong từng nếp gấp',
    description: 'Giấy mỹ thuật chất lượng cao in sắc nét, hoàn hảo cho hộp quà sinh nhật, ngày lễ và kỷ niệm.',
    paperSpecs: {
      paperType: 'Giấy ford mịn 100gsm & kraft mộc mạc',
      printSurfaces: 'In tràn viền 1 mặt sắc nét',
      packaging: 'Đóng gói cuộn chống gãy nếp',
    },
    variants: [
      {
        id: 'a1',
        name: 'Khổ A1',
        dimensions: '90 × 60 cm',
        price: 69000,
        bestFor: 'Hộp quà vừa & lớn',
      },
      {
        id: 'a2',
        name: 'Khổ A2',
        dimensions: '60 × 45 cm',
        price: 49000,
        bestFor: 'Hộp quà nhỏ & tập sách',
      },
    ],
    capabilities: [
      'In họa tiết lặp (Repeat Pattern)',
      'In toàn khổ ảnh đơn (Full-Sheet)',
      'Chất giấy dai, bắt mực mịn màng',
    ],
    tone: {
      bg: 'bg-[#EBF3EE]',
      cardBg: 'bg-[#F4F9F6]',
      border: 'border-[#C5DCD0]',
      badgeVariant: 'sage',
      tape: 'bg-[#D2E4DA]',
      accent: '#3A634E',
    },
    startingPrice: 49000,
  },
  card: {
    id: 'card',
    slug: 'card',
    name: 'Thiệp chúc mừng',
    cardTitle: 'Thiệp',
    variantSummary: 'Ngang · Dọc',
    englishName: 'Greeting Card',
    tagline: 'Lời nhắn gửi chân thành lưu giữ trọn vẹn',
    description: 'Thiệp gập đôi cứng cáp, bề mặt giấy mỹ thuật gân nhẹ bắt mực, tặng kèm phong bì kraft xinh xắn.',
    paperSpecs: {
      paperType: 'Giấy mỹ thuật gân kem 250gsm cứng cáp',
      printSurfaces: 'Tùy biến 3 mặt: Mặt trước, mặt trong, mặt sau',
      packaging: 'Kèm 1 phong bì giấy kraft thủ công',
    },
    variants: [
      {
        id: 'horizontal',
        name: 'Thiệp ngang',
        dimensions: '15 × 10 cm (gập)',
        price: 29000,
        bestFor: 'Ảnh phong cảnh & lời chúc dài',
      },
      {
        id: 'vertical',
        name: 'Thiệp đứng',
        dimensions: '10 × 15 cm (gập)',
        price: 29000,
        bestFor: 'Ảnh chân dung & hoa văn trang nhã',
      },
    ],
    capabilities: [
      'Thiết kế cả 3 mặt (trước, trong, sau)',
      'Tặng kèm phong bì kraft vintage',
      'Giấy mỹ thuật gân kem chống lem mực',
    ],
    tone: {
      bg: 'bg-[#FAF0ED]',
      cardBg: 'bg-[#FCF5F3]',
      border: 'border-[#EBD0C9]',
      badgeVariant: 'rose',
      tape: 'bg-[#F3DDD7]',
      accent: '#9E4E42',
    },
    startingPrice: 29000,
  },
  sticker: {
    id: 'sticker',
    slug: 'sticker',
    name: 'Sticker dán theo yêu cầu',
    cardTitle: 'Sticker',
    variantSummary: 'Die-cut · Shape',
    englishName: 'Custom Sticker',
    tagline: 'Nhãn dán sắc nét, bền bỉ chống thấm nước',
    description: 'In decal vinyl cao cấp phủ màng chống trầy xước, dán chắc chắn trên ốp lưng, laptop, bình nước.',
    paperSpecs: {
      paperType: 'Decal Vinyl phủ màng laminate chống nước',
      printSurfaces: 'Hệ màu in CMYK chuẩn xác',
      packaging: 'Cắt bế viền chuẩn xác từng chiếc',
    },
    variants: [
      {
        id: 'die-cut',
        name: 'Cắt theo hình (Die-cut)',
        dimensions: '5 - 7 cm theo đường nét',
        price: 19000,
        bestFor: 'Logo, linh vật & doodle',
      },
      {
        id: 'fixed-shape',
        name: 'Hình cố định (Tròn/Vuông)',
        dimensions: '5 × 5 cm chuẩn form',
        price: 19000,
        bestFor: 'Nhãn hộp quà, tem niêm phong',
      },
      {
        id: 'phone',
        name: 'Sticker dán ốp điện thoại',
        dimensions: 'Vừa mặt lưng điện thoại',
        price: 25000,
        bestFor: 'Trang trí ốp lưng smartphone',
      },
    ],
    capabilities: [
      'Chống nước, chống tia UV không bay màu',
      'Tùy chỉnh độ dày viền trắng bảo vệ',
      'Bóc dán dễ dàng, không để lại keo dính',
    ],
    tone: {
      bg: 'bg-[#FAF5E6]',
      cardBg: 'bg-[#FCF8EE]',
      border: 'border-[#EADDB6]',
      badgeVariant: 'honey',
      tape: 'bg-[#F1E5C5]',
      accent: '#8C651E',
    },
    startingPrice: 19000,
  },
  notebook: {
    id: 'notebook',
    slug: 'notebook-cover',
    name: 'Bìa sổ tay cá nhân hóa',
    cardTitle: 'Bìa vở',
    variantSummary: 'Tùy chỉnh ảnh & tên',
    englishName: 'Notebook Cover',
    tagline: 'Ghi chép hành trình mang đậm dấu ấn riêng',
    description: 'Bìa cứng ivory 350gsm bồi chắc chắn, bo góc chuẩn mực, cán màng bảo vệ giúp sổ luôn bền đẹp.',
    paperSpecs: {
      paperType: 'Giấy Ivory 350gsm bồi cứng, bo tròn 4 góc',
      printSurfaces: 'In tràn bìa trước và gáy sổ',
      packaging: 'Bọc màng co bảo vệ chống trầy',
    },
    variants: [
      {
        id: 'standard',
        name: 'Khổ A5 tiêu chuẩn',
        dimensions: '14.8 × 21 cm',
        price: 49000,
        bestFor: 'Sổ tay, bullet journal & sketch',
      },
    ],
    capabilities: [
      'Cán màng mờ (Matte) hoặc bóng (Glossy)',
      'Bìa cứng cáp chống quăn mép',
      'Chuẩn kích thước sổ còng & sổ chỉ A5',
    ],
    tone: {
      bg: 'bg-[#EDF2F7]',
      cardBg: 'bg-[#F5F8FB]',
      border: 'border-[#CDD9E5]',
      badgeVariant: 'slate',
      tape: 'bg-[#D8E3EE]',
      accent: '#3E5C79',
    },
    startingPrice: 49000,
  },
};

const SLUG_TO_PRODUCT_ID: Record<string, ProductId> = {
  'wrapping-paper': 'wrapping',
  'wrapping': 'wrapping',
  'card': 'card',
  'greeting-card': 'card',
  'cards': 'card',
  'sticker': 'sticker',
  'stickers': 'sticker',
  'notebook-cover': 'notebook',
  'notebook': 'notebook',
};

export const ALL_PRODUCT_SLUGS = [
  'wrapping-paper',
  'wrapping',
  'card',
  'cards',
  'sticker',
  'stickers',
  'notebook-cover',
  'notebook',
] as const;

export function resolveProductIdFromSlug(slug: string): ProductId | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  return SLUG_TO_PRODUCT_ID[normalized] ?? null;
}

export function getCanonicalSlug(productId: ProductId): string {
  return CATALOG_PRODUCTS[productId]?.slug ?? productId;
}

export function getCatalogProduct(productId: ProductId): CatalogProduct {
  return CATALOG_PRODUCTS[productId] ?? CATALOG_PRODUCTS.wrapping;
}

export function getCatalogProductBySlug(slug: string): CatalogProduct | null {
  const productId = resolveProductIdFromSlug(slug);
  if (!productId) return null;
  return getCatalogProduct(productId);
}

export function getAllCatalogProducts(): CatalogProduct[] {
  return [
    CATALOG_PRODUCTS.wrapping,
    CATALOG_PRODUCTS.card,
    CATALOG_PRODUCTS.sticker,
    CATALOG_PRODUCTS.notebook,
  ];
}

export async function getPublishedProducts(
  repository?: CatalogRepository
): Promise<CatalogProduct[]> {
  try {
    const repo = repository ?? new CatalogRepository();
    const products = await repo.listProducts();
    if (!products || products.length === 0) {
      return getAllCatalogProducts();
    }

    return await Promise.all(
      products.map(async (pub) => {
        const base = CATALOG_PRODUCTS[pub.id] ?? CATALOG_PRODUCTS.wrapping;
        let variants = base.variants;

        if (pub.variants && pub.variants.length > 0) {
          variants = pub.variants.map((v) => ({
            id: v.id,
            name: v.name,
            dimensions: v.dimensions || '',
            price: v.price,
            bestFor: v.bestFor || '',
          }));
        } else {
          try {
            const fetchedVariants = await repo.listVariants(pub.id);
            if (fetchedVariants && fetchedVariants.length > 0) {
              variants = fetchedVariants.map((v) => ({
                id: v.id,
                name: v.name,
                dimensions: v.dimensions || '',
                price: v.price,
                bestFor: v.bestFor || '',
              }));
            }
          } catch {
            // keep base variants
          }
        }

        return {
          ...base,
          id: pub.id,
          slug: pub.slug || base.slug,
          name: pub.name || base.name,
          cardTitle: pub.cardTitle || base.cardTitle,
          variantSummary: pub.variantSummary || base.variantSummary,
          englishName: pub.englishName || base.englishName,
          tagline: pub.tagline || base.tagline,
          description: pub.description || base.description,
          startingPrice: pub.startingPrice ?? base.startingPrice,
          capabilities: pub.capabilities && pub.capabilities.length > 0 ? pub.capabilities : base.capabilities,
          paperSpecs: {
            ...base.paperSpecs,
            ...(pub.paperSpecs || {}),
          },
          tone: {
            ...base.tone,
            ...(pub.tone || {}),
            badgeVariant: pub.tone?.badgeVariant === 'sage' ||
              pub.tone?.badgeVariant === 'rose' ||
              pub.tone?.badgeVariant === 'honey' ||
              pub.tone?.badgeVariant === 'slate'
              ? pub.tone.badgeVariant
              : base.tone.badgeVariant,
          },
          variants,
        };
      })
    );
  } catch {
    return getAllCatalogProducts();
  }
}

export async function getPublishedTemplates(
  productId?: ProductId,
  repository?: CatalogRepository
): Promise<PublishedTemplate[]> {
  try {
    const repo = repository ?? new CatalogRepository();
    return await repo.listTemplates(productId);
  } catch {
    const repo = new CatalogRepository(null);
    return repo.listTemplates(productId);
  }
}
