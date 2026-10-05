"use client";
// Categoria + Conexão do Digisac no "Criar contato" (os mesmos campos da tela Contatos). Nada é presumido.
import { useEffect, useState } from "react";
import { AVISO_DIGISAC, CATEGORIAS, type Categoria, type ConexaoEscolhida } from "@/lib/contatos-comum";

export type ValorCampos = { categoria: Categoria | ""; conexao: ConexaoEscolhida | "" };
type Opcoes = { configurado: boolean; conexoes: { chave: string; nome: string }[]; erro?: string };

let cache: Opcoes | null = null;

export default function CamposContato({ valor, onChange }: { valor: ValorCampos; onChange: (v: ValorCampos) => void }) {
  const [op, setOp] = useState<Opcoes | null>(cache);
  useEffect(() => {
    if (cache) return;
    fetch("/api/contatos/opcoes").then(r => r.json()).then(j => { cache = j.digisac; setOp(j.digisac); }).catch(() => setOp({ configurado: false, conexoes: [], erro: "não deu para ler as conexões" }));
  }, []);
  // sem Digisac configurado não há o que escolher: fica "Não cadastrar"
  useEffect(() => { if (op && !op.configurado && valor.conexao !== "nao") onChange({ ...valor, conexao: "nao" }); }, [op]);

  return (
    <>
      <label>Categoria
        <select value={valor.categoria} onChange={e => onChange({ ...valor, categoria: e.target.value as Categoria | "" })}>
          <option value="">Escolha…</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Conexão do Digisac
        {op?.configurado
          ? <select value={valor.conexao} onChange={e => onChange({ ...valor, conexao: e.target.value as ConexaoEscolhida | "" })}>
              <option value="">Escolha…</option>
              {op.conexoes.map(c => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
              <option value="nao">Não cadastrar no Digisac</option>
            </select>
          : <select value="nao" disabled><option value="nao">Não cadastrar no Digisac</option></select>}
      </label>
      {op && !op.configurado && <p className="muted small" style={{ margin: 0 }}>{AVISO_DIGISAC}.</p>}
      {op?.configurado && op.erro && <p className="muted small" style={{ margin: 0 }}>{op.erro}</p>}
    </>
  );
}
