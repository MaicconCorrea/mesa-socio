import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analisarReuniao } from "@/lib/reunioes";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 120;

// Anotações/transcrição coladas à mão (de qualquer lugar: Zoom, Teams, caderno…)
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { titulo, data, texto } = await req.json().catch(() => ({}));
  if (!texto || String(texto).trim().length < 40) return NextResponse.json({ erro: "Cole o texto da reunião (anotações ou transcrição)." }, { status: 400 });
  try {
    const { data: r } = await db().from("reunioes").insert({
      titulo: String(titulo || "Reunião").slice(0, 200), data: data ? new Date(`${data}T12:00:00-03:00`).toISOString() : new Date().toISOString(),
      origem: "colado", texto: String(texto).slice(0, 200000),
    }).select("id").single();
    const x = await analisarReuniao(r!.id);
    return NextResponse.json({ ok: true, id: r!.id, ...x });
  } catch (e) { return erro(e); }
}
