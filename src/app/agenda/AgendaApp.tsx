"use client";
import { useEffect, useMemo, useState } from "react";

type Ev = { id: string; titulo: string; inicio: string; fim: string; diaInteiro: boolean; local: string | null; meet: string | null; link: string;
  convidados: { email: string; nome?: string; resposta?: string }[]; minhaResposta: string | null; descricao: string | null; organizador: string | null };

const TZ = "America/Sao_Paulo";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const hm = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const nomeDia = (d: string) => new Date(`${d}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });
const somaDias = (d: string, n: number) => ymd(new Date(new Date(`${d}T12:00:00-03:00`).getTime() + n * 86400000));
const RESP: Record<string, string> = { accepted: "✅ confirmado", declined: "❌ recusado", tentative: "❔ talvez", needsAction: "⏳ não respondido" };

export default function AgendaApp() {
  const hoje = ymd(new Date());
  const [inicio, setInicio] = useState(hoje);
  const [dias, setDias] = useState(7);
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aberto, setAberto] = useState<Ev | null>(null);
  const [form, setForm] = useState<any>(null);
  const [conflito, setConflito] = useState<any[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [agora, setAgora] = useState(Date.now());

  async function carregar() {
    setCarregando(true); setErro("");
    const j = await fetch(`/api/agenda/eventos?de=${inicio}&dias=${dias}`).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setCarregando(false);
    if (j.ativo === false) { setErro("Falta a variável GOOGLE_SERVICE_ACCOUNT_JSON na Vercel (copie do Painel DP)."); return; }
    if (j.erro) setErro(j.erro);
    setEventos(j.eventos || []);
  }
  useEffect(() => { carregar(); }, [inicio, dias]);
  useEffect(() => { const t = setInterval(() => { setAgora(Date.now()); if (!document.hidden && !form) carregar(); }, 60000); return () => clearInterval(t); }, [inicio, dias, form]);

  const porDia = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (let i = 0; i < dias; i++) m.set(somaDias(inicio, i), []);
    for (const e of eventos) { const d = ymd(new Date(e.inicio)); if (m.has(d)) m.get(d)!.push(e); }
    return Array.from(m.entries());
  }, [eventos, inicio, dias]);

  function novo(dia = hoje) {
    const prox = new Date(Math.ceil(Date.now() / 1800000) * 1800000);
    setForm({ titulo: "", data: dia, hora: dia === hoje ? hm(prox.toISOString()) : "09:00", duracao: 30, convidados: "", comMeet: true, descricao: "" });
    setConflito(null); setAviso("");
  }
  async function salvar(forcar = false) {
    setSalvando(true); setAviso("");
    const j = await fetch("/api/agenda/criar", { method: "POST", body: JSON.stringify({ ...form, forcar }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setSalvando(false);
    if (j.conflito) { setConflito(j.conflito); return; }
    if (j.erro) { setAviso(j.erro); return; }
    setForm(null); setConflito(null); setAviso("Reunião criada ✓" + (j.evento?.meet ? " com link do Meet" : "")); carregar();
  }
  async function responder(id: string, resposta: string) {
    const j = await fetch("/api/agenda/responder", { method: "POST", body: JSON.stringify({ id, resposta }) }).then(r => r.json());
    if (j.erro) setAviso(j.erro); else { setAberto(j.evento); carregar(); }
  }
  async function apagar(id: string) {
    if (!confirm("Apagar este evento? Se tiver convidados, eles recebem o cancelamento.")) return;
    const j = await fetch("/api/agenda/apagar", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json());
    if (j.erro) setAviso(j.erro); else { setAberto(null); carregar(); }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Agenda</h1>
        <div className="acoes">
          <button className="sec" onClick={() => setInicio(somaDias(inicio, -dias))}>‹</button>
          <button className="sec" onClick={() => setInicio(hoje)}>Hoje</button>
          <button className="sec" onClick={() => setInicio(somaDias(inicio, dias))}>›</button>
          <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ width: "auto" }}>
            <option value={1}>1 dia</option><option value={3}>3 dias</option><option value={7}>7 dias</option><option value={14}>14 dias</option>
          </select>
        </div>
        <div style={{ marginLeft: "auto" }}><button onClick={() => novo()}>+ Nova reunião</button></div>
      </div>
      {erro && <div className="aviso erro" style={{ marginTop: 8 }}>{erro}</div>}
      {aviso && <div className="aviso" style={{ marginTop: 8 }}>{aviso}</div>}
      {carregando && !eventos.length && <p className="muted">Carregando…</p>}

      <div style={{ display: "grid", gridTemplateColumns: dias === 1 ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))", gap: 14, marginTop: 14 }}>
        {porDia.map(([dia, evs]) => (
          <div key={dia} className="card" style={{ borderTop: dia === hoje ? "3px solid var(--laranja)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ textTransform: "capitalize", color: "var(--navy)" }}>{dia === hoje ? "Hoje · " : ""}{nomeDia(dia)}</b>
              <button className="linkbtn small" onClick={() => novo(dia)}>+ marcar</button>
            </div>
            {!evs.length && <p className="muted small" style={{ margin: "8px 0 0" }}>Livre.</p>}
            {evs.map(e => {
              const agoraMesmo = new Date(e.inicio).getTime() <= agora && new Date(e.fim).getTime() > agora;
              const passou = new Date(e.fim).getTime() < agora;
              return (
                <div key={e.id} onClick={() => setAberto(e)} style={{ cursor: "pointer", padding: "7px 9px", marginTop: 8, borderRadius: 8, opacity: passou ? .55 : 1,
                  background: agoraMesmo ? "var(--ambar-bg)" : e.minhaResposta === "needsAction" ? "var(--superficie)" : "var(--superficie-2)",
                  border: e.minhaResposta === "needsAction" ? "1px dashed var(--azul)" : "1px solid var(--line)" }}>
                  <div className="small muted">{e.diaInteiro ? "dia inteiro" : `${hm(e.inicio)}–${hm(e.fim)}`}{agoraMesmo ? " · agora" : ""}</div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.titulo}</div>
                  <div className="small muted">{e.meet ? "🎥 Meet · " : ""}{e.convidados.length ? `${e.convidados.length} pessoa(s)` : ""}{e.minhaResposta === "needsAction" ? " · responder convite" : ""}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {aberto && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setAberto(null); }}>
        <div className="modal-caixa" style={{ width: 520 }}>
          <b style={{ fontSize: 16 }}>{aberto.titulo}</b>
          <div className="muted small" style={{ textTransform: "capitalize" }}>{nomeDia(ymd(new Date(aberto.inicio)))} · {aberto.diaInteiro ? "dia inteiro" : `${hm(aberto.inicio)}–${hm(aberto.fim)}`}</div>
          {aberto.meet && <a className="botao" href={aberto.meet} target="_blank" style={{ marginTop: 8, width: "fit-content" }}>🎥 Entrar no Meet</a>}
          {aberto.local && <div className="small">📍 {aberto.local}</div>}
          {aberto.convidados.length > 0 && <div className="small" style={{ marginTop: 6 }}><b>Convidados</b>{aberto.convidados.map(c => <div key={c.email}>{c.nome || c.email} <span className="muted">{RESP[c.resposta || ""] || ""}</span></div>)}</div>}
          {aberto.descricao && <div className="trecho" style={{ whiteSpace: "pre-wrap", fontStyle: "normal", maxHeight: 200, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: aberto.descricao.replace(/<(?!\/?(b|i|br|a|p|ul|li)\b)[^>]*>/gi, "") }} />}
          {aberto.minhaResposta && <div className="acoes" style={{ marginTop: 8 }}>
            <span className="small">Sua resposta: {RESP[aberto.minhaResposta] || aberto.minhaResposta}</span>
            <button className="mini ok" onClick={() => responder(aberto.id, "accepted")}>Vou</button>
            <button className="mini sec" onClick={() => responder(aberto.id, "tentative")}>Talvez</button>
            <button className="mini sec" onClick={() => responder(aberto.id, "declined")}>Não vou</button>
          </div>}
          <div className="acoes" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <a className="botao" href={aberto.link} target="_blank">Abrir no Google Agenda</a>
            <button className="perigo" onClick={() => apagar(aberto.id)}>Apagar</button>
            <button className="sec" onClick={() => setAberto(null)}>Fechar</button>
          </div>
        </div>
      </div>}

      {form && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setForm(null); }}>
        <div className="modal-caixa" style={{ width: 480 }}>
          <b style={{ fontSize: 16 }}>Nova reunião</b>
          <label>Título<input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Call com Camila" autoFocus /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <label>Dia<input type="date" value={form.data} onChange={e => { setForm({ ...form, data: e.target.value }); setConflito(null); }} /></label>
            <label>Hora<input type="time" value={form.hora} onChange={e => { setForm({ ...form, hora: e.target.value }); setConflito(null); }} /></label>
            <label>Duração<select value={form.duracao} onChange={e => setForm({ ...form, duracao: Number(e.target.value) })}>
              {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
          </div>
          <label>Convidados (e-mails, opcional — eles recebem o convite)<input value={form.convidados} onChange={e => setForm({ ...form, convidados: e.target.value })} placeholder="camila@empresa.com.br" /></label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}><input type="checkbox" style={{ width: "auto" }} checked={form.comMeet} onChange={e => setForm({ ...form, comMeet: e.target.checked })} /> Criar link do Google Meet</label>
          <label>Observação<textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></label>
          {conflito && <div className="aviso erro">⚠️ Nesse horário você já tem: {conflito.map((c, i) => <div key={i}><b>{c.titulo}</b> ({hm(c.inicio)}–{hm(c.fim)})</div>)}</div>}
          {aviso && <p className="small" style={{ color: "var(--vermelho)" }}>{aviso}</p>}
          <div className="acoes" style={{ marginTop: 8, justifyContent: "flex-end" }}>
            <button className="sec" onClick={() => setForm(null)}>Cancelar</button>
            {conflito ? <button className="perigo" onClick={() => salvar(true)} disabled={salvando}>Marcar mesmo assim</button>
              : <button onClick={() => salvar(false)} disabled={salvando || !form.titulo.trim()}>{salvando ? "Salvando…" : "Marcar"}</button>}
          </div>
        </div>
      </div>}
    </>
  );
}
