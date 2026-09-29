import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { subscription, aparelho } = await req.json().catch(() => ({}));
  if (!subscription?.endpoint) return NextResponse.json({ erro: "assinatura inválida" }, { status: 400 });
  const { error } = await db().from("push_assinaturas").upsert({
    endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, aparelho: String(aparelho || "").slice(0, 120),
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { endpoint } = await req.json().catch(() => ({}));
  if (endpoint) await db().from("push_assinaturas").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
