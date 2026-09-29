import { NextRequest, NextResponse } from "next/server";
import { listarEventos } from "@/lib/agenda";
import { googleConfigurado } from "@/lib/google";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

// ?de=AAAA-MM-DD&dias=7
export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  if (!googleConfigurado()) return NextResponse.json({ ativo: false, eventos: [] });
  const sp = req.nextUrl.searchParams;
  const de = sp.get("de") || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const dias = Math.min(Number(sp.get("dias") || 7), 42);
  const ini = new Date(`${de}T00:00:00-03:00`);
  const fim = new Date(ini.getTime() + dias * 86400000);
  try { return NextResponse.json({ ativo: true, eventos: await listarEventos(ini, fim) }); }
  catch (e: any) { return NextResponse.json({ ativo: true, erro: String(e.message ?? e), eventos: [] }); }
}
