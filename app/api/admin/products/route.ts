import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth-guard";
import { listProducts, createProduct, type ProductInput } from "@/lib/db/products";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const products = await listProducts();
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as ProductInput;
  const product = await createProduct(body);
  return NextResponse.json({ product }, { status: 201 });
}
