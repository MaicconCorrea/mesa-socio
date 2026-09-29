import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acessoriasConfigurado, listarEmpresas } from "@/lib/acessorias";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 300;

// Copia a lista de empresas ativas do Acessórias (pra escolher rápido ao mandar pro setor)
export async function POST() {
  if (!(await logado())) return naoAutorizado();
  if (!acessoriasConfigurado()) return NextResponse.json({ erro: "Falta ACESSORIAS_TOKEN na Vercel (copie do Painel DP)." }, { status: 400 });
  try {
    let total = 0;
    for (let p = 1; p <= 60; p++) {
      const lote = await listarEmpresas(p);
      if (!lote.length) break;
      const linhas = lote.map((e: any) => ({ cnpj: String(e.Identificador || "").replace(/\D/g, ""), razao: e.Razao, fantasia: e.Fantasia, acessorias_id: String(e.ID), atualizado_em: new Date().toISOString() }))
        .filter((e: any) => e.cnpj);
      await db().from("empresas").upsert(linhas, { onConflict: "cnpj" });
      total += linhas.length;
    }
    return NextResponse.json({ ok: true, total });
  } catch (e) { return erro(e); }
}
