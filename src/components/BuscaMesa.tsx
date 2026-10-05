"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import TarefaCard from "./TarefaCard";
import EmailsEsperando from "./EmailsEsperando";
import Destaque from "./Destaque";
import { dataHora } from "@/lib/fmt";

// Pesquisa da tela Hoje: acha tarefas (abertas ou todas), e-mails e conversas no servidor.
// Atalhos: "/" ou Ctrl+K focam o campo; Esc limpa. Os cartões são os mesmos da tela (Feito, Resolver com IA, Responder…).
type Resultado = { q: string; tarefas: any[]; emails: any[]; conversas: any[]; gmail?: boolean; erro?: string };
const CHAVE_FILTRO = "mesa.busca.tarefas";

export default function BuscaMesa({ versao }: { versao?: number }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"abertas" | "todas">("todas");
  const [res, setRes] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const pedido = useRef(0);
  const gmailExtra = useRef<any[]>([]); // e-mails que só o Gmail achou (mantidos na atualização automática)

  useEffect(() => {
    try { const v = localStorage.getItem(CHAVE_FILTRO); if (v === "abertas" || v === "todas") setFiltro(v); } catch { /* sem armazenamento */ }
  }, []);

  const buscar = useCallback(async (termo: string, f: string, silencioso = false) => {
    const t = termo.trim();
    const n = ++pedido.current;
    if (t.length < 2) { setRes(null); setCarregando(false); return; }
    if (!silencioso) setCarregando(true);
    try {
      const r = await fetch(`/api/busca?${new URLSearchParams({ q: t, tarefas: f, ...(silencioso ? { gmail: "0" } : {}) })}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({ erro: `HTTP ${r.status}` }));
      if (n !== pedido.current) return; // chegou uma pesquisa mais nova
      if (!r.ok || j.erro) { setRes({ q: t, tarefas: [], emails: [], conversas: [], erro: j.erro || `HTTP ${r.status}` }); return; }
      if (!silencioso) gmailExtra.current = (j.emails || []).filter((e: any) => e.fonte === "gmail");
      else {
        const ja = new Set((j.emails || []).map((e: any) => e.thread_id));
        j.emails = [...(j.emails || []), ...gmailExtra.current.filter(e => !ja.has(e.thread_id))]
          .sort((a: any, b: any) => new Date(b.recebido_em || 0).getTime() - new Date(a.recebido_em || 0).getTime());
      }
      setRes(j);
    } catch (e: any) {
      if (n === pedido.current && !silencioso) setRes({ q: t, tarefas: [], emails: [], conversas: [], erro: String(e?.message || e) });
    } finally { if (n === pedido.current) setCarregando(false); }
  }, []);

  // digitação: espera 300 ms
  useEffect(() => {
    const tm = setTimeout(() => buscar(q, filtro), 300);
    return () => clearTimeout(tm);
  }, [q, filtro, buscar]);

  // a tela foi atualizada (ação num cartão ou atualização automática): pesquisa de novo sem piscar
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    if (q.trim().length >= 2) buscar(q, filtro, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao]);

  // atalhos "/" e Ctrl+K
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName));
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); campo.current?.focus(); campo.current?.select(); }
      else if (e.key === "/" && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); campo.current?.focus(); }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  function trocarFiltro(f: "abertas" | "todas") {
    setFiltro(f);
    try { localStorage.setItem(CHAVE_FILTRO, f); } catch { /* sem armazenamento */ }
  }
  const limpar = () => { setQ(""); setRes(null); gmailExtra.current = []; };
  const deNovo = () => buscar(q, filtro, true);
  const ativo = q.trim().length >= 2;
  const termo = res?.q || q;

  return <>
    <div className="bm-campo" role="search">
      <span className="bm-lupa" aria-hidden="true">⌕</span>
      <input ref={campo} type="search" value={q} placeholder="Pesquisar tarefa, e-mail, conversa…"
        aria-label="Pesquisar tarefas, e-mails e conversas" autoComplete="off" spellCheck={false}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); limpar(); } }} />
      {q ? <button type="button" className="bm-x" onClick={() => { limpar(); campo.current?.focus(); }} aria-label="Limpar pesquisa">✕</button>
        : <kbd className="bm-kbd" title="Atalho: / ou Ctrl+K">/</kbd>}
    </div>

    {ativo && <section className="bm-painel" aria-label="Resultado da pesquisa" aria-busy={carregando}>
      <div className="bm-cab">
        <strong>{carregando && !res ? "Pesquisando…" : res?.erro ? "Não deu para pesquisar" : `Resultado para “${termo.trim()}”`}</strong>
        {carregando && res ? <span className="small muted">atualizando…</span> : null}
        <div className="abas hk-visao bm-filtro" role="group" aria-label="Quais tarefas">
          <button type="button" className={filtro === "abertas" ? "ativa" : ""} aria-pressed={filtro === "abertas"} onClick={() => trocarFiltro("abertas")}>Tarefas abertas</button>
          <button type="button" className={filtro === "todas" ? "ativa" : ""} aria-pressed={filtro === "todas"} onClick={() => trocarFiltro("todas")}>Todas</button>
        </div>
        <button type="button" className="linkbtn" onClick={limpar}>fechar (Esc)</button>
      </div>
      {res?.erro ? <div className="aviso erro">{res.erro}</div> : null}
      {res && !res.erro ? <div className="bm-grade">
        <div>
          <h2>Tarefas <span className="contador">{res.tarefas.length}</span></h2>
          {res.tarefas.length ? res.tarefas.map(t => <TarefaCard key={t.id} t={t} busca={termo} />)
            : <div className="vazio">Nenhuma tarefa {filtro === "abertas" ? "aberta " : ""}com “{termo.trim()}”.{filtro === "abertas" ? " Tente “Todas”." : ""}</div>}
        </div>
        <div>
          <h2>E-mails <span className="contador">{res.emails.length}</span></h2>
          <EmailsEsperando emails={res.emails} busca={termo} aoMudar={deNovo} vazio={`Nenhum e-mail com “${termo.trim()}”.`} />
          {res.conversas.length ? <>
            <h2>Conversas <span className="contador">{res.conversas.length}</span></h2>
            {res.conversas.map(c => (
              <div className="card" key={c.id}>
                <div className="linha">
                  <span className="selo inst">{c.canal}</span>
                  <a className="titulo" href={`/whatsapp?c=${c.id}`}>{c.is_grupo ? "👥 " : ""}<Destaque texto={c.nome} termo={termo} /></a>
                </div>
                <div className="meta">{dataHora(c.em)}</div>
                {c.trecho ? <div className="trecho">{c.autor ? `${c.autor}: ` : ""}<Destaque texto={String(c.trecho).slice(0, 400)} termo={termo} /></div> : null}
              </div>
            ))}
          </> : null}
        </div>
      </div> : null}
    </section>}
  </>;
}
