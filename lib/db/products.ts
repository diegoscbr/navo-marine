import { prisma } from "@/lib/prisma";

export type ProductOptionValueInput = {
  label: string;
  priceDeltaCents: number;
  order: number;
};

export type ProductOptionInput = {
  name: string;
  required: boolean;
  order: number;
  values: ProductOptionValueInput[];
};

export type ProductAddOnInput = {
  slug: string;
  name: string;
  description?: string;
  priceCents: number;
  addonType: string;
  order: number;
};

export type ProductInput = {
  slug: string;
  name: string;
  subtitle?: string;
  description: string;
  status: "draft" | "active" | "archived";
  priceCents: number;
  currency: string;
  taxIncluded: boolean;
  inTheBox: string[];
  manualUrl?: string;
  rentalEnabled: boolean;
  rentalPriceCents?: number;
  lateFeeCents?: number;
  reserveCutoffDays?: number;
  requiresEventSelection: boolean;
  requiresSailNumber: boolean;
  options: ProductOptionInput[];
  addOns: ProductAddOnInput[];
};

const withRelations = {
  include: {
    options: {
      orderBy: { order: "asc" as const },
      include: {
        values: { orderBy: { order: "asc" as const } },
      },
    },
    addOns: { orderBy: { order: "asc" as const } },
  },
};

export async function listProducts() {
  return prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    ...withRelations,
  });
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({ where: { id }, ...withRelations });
}

export async function getActiveProducts() {
  return prisma.product.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    ...withRelations,
  });
}

function buildProductData(data: ProductInput) {
  const { options, addOns, inTheBox, ...core } = data;
  return {
    ...core,
    inTheBox: JSON.stringify(inTheBox),
    options: {
      create: options.map((opt) => ({
        name: opt.name,
        required: opt.required,
        order: opt.order,
        values: {
          create: opt.values.map((v) => ({
            label: v.label,
            priceDeltaCents: v.priceDeltaCents,
            order: v.order,
          })),
        },
      })),
    },
    addOns: { create: addOns },
  };
}

export async function createProduct(data: ProductInput) {
  return prisma.product.create({ data: buildProductData(data), ...withRelations });
}

export async function updateProduct(id: string, data: ProductInput) {
  await prisma.productOption.deleteMany({ where: { productId: id } });
  await prisma.productAddOn.deleteMany({ where: { productId: id } });
  return prisma.product.update({
    where: { id },
    data: buildProductData(data),
    ...withRelations,
  });
}

export async function deleteProduct(id: string) {
  return prisma.product.delete({ where: { id } });
}
