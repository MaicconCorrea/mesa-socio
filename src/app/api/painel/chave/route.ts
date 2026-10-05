import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { gravarConfig, lerConfig } from "@/lib/config";
import { logado, naoAutorizado } from "@/lib/api";
import { ehAdminMesa, SO_ADMIN_GLOBAIS } from "@/lib/acesso";

// (administrador da Mesa logado) gera a chave de um painel de setor.
// Fica fora do middleware (api/painel): a checagem de administrador é aqui.
export async function POST(req: NextRequest) {
  const u = await logado();
  if (!u) return naoAutorizado();
  if (!ehAdminMesa(u.email)) return NextResponse.json({ erro: SO_ADMIN_GLOBAIS }, { status: 403 });
  const { setor } = await req.json().catch(() => ({}));
  if (!setor) return NextResponse.json({ erro: "setor" }, { status: 400 });
  const cfg: any = await lerConfig();
  const chave = "painel_" + crypto.randomBytes(24).toString("base64url");
  await gravarConfig({ chaves_painel: { ...(cfg.chaves_painel || {}), [setor]: chave } } as any);
  return NextResponse.json({ chave });
}
