"use client";
import { useEffect, useMemo, useState } from "react";
import { salvarContatosLote } from "@/app/actions";
import {
  AVISO_DIGISAC, CATEGORIAS, LOTE_CONTATOS_MAX, resumoVazio, somarResumos, textoResumo,
  type Categoria, type ConexaoEscolhida, type ItemContato, type ResumoContatos,
} from "@/lib/contatos-comum";
import type { LinhaContato, ListaContatos } from "@/lib/contatos-destinos";

type Filtro = "nenhum" | "google" | "digisac" | "todos";
type Edicao = { nome: string; categoria: Categoria | ""; conexao: ConexaoEscolhida | "" };
const PEDACO = 10; // contatos por chamada ao servidor (a barra mostra o andamento)

const quando = (iso: string | null) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
};
const semAcento = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function ContatosApp() {
  const [dados, setDados] = useState<ListaContatos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("nenhum");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ed, setEd] = useState<Record<string, Edicao>>({});
  const [todosCat, setTodosCat] = useState<Categoria | "">("");
  const [todosCx, setTodosCx] = useState<ConexaoEscolhida | "">("");
  const [salvando, setSalvando] = useState<{ feito: number; total: number } | null>(null);
  const [resumo, setResumo] = useState<ResumoContatos | null>(null);
  const [aviso, setAviso] = useState("");
  const [faltando, setFaltando] = useState<Set<string>>(new Set());

  const digisacOk = !!dados?.digisac.configurado;
  const conexoes = dados?.conexoes || [];

  async function carregar(novo = false) {
    setCarregando(true); setErroLista("");
    try {
      const r = await fetch(`/api/contatos/lista${novo ? "?novo=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.erro) throw new Error(j.erro || `erro ${r.status}`);
      setDados(j);
      setEd(atual => {
        const prox: Record<string, Edicao> = {};
        for (const l of j.linhas as LinhaContato[]) prox[l.numero] = atual[l.numero] || { nome: l.mesa || l.google || l.sugerido || "", categoria: "", conexao: j.digisac.configurado ? "" : "nao" };
        return prox;
      });
    } catch (e: any) { setErroLista(String(e?.message || e)); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, []);

  const temDigisac = (l: LinhaContato) => l.digisac.some(d => d.nome);
  const contagem = useMemo(() => {
    const ls = dados?.linhas || [];
    return {
      nenhum: ls.filter(l => !l.mesa && !l.google && !temDigisac(l)).length,
      google: ls.filter(l => !l.google).length,
      digisac: digisacOk ? ls.filter(l => !l.digisac.length).length : 0,
      todos: ls.length,
    };
  }, [dados, digisacOk]);

  const visiveis = useMemo(() => {
    const ls = dados?.linhas || [];
    const t = semAcento(busca.trim()), d = busca.replace(/\D/g, "");
    return ls.filter(l => {
      if (filtro === "nenhum" && (l.mesa || l.google || temDigisac(l))) return false;
      if (filtro === "google" && l.google) return false;
      if (filtro === "digisac" && (!digisacOk || l.digisac.length)) return false;
      if (!t) return true;
      const nomes = [ed[l.numero]?.nome, l.sugerido, l.mesa, l.google, l.empresa, ...l.digisac.map(x => x.nome)].map(x => semAcento(x || "")).join(" ");
      return (d.length >= 3 && l.numero.includes(d)) || nomes.includes(t);
    });
  }, [dados, filtro, busca, ed, digisacOk]);

  const marcadosVisiveis = visiveis.filter(l => sel.has(l.numero)).length;
  const todosMarcados = visiveis.length > 0 && marcadosVisiveis === visiveis.length;
  function marcarTodos() {
    setSel(s => { const n = new Set(s); if (todosMarcados) visiveis.forEach(l => n.delete(l.numero)); else visiveis.forEach(l => n.add(l.numero)); return n; });
  }
  function marcar(numero: string) { setSel(s => { const n = new Set(s); n.has(numero) ? n.delete(numero) : n.add(numero); return n; }); }
  function editar(numero: string, campo: Partial<Edicao>) {
    setEd(e => ({ ...e, [numero]: { ...e[numero], ...campo } }));
    setFaltando(f => { if (!f.has(numero)) return f; const n = new Set(f); n.delete(numero); return n; });
  }
  function aplicarATodos() {
    if (!sel.size) { setAviso("Marque pelo menos um contato."); return; }
    setEd(e => {
      const n = { ...e };
      sel.forEach(num => { n[num] = { ...n[num], ...(todosCat ? { categoria: todosCat } : {}), ...(todosCx ? { conexao: todosCx } : {}) }; });
      return n;
    });
    setFaltando(new Set()); setAviso("");
  }

  async function salvar() {
    setAviso(""); setResumo(null);
    const linhas = (dados?.linhas || []).filter(l => sel.has(l.numero));
    if (!linhas.length) { setAviso("Marque os contatos que quer salvar."); return; }
    if (linhas.length > LOTE_CONTATOS_MAX) { setAviso(`No máximo ${LOTE_CONTATOS_MAX} contatos por vez (marcados: ${linhas.length}).`); return; }
    const falta = linhas.filter(l => { const e = ed[l.numero]; return !e?.nome.trim() || !e.categoria || !e.conexao; });
    if (falta.length) {
      setFaltando(new Set(falta.map(l => l.numero)));
      setAviso(`Falta nome, categoria ou conexão do Digisac em ${falta.length} contato(s) — estão destacados na lista.`);
      return;
    }
    const itens: ItemContato[] = linhas.map(l => ({ numero: l.numero, nome: ed[l.numero].nome.trim(), categoria: ed[l.numero].categoria as Categoria, conexao: ed[l.numero].conexao as ConexaoEscolhida, empresa: l.empresa || undefined }));
    let total = resumoVazio();
    setSalvando({ feito: 0, total: itens.length });
    for (let i = 0; i < itens.length; i += PEDACO) {
      const parte = itens.slice(i, i + PEDACO);
      const r = await salvarContatosLote(parte).catch((e: any) => ({ ok: false, erro: String(e?.message || e) } as { ok: boolean; erro?: string; resumo?: ResumoContatos }));
      if (!r.ok || !r.resumo) {
        total = somarResumos(total, { ...resumoVazio(), erros: parte.map(p => ({ numero: p.numero, nome: p.nome, erro: r.erro || "falhou" })) });
      } else total = somarResumos(total, r.resumo);
      setSalvando({ feito: Math.min(i + PEDACO, itens.length), total: itens.length });
      setResumo(total);
    }
    setSalvando(null);
    const comErro = new Set(total.erros.map(e => e.numero));
    setSel(new Set(itens.map(i => i.numero).filter(n => comErro.has(n))));
    await carregar();
  }

  const selo = (ok: boolean, rotulo: string, titulo?: string) => <span className={"selo " + (ok ? "ct-sim" : "ct-nao")} title={titulo}>{rotulo} {ok ? "✓" : "✗"}</span>;
  const opcoesConexao = (
    <>
      <option value="">Conexão do Digisac…</option>
      {conexoes.map(c => <option key={c.chave} value={c.chave}>{c.nome}</option>)}
      <option value="nao">Não cadastrar no Digisac</option>
    </>
  );

  return (
    <div className="ct">
      <h1>Contatos</h1>
      <p className="sub">Números das suas conversas do WhatsApp cruzados com a Mesa, o Google Contatos e o Digisac. Escolha o nome, a categoria e a conexão e salve vários de uma vez.</p>
      <p className="muted small ct-nota">Salvar “no seu WhatsApp” = salvar no Google Contatos: o celular sincroniza a agenda e o WhatsApp passa a mostrar o nome (não existe API para gravar direto na agenda do aparelho).</p>

      {dados && (
        <div className="ct-status small">
          <span>Google Contatos: {dados.google === "ok" ? <b className="ct-ok">conectado</b> : dados.google === "desligado" ? <b className="ct-ruim">desligado</b> : <b className="ct-ruim">{dados.google}</b>}</span>
          <span>Digisac: {!dados.digisac.configurado ? <b className="ct-ruim">não configurado — {AVISO_DIGISAC}</b>
            : dados.digisac.erro ? <b className="ct-ruim">{dados.digisac.erro}</b>
            : <b className="ct-ok">conectado{dados.digisac.parcial ? " (lista parcial: muitos contatos, o cruzamento pode estar incompleto)" : ""}</b>}</span>
          {dados.digisac.configurado && <span>Conexões: {conexoes.length ? conexoes.map(c => c.nome).join(", ") : <b className="ct-ruim">{dados.conexoesErro || "nenhuma"}</b>}</span>}
        </div>
      )}

      <div className="ct-filtros">
        <div className="abas" role="group" aria-label="Filtro">
          {([["nenhum", "Sem nome em nenhum lugar"], ["google", "Falta no Google"], ["digisac", "Falta no Digisac"], ["todos", "Todos"]] as [Filtro, string][]).map(([f, r]) => (
            <button key={f} type="button" className={"ct-chip" + (filtro === f ? " ativa" : "")} onClick={() => setFiltro(f)} disabled={f === "digisac" && !digisacOk}
              title={f === "digisac" && !digisacOk ? AVISO_DIGISAC : undefined}>{r} <span className="ct-num">{contagem[f]}</span></button>
          ))}
        </div>
        <input className="ct-busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procurar por número ou nome" />
        <button type="button" className="sec" onClick={() => carregar(true)} disabled={carregando}>{carregando ? "Carregando…" : "Recarregar"}</button>
      </div>

      <div className="ct-barra">
        <label className="ct-check"><input type="checkbox" checked={todosMarcados} onChange={marcarTodos} disabled={!visiveis.length} /> Selecionar todos visíveis</label>
        <span className="muted small">{sel.size} selecionado(s)</span>
        <span className="ct-aplicar">
          <span className="small">Aplicar a todos os selecionados:</span>
          <select value={todosCat} onChange={e => setTodosCat(e.target.value as Categoria | "")} aria-label="Categoria para todos">
            <option value="">Categoria…</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={todosCx} onChange={e => setTodosCx(e.target.value as ConexaoEscolhida | "")} aria-label="Conexão do Digisac para todos" disabled={!digisacOk}>
            {digisacOk ? opcoesConexao : <option value="">Não cadastrar no Digisac</option>}
          </select>
          <button type="button" className="sec mini" onClick={aplicarATodos} disabled={!sel.size || (!todosCat && !todosCx)}>Aplicar</button>
        </span>
        <button type="button" className="ct-salvar" onClick={salvar} disabled={!sel.size || !!salvando}>
          {salvando ? `Salvando ${salvando.feito} de ${salvando.total}…` : `Salvar ${sel.size} contato${sel.size === 1 ? "" : "s"}`}
        </button>
      </div>
      {!digisacOk && dados && <p className="muted small ct-nota">Cadastro no Digisac desativado: {AVISO_DIGISAC}.</p>}

      {aviso && <div className="aviso ambar">{aviso}</div>}
      {resumo && (
        <div className={"aviso" + (resumo.erros.length ? " ambar" : "")}>
          <b>{salvando ? "Salvando… " : "Pronto: "}</b>{textoResumo(resumo)}
          {resumo.avisos.map(a => <div key={a} className="small">{a}</div>)}
          {resumo.erros.length > 0 && (
            <details className="ct-erros"><summary>{resumo.erros.length} erro(s) por contato</summary>
              <ul>{resumo.erros.map((e, i) => <li key={i}><b>{e.nome || e.numero}</b> ({e.numero}): {e.erro}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {erroLista && <div className="aviso erro">Não deu para carregar a lista: {erroLista}</div>}

      {carregando && !dados ? <div className="vazio">Cruzando conversas, Google Contatos e Digisac…</div>
        : !visiveis.length ? <div className="vazio">{busca ? "Ninguém encontrado com essa busca." : "Nenhum número neste filtro."}</div>
        : (
          <table className="ct-tabela">
            <thead>
              <tr>
                <th className="ct-col-check"><input type="checkbox" checked={todosMarcados} onChange={marcarTodos} aria-label="Selecionar todos visíveis" /></th>
                <th>Número</th>
                <th>Nome</th>
                <th>Última mensagem</th>
                <th>Situação</th>
                <th>Categoria</th>
                <th>Conexão do Digisac</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => {
                const e = ed[l.numero] || { nome: "", categoria: "", conexao: "" };
                const falta = faltando.has(l.numero);
                const dgNomes = l.digisac.map(d => d.nome + (d.conexao ? ` (${d.conexao})` : "")).filter(Boolean).join(", ");
                return (
                  <tr key={l.numero} className={(sel.has(l.numero) ? "ct-marcada" : "") + (falta ? " ct-falta" : "")}>
                    <td className="ct-col-check"><input type="checkbox" checked={sel.has(l.numero)} onChange={() => marcar(l.numero)} aria-label={`Selecionar ${l.formatado}`} /></td>
                    <td data-rotulo="Número" className="nowrap">{l.formatado}</td>
                    <td data-rotulo="Nome">
                      <input value={e.nome} onChange={x => { editar(l.numero, { nome: x.target.value }); if (!sel.has(l.numero) && x.target.value.trim()) marcar(l.numero); }} placeholder="Nome do contato" aria-label={`Nome de ${l.formatado}`} />
                      <div className="muted small ct-sugestao">
                        {l.pushName && <span>WhatsApp: {l.pushName}</span>}
                        {dgNomes && <span>Digisac: {dgNomes}</span>}
                        {l.empresa && <span>Empresa: {l.empresa}</span>}
                      </div>
                    </td>
                    <td data-rotulo="Última mensagem"><div className="small">{quando(l.ultimaEm)}</div><div className="muted small ct-ultima">{l.ultimaTexto || "—"}</div></td>
                    <td data-rotulo="Situação">
                      <div className="ct-selos">
                        {selo(!!l.mesa, "Mesa", l.mesa || undefined)}
                        {selo(!!l.google, "Google", l.google || undefined)}
                        {digisacOk ? selo(l.digisac.length > 0, "Digisac", dgNomes || undefined) : <span className="selo ct-neutro" title={AVISO_DIGISAC}>Digisac não configurado</span>}
                      </div>
                      {(l.mesa || l.google) && <div className="muted small">{l.mesa || l.google}</div>}
                    </td>
                    <td data-rotulo="Categoria">
                      <select value={e.categoria} onChange={x => editar(l.numero, { categoria: x.target.value as Categoria | "" })} aria-label="Categoria">
                        <option value="">Categoria…</option>
                        {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td data-rotulo="Conexão do Digisac">
                      {digisacOk
                        ? <select value={e.conexao} onChange={x => editar(l.numero, { conexao: x.target.value as ConexaoEscolhida | "" })} aria-label="Conexão do Digisac">{opcoesConexao}</select>
                        : <select value="nao" disabled title={AVISO_DIGISAC} aria-label="Conexão do Digisac"><option value="nao">Não cadastrar no Digisac</option></select>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      {dados && <p className="muted small" style={{ marginTop: 10 }}>{visiveis.length} de {dados.linhas.length} número(s). Grupos e conversas em modo Ignorada não aparecem. Até {LOTE_CONTATOS_MAX} contatos por vez; quem já existe no destino é pulado.</p>}
    </div>
  );
}
