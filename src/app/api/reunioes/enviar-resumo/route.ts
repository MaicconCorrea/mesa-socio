import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enviarEmail } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { dataHora } from "@/lib/fmt";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

// Manda o resumo (decisões + próximos passos) por e-mail pros participantes
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { id, para, texto } = await req.json().catch(() => ({}));
  if (!para) return NextResponse.json({ erro: "Informe os e-mails." }, { status: 400 });
  const sb = db();
  const { data: r } = await sb.from("reunioes").select("*").eq("id", id).single();
  if (!r) return NextResponse.json({ erro: "reunião não encontrada" }, { status: 404 });
  try {
    await enviarEmail(minhaConta(), process.env.MEU_NOME || "Maiccon Correa", {
      para, assunto: `Resumo da reunião — ${r.titulo}${r.data ? " (" + dataHora(r.data).slice(0, 5) + ")" : ""}`, corpo: String(texto || ""),
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
