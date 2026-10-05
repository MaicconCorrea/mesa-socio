"use client";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TarefaCard from "./TarefaCard";
import { ROTULO_TIPO } from "@/lib/fmt";
import { concluirTarefasLote, descartarTarefasLote, mudarPrazoTarefasLote, type ResultadoLote } from "@/app/actions";

// Tela Hoje: lista em blocos ou Kanban por tipo, com seleção em lote (estado só no navegador)
type T = any;
type Visao = "lista" | "kanban";
const CHAVE_VISAO = "mesa.hoje.visao";
const LOTE_MAX = 200;
const ORDEM_TIPOS = ["promessa", "pedido", "reuniao", "outro"]; // Prometi, Pedido, Reunião, Anotação

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
const diaBR = (iso: string) => iso.split("-").reverse().join("/");
const hojeLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default function HojeTarefas({ agora, fim, atrasadas, deHoje, proximas, semPrazo, abas, anotar, lateral }: {
  agora: number; fim: number;
  atrasadas: T[]; deHoje: T[]; proximas: T[]; semPrazo: T[];
  abas: ReactNode; anotar: ReactNode; lateral: ReactNode;
}) {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>("lista");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const ultimo = useRef<{ bloco: string; idx: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [prazoAberto, setPrazoAberto] = useState(false);
  const [novoDia, setNovoDia] = useState("");
  const [aviso, setAviso] = useState<{ txt: string; erro?: boolean } | null>(null);

  useEffect(() => {
    try { const v = localStorage.getItem(CHAVE_VISAO); if (v === "lista" || v === "kanban") setVisao(v); } catch { /* sem armazenamento */ }
  }, []);
  function trocarVisao(v: Visao) {
    setVisao(v); ultimo.current = null;
    try { localStorage.setItem(CHAVE_VISAO, v); } catch { /* sem armazenamento */ }
  }

  const todas = useMemo(() => [...atrasadas, ...deHoje, ...proximas, ...semPrazo], [atrasadas, deHoje, proximas, semPrazo]);

  // Depois de atualizar a tela, tira da seleção o que não está mais aberto
  useEffect(() => {
    const existe = new Set(todas.map(t => t.id));
    setSel(s => { const n = new Set(Array.from(s).filter(id => existe.has(id))); return n.size === s.size ? s : n; });
  }, [todas]);

  useEffect(() => {
    if (!aviso || aviso.erro) return;
    const tm = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(tm);
  }, [aviso]);

  const classeDe = (t: T) => {
    if (!t.prazo) return "";
    const p = new Date(t.prazo).getTime();
    return p < agora ? "atrasada" : p <= fim ? "hoje" : "";
  };

  function marcar(bloco: string, lista: T[], idx: number, valor: boolean, shift: boolean) {
    const anterior = ultimo.current;
    setSel(s => {
      const n = new Set(s);
      if (shift && anterior && anterior.bloco === bloco && anterior.idx < lista.length) {
        const [a, b] = [Math.min(anterior.idx, idx), Math.max(anterior.idx, idx)];
        for (let i = a; i <= b; i++) valor ? n.add(lista[i].id) : n.delete(lista[i].id);
      } else valor ? n.add(lista[idx].id) : n.delete(lista[idx].id);
      return n;
    });
    ultimo.current = { bloco, idx };
  }
  function marcarTodas(lista: T[], valor: boolean) {
    setSel(s => { const n = new Set(s); lista.forEach(t => (valor ? n.add(t.id) : n.delete(t.id))); return n; });
  }

  function selTodas(lista: T[]) {
    if (!lista.length) return null;
    const todasMarcadas = lista.every(t => sel.has(t.id));
    return <button type="button" className="linkbtn hk-seltodas" onClick={() => marcarTodas(lista, !todasMarcadas)}>
      {todasMarcadas ? "Limpar" : "Selecionar todas"}
    </button>;
  }

  const cartao = (t: T, bloco: string, lista: T[], idx: number, compacto = false) => {
    const c = classeDe(t);
    return <TarefaCard key={t.id} t={t} compacto={compacto}
      classe={compacto ? (c === "atrasada" ? c : "") : bloco === "atrasadas" ? "atrasada" : bloco === "hoje" ? "hoje" : ""}
      selecionada={sel.has(t.id)} onSelecionar={(v, shift) => marcar(bloco, lista, idx, v, shift)} />;
  };

  // ---- ações em lote ----
  const n = sel.size;
  async function rodar(acao: (ids: string[]) => Promise<ResultadoLote>, msg: (n: number) => string) {
    const ids = Array.from(sel);
    if (!ids.length || ids.length > LOTE_MAX) return;
    setOcupado(true); setAviso(null);
    try {
      const r = await acao(ids);
      if (!r.ok) { setAviso({ txt: "Não deu certo: " + r.erro, erro: true }); return; }
      setSel(new Set()); setPrazoAberto(false); ultimo.current = null;
      setAviso({ txt: msg(r.n || 0) });
      router.refresh();
    } catch (e: any) {
      setAviso({ txt: "Não deu certo: " + (e?.message || e), erro: true });
    } finally { setOcupado(false); }
  }
  const feito = () => rodar(concluirTarefasLote, k => plural(k, "tarefa marcada como feita", "tarefas marcadas como feitas"));
  const descartar = () => {
    if (!window.confirm(`Descartar ${plural(n, "tarefa", "tarefas")}?`)) return;
    rodar(descartarTarefasLote, k => plural(k, "tarefa descartada", "tarefas descartadas"));
  };
  const aplicarPrazo = () => {
    if (!novoDia) return;
    const dia = novoDia;
    rodar(ids => mudarPrazoTarefasLote(ids, dia), k => `Prazo de ${plural(k, "tarefa", "tarefas")} mudado para ${diaBR(dia)}`);
  };

  // ---- Lista ----
  const blocos: { id: string; titulo: string; contador: boolean; vazio: string; lista: T[] }[] = [
    { id: "atrasadas", titulo: "🔥 Atrasadas", contador: true, vazio: "Nada atrasado.", lista: atrasadas },
    { id: "hoje", titulo: "📅 Para hoje", contador: true, vazio: "Nada com prazo hoje.", lista: deHoje },
    { id: "proximas", titulo: "🗓️ Próximos dias", contador: false, vazio: "Nada agendado.", lista: proximas },
    { id: "semprazo", titulo: "📌 Sem prazo", contador: false, vazio: "Nada.", lista: semPrazo },
  ];

  // ---- Kanban: uma coluna por tipo; dentro, atrasadas primeiro e depois por prazo ----
  const colunas = useMemo(() => {
    const porPrazo = (a: T, b: T) => (a.prazo ? new Date(a.prazo).getTime() : Infinity) - (b.prazo ? new Date(b.prazo).getTime() : Infinity);
    const extras = Array.from(new Set(todas.map(t => t.tipo).filter((x: any) => x && !ORDEM_TIPOS.includes(x)))) as string[];
    const cols = [...ORDEM_TIPOS, ...extras].map(tipo => ({
      id: `tipo-${tipo}`, tipo, nome: ROTULO_TIPO[tipo] || tipo,
      lista: todas.filter(t => t.tipo === tipo).sort(porPrazo),
    }));
    const semTipo = todas.filter(t => !t.tipo).sort(porPrazo);
    if (semTipo.length) cols.push({ id: "tipo-outros", tipo: "", nome: "Outros", lista: semTipo });
    return cols;
  }, [todas]);

  return <>
    <div className="hk-topo">
      {abas}
      <div className="abas hk-visao" role="group" aria-label="Como mostrar as tarefas">
        <button type="button" className={visao === "lista" ? "ativa" : ""} aria-pressed={visao === "lista"} onClick={() => trocarVisao("lista")}>Lista</button>
        <button type="button" className={visao === "kanban" ? "ativa" : ""} aria-pressed={visao === "kanban"} onClick={() => trocarVisao("kanban")}>Kanban</button>
      </div>
    </div>

    {anotar}

    {visao === "lista" ? (
      <div className="grade">
        <div>
          {blocos.map(b => <section key={b.id} aria-label={b.titulo.replace(/^\S+\s/, "")}>
            <h2 className="hk-h2">
              <span>{b.titulo} {b.contador && b.lista.length ? <span className="contador">{b.lista.length}</span> : null}</span>
              {selTodas(b.lista)}
            </h2>
            {b.lista.length ? b.lista.map((t, i) => cartao(t, b.id, b.lista, i)) : <div className="vazio">{b.vazio}</div>}
          </section>)}
        </div>
        <div>{lateral}</div>
      </div>
    ) : (
      <>
        <div className="hk-kanban" role="list" aria-label="Tarefas por tipo">
          {colunas.map(c => <section key={c.id} className="hk-col" role="listitem" aria-label={`${c.nome}: ${c.lista.length}`}>
            <div className="hk-col-cab">
              <span className={`selo ${c.tipo || "outro"}`}>{c.nome}</span>
              <span className="hk-col-n">{c.lista.length}</span>
              {selTodas(c.lista)}
            </div>
            {c.lista.length ? c.lista.map((t, i) => cartao(t, c.id, c.lista, i, true)) : <div className="hk-col-vazia">Nada aqui.</div>}
          </section>)}
        </div>
        <div className="hk-abaixo">{lateral}</div>
      </>
    )}

    {(n > 0 || aviso) && <div className="hk-rodape">
      {aviso && <div className={`aviso${aviso.erro ? " erro" : ""} hk-aviso`} role="status">
        <span>{aviso.txt}</span>
        <button type="button" className="linkbtn" onClick={() => setAviso(null)}>fechar</button>
      </div>}
      {n > 0 && <div className="hk-lote" role="region" aria-label="Ações nas tarefas selecionadas">
        <span className="hk-lote-n" aria-live="polite">{n} selecionada{n > 1 ? "s" : ""}{n > LOTE_MAX ? ` — no máximo ${LOTE_MAX} por vez` : ""}</span>
        {prazoAberto ? <>
          <label className="hk-lote-data"><span className="hk-sr">Novo prazo</span>
            <input type="date" value={novoDia} onChange={e => setNovoDia(e.target.value)} autoFocus />
          </label>
          <button type="button" onClick={aplicarPrazo} disabled={ocupado || !novoDia || n > LOTE_MAX}>{ocupado ? "Aplicando…" : "Aplicar"}</button>
          <button type="button" className="sec" onClick={() => setPrazoAberto(false)} disabled={ocupado}>Cancelar</button>
        </> : <>
          <button type="button" onClick={feito} disabled={ocupado || n > LOTE_MAX}>{ocupado ? "Aplicando…" : "✓ Feito"}</button>
          <button type="button" className="perigo" onClick={descartar} disabled={ocupado || n > LOTE_MAX}>Descartar</button>
          <button type="button" className="sec" onClick={() => { setNovoDia(novoDia || hojeLocal()); setPrazoAberto(true); }} disabled={ocupado}>Mudar prazo</button>
        </>}
        <button type="button" className="sec" onClick={() => { setSel(new Set()); setPrazoAberto(false); ultimo.current = null; }} disabled={ocupado}>Limpar seleção</button>
      </div>}
    </div>}
  </>;
}
