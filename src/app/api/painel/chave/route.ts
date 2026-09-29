import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { gravarConfig, lerConfig } from "@/lib/config";
import { logado, naoAutorizado } from "@/lib/api";

// (Maiccon logado) gera a chave de um painel de setor
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { setor } = await req.json().catch(() => ({}));
  if (!setor) return NextResponse.json({ erro: "setor" }, { status: 400 });
  const cfg: any = await lerConfig();
  const chave = "painel_" + crypto.randomBytes(24).toString("base64url");
  await gravarConfig({ chaves_painel: { ...(cfg.chaves_painel || {}), [setor]: chave } } as any);
  return NextResponse.json({ chave });
}
