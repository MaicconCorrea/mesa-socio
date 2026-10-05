"use client";
import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icone";

// Seletor de módulos do Painel Outtax (igual nos 6 painéis).
// Cada opção passa pelo portal (/abrir/<chave>), que confere a permissão e entra no módulo com o login único.
const PORTAL = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://painel-outtax.vercel.app").replace(/\/+$/, "");
const MODULOS: { chave: string; nome: string; icone: string }[] = [
  { chave: "contabil", nome: "Contábil", icone: "calc" },
  { chave: "bpo", nome: "BPO Financeiro", icone: "moeda" },
  { chave: "dp", nome: "Departamento Pessoal", icone: "pessoas" },
  { chave: "legalizacao", nome: "Legalização", icone: "pergaminho" },
  { chave: "atendimento", nome: "Atendimento", icone: "conversa" },
  { chave: "mesa", nome: "Mesa do Sócio", icone: "pessoa" },
];

export default function TrocaModulo({ atual, curto }: { atual: string; curto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const eu = MODULOS.find(m => m.chave === atual);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  return (
    <div className="troca-modulo" ref={caixa}>
      <button type="button" className="troca-botao" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto(a => !a)} title="Trocar de módulo">
        <Icone nome={eu?.icone || "painel"} />
        {!curto && <span className="troca-nome">{eu?.nome || "Painel Outtax"}</span>}
        {!curto && <span className="troca-seta" aria-hidden="true">▾</span>}
      </button>
      {aberto && (
        <div className="troca-lista" role="menu">
          <div className="troca-titulo">Trocar de módulo</div>
          {MODULOS.map(m => (
            <a key={m.chave} role="menuitem" href={m.chave === atual ? "/" : `${PORTAL}/abrir/${m.chave}`} className={m.chave === atual ? "atual" : ""}>
              <Icone nome={m.icone} /><span>{m.nome}</span>{m.chave === atual && <span className="troca-aqui">aqui</span>}
            </a>
          ))}
          <a role="menuitem" href={PORTAL} className="troca-portal"><Icone nome="casa" /><span>Início do Painel Outtax</span></a>
        </div>
      )}
    </div>
  );
}
