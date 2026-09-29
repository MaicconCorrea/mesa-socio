import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { gravarConfig } from "@/lib/config";
import { logado, naoAutorizado } from "@/lib/api";

// (logado) gera uma chave nova pra extensão — a antiga para de funcionar
export async function POST() {
  if (!(await logado())) return naoAutorizado();
  const chave = "mesa_" + crypto.randomBytes(24).toString("base64url");
  await gravarConfig({ chave_gravador: chave } as any);
  return NextResponse.json({ chave });
}
