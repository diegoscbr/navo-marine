import type { Metadata } from "next";
import Link from "next/link";
import ProductForm from "@/components/admin/ProductForm";

export const metadata: Metadata = {
  title: "New Product | NAVO Admin",
};

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <Link href="/admin/products" className="text-xs text-white/40 hover:text-white/70">
          ← Products
        </Link>
        <h1 className="font-heading mt-3 text-2xl font-semibold text-white">New product</h1>
      </div>
      <ProductForm />
    </div>
  );
}
