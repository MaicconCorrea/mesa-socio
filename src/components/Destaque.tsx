import { Fragment, ReactNode } from "react";

// Destaca as palavras da busca no texto (ignora maiúsculas e acentos: "reuniao" acha "Reunião")
const dobra = (c: string) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function palavrasBusca(q?: string | null): string[] {
  return Array.from(new Set(String(q || "").split(/\s+/).map(w => dobra(w).replace(/[^\p{L}\p{N}@.\-+/]/gu, "")).filter(w => w.length >= 2))).slice(0, 4);
}

export default function Destaque({ texto, termo }: { texto?: string | null; termo?: string | null }): ReactNode {
  const s = String(texto ?? "");
  const ws = palavrasBusca(termo);
  if (!s || !ws.length) return s;
  // texto "dobrado" caractere a caractere, guardando a posição original
  let norm = ""; const ini0: number[] = [], fim0: number[] = [];
  Array.from(s).reduce((i, ch) => {
    const d = dobra(ch) || ch;
    for (let j = 0; j < d.length; j++) { norm += d[j]; ini0.push(i); fim0.push(i + ch.length); }
    return i + ch.length;
  }, 0);
  const marcas: [number, number][] = [];
  for (const w of ws) {
    let k = norm.indexOf(w);
    while (k >= 0) { marcas.push([ini0[k], fim0[k + w.length - 1]]); k = norm.indexOf(w, k + w.length); }
  }
  if (!marcas.length) return s;
  marcas.sort((a, b) => a[0] - b[0]);
  const juntas: [number, number][] = [];
  for (const m of marcas) { const u = juntas[juntas.length - 1]; if (u && m[0] <= u[1]) u[1] = Math.max(u[1], m[1]); else juntas.push([...m]); }
  const partes: ReactNode[] = []; let ini = 0;
  juntas.forEach(([a, b], i) => {
    if (a > ini) partes.push(<Fragment key={`t${i}`}>{s.slice(ini, a)}</Fragment>);
    partes.push(<mark key={`m${i}`} className="bm-mark">{s.slice(a, b)}</mark>);
    ini = b;
  });
  if (ini < s.length) partes.push(<Fragment key="fim">{s.slice(ini)}</Fragment>);
  return <>{partes}</>;
}
