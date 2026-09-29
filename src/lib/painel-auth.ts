// Chave de cada painel de setor (gerada na Configuração da Mesa). O painel só enxerga as reuniões do setor dele.
import { NextRequest } from "next/server";
import { lerConfig } from "./config";

export async function setorDoPainel(req: NextRequest): Promise<string | null> {
  const chave = req.headers.get("x-painel-chave") || "";
  if (chave.length < 20) return null;
  const cfg: any = await lerConfig();
  const chaves: Record<string, string> = cfg.chaves_painel || {};
  const achado = Object.entries(chaves).find(([, v]) => v === chave);
  return achado ? achado[0] : null;
}
