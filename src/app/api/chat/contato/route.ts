import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizarBR } from "@/lib/contatos";
import { salvarContatos, validarItens } from "@/lib/contatos-destinos";
import { textoResumo } from "@/lib/contatos-comum";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Criar contato" (um só): Mesa + Google Contatos (rótulo da categoria) + Digisac (conexão escolhida).
// Mesma função da tela Contatos (salvar em lote).
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { numero, nome, conversaId, categoria, conexao, empresa } = await req.json().catch(() => ({}));
  const n = normalizarBR(String(numero || ""));
  if (n.length < 12) return NextResponse.json({ erro: "número inválido — use DDD + número" }, { status: 400 });
  const nomeTrim = String(nome || "").trim();
  if (!nomeTrim) return NextResponse.json({ erro: "digite o nome do contato" }, { status: 400 });
  if (!categoria) return NextResponse.json({ erro: "escolha a categoria" }, { status: 400 });
  if (!conexao) return NextResponse.json({ erro: "escolha a conexão do Digisac (ou Não cadastrar)" }, { status: 400 });
  try {
    const { resumo, resultados } = await salvarContatos(validarItens([{ numero: n, nome: nomeTrim, categoria, conexao, empresa }]));
    if (conversaId) await db().from("conversas").update({ nome: nomeTrim }).eq("id", conversaId);
    const r = resultados[0];
    return NextResponse.json({
      ok: r.mesa !== "erro" && r.erros.length === 0, numero: n, resumo, resultado: r, texto: textoResumo(resumo),
      google: r.google === "ok" || r.google === "ja",
      aviso: [...resumo.avisos, ...r.erros].join(" · ") || undefined,
    });
  } catch (e) { return erro(e); }
}
