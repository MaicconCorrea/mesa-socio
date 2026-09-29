// Autenticação da extensão do Chrome (chave gerada na Configuração)
import { NextRequest, NextResponse } from "next/server";
import { lerConfig } from "./config";

export async function extensaoAutorizada(req: NextRequest) {
  const chave = req.headers.get("x-mesa-chave") || "";
  const cfg: any = await lerConfig();
  return !!cfg.chave_gravador && chave.length > 20 && chave === cfg.chave_gravador;
}
export const semChave = () => NextResponse.json({ erro: "Chave da extensão inválida — copie de novo em Configuração → Gravador de reuniões." }, { status: 401 });
