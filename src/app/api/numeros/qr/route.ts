import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { qrCode } from "@/lib/evolution";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const instancia = req.nextUrl.searchParams.get("instancia") || "";
  const { data: meu } = await db().from("numeros").select("instancia").eq("instancia", instancia).maybeSingle();
  if (!meu) return NextResponse.json({ erro: "número não encontrado" }, { status: 404 });
  return NextResponse.json(await qrCode(instancia));
}
