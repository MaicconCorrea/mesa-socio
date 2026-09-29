import { NextRequest, NextResponse } from "next/server";
import { gravarConfig, lerConfig } from "@/lib/config";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET() { if (!(await logado())) return naoAutorizado(); return NextResponse.json(await lerConfig()); }
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  await gravarConfig(await req.json().catch(() => ({})));
  return NextResponse.json(await lerConfig());
}
