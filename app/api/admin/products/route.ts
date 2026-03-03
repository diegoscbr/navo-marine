import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listProducts, createProduct, type ProductInput } from "@/lib/db/products";

const ADMIN_DOMAIN = "@navomarine.com";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const products = await listProducts();
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as ProductInput;
  const product = await createProduct(body);
  return NextResponse.json({ product }, { status: 201 });
}
