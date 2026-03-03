import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/db/products";
import ProductForm from "@/components/admin/ProductForm";

export const metadata: Metadata = {
  title: "Edit Product | NAVO Admin",
};

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <Link href="/admin/products" className="text-xs text-white/40 hover:text-white/70">
          ← Products
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-white">Edit product</h1>
        <p className="mt-1 text-sm text-white/40">{product.name}</p>
      </div>
      <ProductForm initialData={product} />
    </div>
  );
}
