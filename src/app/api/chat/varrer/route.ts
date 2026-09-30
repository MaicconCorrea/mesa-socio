// Tela aberta: varre o número da conversa (a cada poucos segundos) — só números do próprio sócio
import { NextRequest, NextResponse } from "next/server";
import { minhasInstancias } from "@/lib/numeros";
import { varrerNumero } from "@/lib/varredura";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { instancia } = await req.json().catch(() => ({}));
  if (!(await minhasInstancias()).includes(instancia)) return NextResponse.json({ novas: 0 });
  try { return NextResponse.json(await varrerNumero(instancia, 20)); }
  catch (e: any) { return NextResponse.json({ erro: e?.message }, { status: 500 }); }
}
