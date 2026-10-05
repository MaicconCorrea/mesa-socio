import { NextRequest, NextResponse } from "next/server";
import { gravarConfig, lerConfig, semGlobais, temGlobal } from "@/lib/config";
import { logado, naoAutorizado } from "@/lib/api";
import { ehAdminMesa, SO_ADMIN_GLOBAIS } from "@/lib/acesso";

export const dynamic = "force-dynamic";

// Configurações globais (dono "*": chaves_painel, chave_gravador) só para administradores da Mesa (MESA_ADMINS).
const soAdmin = () => NextResponse.json({ erro: SO_ADMIN_GLOBAIS }, { status: 403 });

export async function GET() {
  const u = await logado(); if (!u) return naoAutorizado();
  const c = await lerConfig();
  return NextResponse.json(ehAdminMesa(u.email) ? c : semGlobais(c));
}
export async function POST(req: NextRequest) {
  const u = await logado(); if (!u) return naoAutorizado();
  const corpo = await req.json().catch(() => ({}));
  const admin = ehAdminMesa(u.email);
  if (temGlobal(corpo) && !admin) return soAdmin();
  await gravarConfig(corpo);
  const c = await lerConfig();
  return NextResponse.json(admin ? c : semGlobais(c));
}
