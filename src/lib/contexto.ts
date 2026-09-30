// De quem é o pedido? (cada sócio só vê o que é dele)
// - Nas telas e rotas com login: o middleware confere o login e grava o e-mail num cabeçalho assinado.
// - Em crons, webhook e rotinas: comDono(email, fn) define o dono enquanto a função roda.
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

const als = new AsyncLocalStorage<{ dono: string }>();
export function comDono<T>(dono: string, fn: () => Promise<T>): Promise<T> { return als.run({ dono: dono.toLowerCase() }, fn); }

export function assinaturaDono(email: string) {
  return crypto.createHmac("sha256", process.env.WEBHOOK_SECRET || "mesa").update(email.toLowerCase()).digest("hex");
}

export function donoAtual(): string | null {
  const s = als.getStore(); if (s?.dono) return s.dono;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { headers } = require("next/headers");
    const h = headers();
    const email = h.get("x-mesa-dono"), sig = h.get("x-mesa-dono-sig");
    if (email && sig && sig === assinaturaDono(email)) return email.toLowerCase();
  } catch { /* fora de uma requisição */ }
  return null;
}
