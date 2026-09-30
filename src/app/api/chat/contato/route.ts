import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { criarContato, normalizarBR } from "@/lib/contatos";
import { erro, logado, naoAutorizado } from "@/lib/api";

// Cria contato: no Google Contatos (aparece no celular) + na Mesa. Se a conversa existir, já troca o nome dela.
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { numero, nome, conversaId } = await req.json().catch(() => ({}));
  const n = normalizarBR(String(numero || ""));
  if (n.length < 12) return NextResponse.json({ erro: "número inválido — use DDD + número" }, { status: 400 });
  const nomeTrim = String(nome || "").trim();
  if (!nomeTrim) return NextResponse.json({ erro: "digite o nome do contato" }, { status: 400 });
  try {
    const r = await criarContato(n, nomeTrim);
    if (conversaId) await db().from("conversas").update({ nome: nomeTrim }).eq("id", conversaId);
    return NextResponse.json({ ok: true, numero: n, ...r });
  } catch (e) { return erro(e); }
}
