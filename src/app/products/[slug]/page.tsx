import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCatalogProductBySlug, ALL_PRODUCT_SLUGS } from '@/lib/product-catalog';
import { ProductDetailCatalogView } from '@/components/products/product-detail-catalog-view';

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return ALL_PRODUCT_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata(props: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const product = getCatalogProductBySlug(slug);
  if (!product) {
    return {
      title: 'Không tìm thấy sản phẩm · Quỳnh Trang',
    };
  }
  return {
    title: `${product.name} (${product.englishName}) · Quỳnh Trang`,
    description: product.description,
  };
}

export default async function ProductDetailPage(props: ProductDetailPageProps) {
  const { slug } = await props.params;
  const product = getCatalogProductBySlug(slug);
  if (!product) {
    notFound();
  }
  return <ProductDetailCatalogView product={product} />;
}
