import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { gravarConfig } from "@/lib/config";
import { logado, naoAutorizado } from "@/lib/api";
import { ehAdminMesa, SO_ADMIN_GLOBAIS } from "@/lib/acesso";

// (administrador da Mesa logado) gera uma chave nova pra extensão — a antiga para de funcionar.
// Fica fora do middleware (api/gravacao): a checagem de administrador é aqui.
export async function POST() {
  const u = await logado();
  if (!u) return naoAutorizado();
  if (!ehAdminMesa(u.email)) return NextResponse.json({ erro: SO_ADMIN_GLOBAIS }, { status: 403 });
  const chave = "mesa_" + crypto.randomBytes(24).toString("base64url");
  await gravarConfig({ chave_gravador: chave } as any);
  return NextResponse.json({ chave });
}
