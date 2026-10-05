// Virada: a Mesa passou a morar no Painel Outtax (https://painel-outtax.vercel.app/mesa).
// Com a variável MESA_REDIRECIONAR_PARA definida (ex.: https://painel-outtax.vercel.app/mesa):
// - as TELAS desta Mesa redirecionam para lá (middleware.ts); as rotas /api continuam respondendo
//   (webhook, extensão, painéis) até todos os chamadores trocarem de endereço;
// - os crons daqui param (evita resumo e avisos em dobro com a Mesa nova);
// - /api/ext/config avisa a extensão do gravador (v2.1+) do endereço novo ("mudouPara").
// Para voltar atrás: apague a variável na Vercel e faça deploy.
import { NextResponse } from "next/server";

export const destinoNovo = () => (process.env.MESA_REDIRECIONAR_PARA || "").trim().replace(/\/+$/, "");

/** Origem (https://host) do endereço novo, ou null. */
export function origemNova(): string | null {
  const d = destinoNovo();
  if (!d) return null;
  try { return new URL(d).origin; } catch { return null; }
}

/** Resposta dos crons quando a Mesa já mudou (ou null para seguir normalmente). */
export function cronDesligado() {
  const d = destinoNovo();
  return d ? NextResponse.json({ ok: true, pulado: `a Mesa mudou para ${d} (MESA_REDIRECIONAR_PARA); crons desta Mesa desligados` }) : null;
}
