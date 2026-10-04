import type { Metadata } from 'next';
import { ProductsCatalogView } from '@/components/products/products-catalog-view';
import { getPublishedProducts } from '@/lib/product-catalog';
export const metadata: Metadata = {
  title: 'Danh mục sản phẩm in ấn · Quỳnh Trang',
  description: 'Khám phá các sản phẩm giấy gói quà, thiệp chúc mừng, sticker và bìa sổ tay cá nhân hóa tại Quỳnh Trang.',
};

export default async function ProductsPage() {
  const products = await getPublishedProducts();
  return <ProductsCatalogView products={products} />;
}
