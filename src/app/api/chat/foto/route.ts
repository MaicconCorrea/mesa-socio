import { NextRequest, NextResponse } from "next/server";
import { fotoUsuario } from "@/lib/gchat";
import { logado } from "@/lib/api";

export const dynamic = "force-dynamic";

// Foto de perfil de alguém da Outtax (Google Workspace)
export async function GET(req: NextRequest) {
  if (!(await logado())) return new NextResponse("não autenticado", { status: 401 });
  const u = req.nextUrl.searchParams.get("u") || "";
  try {
    const f = await fotoUsuario(u);
    if (!f) return new NextResponse("sem foto", { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
    return new NextResponse(new Uint8Array(f.bytes), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400" } });
  } catch { return new NextResponse("sem foto", { status: 404 }); }
}
