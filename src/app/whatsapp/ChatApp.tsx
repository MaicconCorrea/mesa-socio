"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ligarPush, statusPush } from "@/lib/push-cliente";
import MandarSetor from "@/components/MandarSetor";
import BolhaIA from "@/components/BolhaIA";

type Conversa = {
  id: string; instancia: string; jid: string; nome: string; is_grupo: boolean; modo: string;
  ultima_msg_em: string | null; ultima_msg_de_mim: boolean | null; ultima_msg_texto: string | null;
  nao_lidas: number; precisa_resposta: boolean; sem_retorno: boolean; resumo: string | null; foto_url?: string | null; fixada_em?: string | null;
};
type Msg = { apagada?: boolean; editada?: boolean;
  id: string; msg_id: string; de_mim: boolean; autor: string | null; texto: string | null; enviada_em: string;
  me_citou: boolean; tipo: string | null; midia_mime: string | null; midia_nome: string | null; tem_midia: boolean; citada_texto?: string | null; transcricao?: string | null; transcricao_erro?: string | null;
};
const MAX_ARQ = 3 * 1024 * 1024; // limite da Vercel pro envio (~3 MB)

function lerBase64(f: Blob): Promise<string> {
  return new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => falha(r.error); r.readAsDataURL(f); });
}
function bip() {
  try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.18); } catch {}
}

const MODOS: Record<string, string> = {
  auto: "🤖 Automático", grupo: "👥 Grupo do escritório", pessoal: "🏠 Pessoal", ignorada: "🚫 Ignorada",
};
const VISOES: [string, string][] = [
  ["todas", "Todas"], ["fixadas", "📌 Fixadas"], ["naolidas", "Não lidas"], ["esperando", "Esperando você"],
  ["auto", "🤖 Automático"], ["grupo", "👥 Grupos do escritório"], ["pessoal", "🏠 Pessoal"], ["ignorada", "🚫 Ignoradas"],
];

const hora = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), hoje = new Date();
  const mesmoDia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return d.toLocaleString("pt-BR", mesmoDia
    ? { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const semMarcador = (t?: string | null) => (t || "").replace(/^\[(imagem|vídeo|áudio|documento[^\]]*)\]\s*/, "");
const iniciais = (n: string) => (n || "?").replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";

// Renderiza texto com links clicáveis (http, https e www.)
function renderizarComLinks(texto?: string | null) {
  if (!texto) return null;
  const partes = texto.split(/((?:https?:\/\/|www\.)[^\s<>"]+)/gi);
  return <>{partes.map((p, i) => {
    if (i % 2 === 0) return p ? <span key={i}>{p}</span> : null; // split com grupo: ímpares são os links
    const limpo = p.replace(/[.,;:!?)\]]+$/, ""), resto = p.slice(limpo.length);
    const href = /^www\./i.test(limpo) ? "https://" + limpo : limpo;
    return <span key={i}><a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}>{limpo}</a>{resto}</span>;
  })}</>;
}

export default function ChatApp() {
  const [conexoes, setConexoes] = useState<string[]>([]);
  const [nomesCx, setNomesCx] = useState<Record<string, string>>({});
  const instRef = useRef<string | null>(null);
  const [apagando, setApagando] = useState<any | null>(null);
  const [editando, setEditando] = useState<{ m: any; texto: string } | null>(null);
  const [encaminhando, setEncaminhando] = useState<{ busca: string; destino: any | null; numero: string; instancia: string } | null>(null);
  const [encaminhandoAgora, setEncaminhandoAgora] = useState(false);
  const [contatosEnc, setContatosEnc] = useState<any[]>([]);
  // marcar pessoas com @ (grupos do WhatsApp e espaços do Google Chat)
  const [participantes, setParticipantes] = useState<{ id: string; nome: string }[]>([]);
  const [mencoes, setMencoes] = useState<{ id: string; nome: string }[]>([]);
  const [marcando, setMarcando] = useState<{ termo: string; inicio: number; sel: number } | null>(null);
  const campoTexto = useRef<HTMLTextAreaElement | null>(null);
  const [lista, setLista] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [visao, setVisao] = useState("todas");
  const [conexao, setConexao] = useState("todas");
  const [busca, setBusca] = useState("");
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [conv, setConv] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [mostrarIA, setMostrarIA] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [viewMobile, setViewMobile] = useState<"atendentes" | "lista" | "conversa">("lista");
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const grudado = useRef(true);
  const ultimaQtd = useRef(0);
  const [citada, setCitada] = useState<Msg | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const inputArq = useRef<HTMLInputElement | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segGravando, setSegGravando] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const cancelarGravacao = useRef(false);
  const [avisos, setAvisos] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [abaNova, setAbaNova] = useState<"buscar" | "criar">("buscar"); // aba do modal: buscar contato existente ou criar novo
  const [nova, setNova] = useState({ instancia: "", numero: "", nome: "", texto: "" });
  const [criarContatoAviso, setCriarContatoAviso] = useState("");
  const [buscaContato, setBuscaContato] = useState("");
  const [contatos, setContatos] = useState<any[] | null>(null);
  const [infoContatos, setInfoContatos] = useState<{ total: number; google: string } | null>(null);
  const [sincronizando, setSincronizando] = useState("");
  const [contatoSalvo, setContatoSalvo] = useState(true); // número da conversa aberta está no Google Contatos / Mesa?
  const [novoContato, setNovoContato] = useState<{ nome: string; salvando: boolean; erro: string } | null>(null);
  const anteriores = useRef<Map<string, number> | null>(null);
  const historicoPedido = useRef<Set<string>>(new Set());
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [visor, setVisor] = useState<Msg | null>(null); // foto/PDF aberto por cima
  const [setor, setSetor] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [transcrevendo, setTranscrevendo] = useState<Set<string>>(new Set());
  const [sugerindo, setSugerindo] = useState(false);
  const [dispensada, setDispensada] = useState<string | null>(null);
  const [instrucao, setInstrucao] = useState<string | null>(null);

  const midiasVisor = useMemo(() => (msgs || []).filter(m => m.tem_midia && (m.tipo === "imagem" || (m.midia_mime || "").includes("pdf"))), [msgs]);
  const moverVisor = useCallback((d: number) => {
    setVisor(v => {
      if (!v) return v;
      const i = midiasVisor.findIndex(m => m.id === v.id);
      const n = midiasVisor[i + d];
      return n || v;
    });
  }, [midiasVisor]);
  useEffect(() => {
    if (!visor) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisor(null);
      if (e.key === "ArrowLeft") moverVisor(-1);
      if (e.key === "ArrowRight") moverVisor(1);
    };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [visor, moverVisor]);
  useEffect(() => {
    try {
      setAvisos(localStorage.getItem("avisos-whats") === "1" && "Notification" in window && Notification.permission === "granted");
    } catch {}
  }, []);

  const cx = (inst: string) => `cx cx-${Math.max(0, conexoes.indexOf(inst)) % 3}`;
  const rotuloCx = (inst: string) => inst === "gchat" ? "🗨️ Google Chat" : "📱 " + (nomesCx[inst] || inst.replace(/^socio-/, ""));

  // ---- lista (atualiza a cada 4s) ----
  const carregarLista = useCallback(async () => {
    try {
      const j = await fetch("/api/chat/lista", { cache: "no-store" }).then(r => r.json());
      if (j.erro) { setErroLista(j.erro); return; }
      const convs: Conversa[] = j.conversas || [];
      setConexoes(j.conexoes || []); setNomesCx(j.nomes || {}); setLista(convs); setErroLista("");
      // avisos de mensagem nova (conversas individuais e pessoais; grupos só quando falam com você)
      const antes = anteriores.current;
      const agora = new Map(convs.map(c => [c.id, c.nao_lidas || 0]));
      if (antes) {
        const novas = convs.filter(c => c.modo !== "ignorada" && (c.nao_lidas || 0) > (antes.get(c.id) || 0)
          && (c.modo !== "grupo" || c.precisa_resposta));
        if (novas.length) avisarNovas(novas);
      }
      anteriores.current = agora;
      const total = convs.filter(c => c.modo === "auto" || c.modo === "pessoal").reduce((s2, c) => s2 + (c.nao_lidas || 0), 0);
      document.title = (total ? `(${total}) ` : "") + "WhatsApp · Mesa do Sócio";
    } catch { /* rede */ } finally { setCarregando(false); }
  }, []);
  const avisosRef = useRef(false); avisosRef.current = avisos;
  const pushLigado = useRef(false);
  useEffect(() => { statusPush().then(s => { pushLigado.current = s === "ligado"; }).catch(() => {}); }, [avisos]);
  const ativoRef = useRef<string | null>(null); ativoRef.current = ativoId;
  function avisarNovas(novas: Conversa[]) {
    if (!avisosRef.current) return;
    const relevantes = novas.filter(c => document.hidden || c.id !== ativoRef.current);
    if (!relevantes.length) return;
    bip();
    if (pushLigado.current) return; // o aviso do sistema já vem pelo push (evita duplicar)
    for (const c of relevantes.slice(0, 3)) {
      try {
        const n = new Notification(`${c.nome} · ${rotuloCx(c.instancia)}`, { body: c.ultima_msg_texto || "Mensagem nova", tag: c.id, icon: "/icone-192.png" });
        n.onclick = () => { window.focus(); setAtivoId(c.id); setViewMobile("conversa"); n.close(); };
      } catch {}
    }
  }
  useEffect(() => {
    carregarLista();
    const t = setInterval(() => { if (document.visibilityState === "visible") carregarLista(); }, 4000);
    return () => clearInterval(t);
  }, [carregarLista]);

  // abre a conversa vinda de um link (?c=id)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("c");
    if (c) { setAtivoId(c); setViewMobile("conversa"); }
    const cxp = sp.get("cx");
    if (cxp) setConexao(cxp);
  }, []);

  // ---- conversa ativa (atualiza a cada 3s) ----
  const irProFim = () => { const el = msgsRef.current; if (el) el.scrollTop = el.scrollHeight; setNovasAbaixo(0); };
  // guarda as conversas já abertas: trocar de conversa mostra na hora e só depois atualiza
  const cacheConv = useRef(new Map<string, { conversa: any; mensagens: Msg[]; tarefas: any[] }>());
  const buscando = useRef(new Set<string>());
  const carregarConversa = useCallback(async (id: string, primeira = false) => {
    if (!primeira && buscando.current.has(id)) return; // não empilha pedidos
    buscando.current.add(id);
    const j = await fetch(`/api/chat/conversa?id=${id}`, { cache: "no-store" }).then(r => r.json()).catch(() => null).finally(() => buscando.current.delete(id));
    if (!j || j.erro) return;
    cacheConv.current.set(id, { conversa: j.conversa, mensagens: j.mensagens || [], tarefas: j.tarefas || [] });
    if (id !== ativoRef.current) return; // resposta de uma conversa que você já deixou: não mexe na tela
    setConv(j.conversa); setTarefas(j.tarefas || []);
    setMsgs(j.mensagens || []);
    const qtd = (j.mensagens || []).length;
    if (primeira) { ultimaQtd.current = qtd; grudado.current = true; setTimeout(irProFim, 30); }
    else if (qtd > ultimaQtd.current) {
      if (grudado.current) setTimeout(irProFim, 30); else setNovasAbaixo(n => n + (qtd - ultimaQtd.current));
      ultimaQtd.current = qtd;
    }
    if (j.conversa?.nao_lidas > 0) {
      fetch("/api/chat/lida", { method: "POST", body: JSON.stringify({ id }) });
      setLista(l => l.map(c => c.id === id ? { ...c, nao_lidas: 0 } : c));
    }
  }, []);
  useEffect(() => {
    ativoRef.current = ativoId;
    if (!ativoId) return;
    setChat([]); setAviso(""); setNovasAbaixo(0); setCitada(null); setArquivos([]);
    setSelecionando(false); setSel(new Set()); setInstrucao(null);
    setParticipantes([]); setMencoes([]); setMarcando(null);
    { const alvo = ativoId; fetch(`/api/chat/participantes?id=${alvo}`).then(r => r.json()).then(j => { if (alvo === ativoRef.current) setParticipantes(j.participantes || []); }).catch(() => {}); }
    const cache = cacheConv.current.get(ativoId);
    if (cache) { // já abriu antes: mostra na hora
      setConv(cache.conversa); setTarefas(cache.tarefas); setMsgs(cache.mensagens);
      ultimaQtd.current = cache.mensagens.length; grudado.current = true; setTimeout(irProFim, 0);
    } else { setMsgs(null); setConv(null); setTarefas([]); }
    carregarConversa(ativoId, !cache);
    if (!historicoPedido.current.has(ativoId)) {
      historicoPedido.current.add(ativoId);
      const id = ativoId;
      fetch("/api/chat/historico", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json())
        .then(j => { if (j.importadas && id === ativoRef.current) carregarConversa(id, true); }).catch(() => {});
    }
    const id = ativoId;
    const t = setInterval(() => { if (document.visibilityState === "visible" && id === ativoRef.current) carregarConversa(id); }, 3000);
    // rede de segurança: a cada 6s busca direto na Evolution o que não chegou pelo aviso (ex.: áudio/foto que você manda pelo celular)
    let varrendo = false;
    const conf = setInterval(() => {
      if (document.visibilityState !== "visible" || varrendo || id !== ativoRef.current) return;
      const instAtual = instRef.current;
      if (!instAtual || instAtual === "gchat") return;
      varrendo = true;
      fetch("/api/chat/varrer", { method: "POST", body: JSON.stringify({ instancia: instAtual }) }).then(r => r.json())
        .then(j => { if (j.novas && id === ativoRef.current) { carregarConversa(id); carregarLista(); } }).catch(() => {}).finally(() => { varrendo = false; });
    }, 6000);
    return () => { clearInterval(t); clearInterval(conf); };
  }, [ativoId, carregarConversa]);

  // contato salvo? (só conversa individual de WhatsApp)
  const jidAtivo = (lista.find(c => c.id === ativoId) || conv)?.jid as string | undefined;
  useEffect(() => {
    setContatoSalvo(true);
    if (!jidAtivo || !jidAtivo.endsWith("@s.whatsapp.net")) return;
    const alvo = jidAtivo;
    fetch(`/api/chat/contato-salvo?jid=${encodeURIComponent(alvo)}`).then(r => r.json())
      .then(j => { if (alvo === jidAtivo) setContatoSalvo(j.salvo !== false); }).catch(() => {});
  }, [jidAtivo]);
  async function salvarContatoDaConversa() {
    if (!novoContato || !ativoId || !jidAtivo) return;
    setNovoContato({ ...novoContato, salvando: true, erro: "" });
    const j = await fetch("/api/chat/contato", { method: "POST", body: JSON.stringify({ numero: jidAtivo.split("@")[0], nome: novoContato.nome, conversaId: ativoId }) })
      .then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { setNovoContato({ ...novoContato, salvando: false, erro: j.erro }); return; }
    setNovoContato(null); setContatoSalvo(true);
    setLista(l => l.map(c => c.id === ativoId ? { ...c, nome: novoContato.nome } : c));
    setAviso(j.google ? "✅ Contato salvo no Google Contatos (vai aparecer no celular)." : "✅ Contato salvo na Mesa. " + (j.aviso ? "Não foi pro Google Contatos: " + j.aviso : ""));
  }

  async function responderPrivado(m: Msg) {
    setAviso("Abrindo conversa no privado…");
    const j = await fetch("/api/chat/privado", { method: "POST", body: JSON.stringify({ mensagemId: m.id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { setAviso("⚠️ " + j.erro); return; }
    const trecho = (m.texto || "").slice(0, 120);
    await carregarLista();
    setAtivoId(j.id); setViewMobile("conversa");
    setTimeout(() => setAviso(trecho ? `🔒 Privado com ${m.autor || "contato"} — sobre: "${trecho}${(m.texto || "").length > 120 ? "…" : ""}"` : ""), 300);
  }

  // caixa de mensagem cresce conforme escreve (até ~metade da tela; depois rola por dentro)
  useEffect(() => {
    const el = campoTexto.current; if (!el) return;
    el.style.height = "auto";
    const max = Math.round(window.innerHeight * 0.18); // caixa + sugestão da IA cabem nos 40% de baixo
    el.style.height = Math.min(Math.max(el.scrollHeight + 2, 64), max) + "px"; // 64 = 2 linhas
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    if (el.selectionStart === el.value.length) el.scrollTop = el.scrollHeight; // escrevendo no fim: mostra a última linha
  }, [texto, ativoId]);

  async function fixar(id: string, valor: boolean) {
    const antes = lista.find(c => c.id === id)?.fixada_em ?? null;
    setLista(l => l.map(c => c.id === id ? { ...c, fixada_em: valor ? new Date().toISOString() : null } : c));
    const j = await fetch("/api/chat/fixar", { method: "POST", body: JSON.stringify({ id, fixar: valor }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { setLista(l => l.map(c => c.id === id ? { ...c, fixada_em: antes } : c)); setAviso("⚠️ " + j.erro); }
  }

  async function naoEsperando(id: string) {
    setLista(l => l.map(c => c.id === id ? { ...c, precisa_resposta: false } : c));
    if (id === ativoId) setConv((c: any) => c ? { ...c, precisa_resposta: false, sugestao: null } : c);
    await fetch("/api/chat/esperando", { method: "POST", body: JSON.stringify({ id }) }).catch(() => {});
  }

  const aoRolar = () => {
    const el = msgsRef.current; if (!el) return;
    grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (grudado.current) setNovasAbaixo(0);
  };

  // ---- filtros ----
  const filtrada = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return lista.filter(c => {
      if (conexao !== "todas" && c.instancia !== conexao) return false;
      if (visao === "ignorada") { if (c.modo !== "ignorada") return false; }
      else if (c.modo === "ignorada") return false;
      if (visao === "naolidas" && !c.nao_lidas) return false;
      if (visao === "esperando" && !(c.precisa_resposta && !c.ultima_msg_de_mim)) return false;
      if (["auto", "grupo", "pessoal"].includes(visao) && c.modo !== visao) return false;
      if (visao === "fixadas" && !c.fixada_em) return false;
      if (b && !(`${c.nome} ${c.jid}`.toLowerCase().includes(b))) return false;
      return true;
    }).sort((a, z) => {
      // fixadas sempre no topo (na ordem em que foram fixadas); o resto mantém a ordem por última mensagem
      if (!!a.fixada_em !== !!z.fixada_em) return a.fixada_em ? -1 : 1;
      if (a.fixada_em && z.fixada_em) return a.fixada_em.localeCompare(z.fixada_em);
      return 0;
    });
  }, [lista, visao, conexao, busca]);

  const contar = (v: string) => lista.filter(c => {
    if (v === "ignorada") return c.modo === "ignorada";
    if (c.modo === "ignorada") return false;
    if (conexao !== "todas" && c.instancia !== conexao) return false;
    if (v === "naolidas") return c.nao_lidas > 0;
    if (v === "fixadas") return !!c.fixada_em;
    if (v === "esperando") return c.precisa_resposta && !c.ultima_msg_de_mim;
    if (["auto", "grupo", "pessoal"].includes(v)) return c.modo === v;
    return true;
  }).length;
  const naoLidasCx = (inst: string) => lista.filter(c => c.instancia === inst && c.modo !== "ignorada").reduce((s, c) => s + (c.nao_lidas || 0), 0);

  const ativo = lista.find(c => c.id === ativoId) || conv;
  instRef.current = ativo?.instancia || null;

  // ---- ações ----
  const enviandoRef = useRef(false);
  async function enviar() {
    const t = texto.trim(); if ((!t && !arquivos.length) || !ativoId) return;
    if (enviandoRef.current) return; // um Enter a mais não manda de novo
    if (arquivos.length) return enviarArquivos();
    enviandoRef.current = true; setEnviando(true); setAviso("");
    const alvo = ativoId, cit = citada, tmp = "tmp-" + Date.now();
    // aparece na hora (com ⏳) enquanto sai
    setTexto(""); setCitada(null); setMencoes([]); setMarcando(null);
    setMsgs(ms => [...(ms || []), { id: tmp, msg_id: tmp, de_mim: true, autor: "", texto: t, enviada_em: new Date().toISOString(), tipo: "texto", tem_midia: false, enviandoAgora: true } as any]);
    grudado.current = true; setTimeout(() => irProFim(), 30);
    const j = await fetch("/api/chat/enviar", { method: "POST", body: JSON.stringify({ id: alvo, texto: t, citadaId: cit?.id || null, mencoes }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    enviandoRef.current = false; setEnviando(false);
    if (j.erro) { setAviso("Não enviou: " + j.erro); setTexto(t); setCitada(cit); setMsgs(ms => (ms || []).filter(x => x.id !== tmp)); return; }
    carregarConversa(alvo); carregarLista();
  }
  async function mudarModo(modo: string) {
    if (!ativoId) return;
    if (modo === "ignorada" && !confirm("Ignorar esta conversa? As mensagens guardadas dela serão apagadas do painel e nada novo será guardado.")) return;
    await fetch("/api/chat/modo", { method: "POST", body: JSON.stringify({ id: ativoId, modo }) });
    carregarLista(); carregarConversa(ativoId);
  }
  async function analisar() {
    if (!ativoId) return;
    setAnalisando(true);
    const j = await fetch("/api/chat/analisar", { method: "POST", body: JSON.stringify({ id: ativoId }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setAnalisando(false);
    setAviso(j.erro ? "IA: " + j.erro : j.criadas ? `IA criou ${j.criadas} tarefa(s).` : "IA analisou: nenhuma tarefa nova.");
    carregarConversa(ativoId);
  }
  async function acaoTarefa(id: string, acao: "feita" | "descartada") {
    await fetch("/api/tarefas/acao", { method: "POST", body: JSON.stringify({ id, acao }) });
    setTarefas(t => t.filter(x => x.id !== id));
  }
  function perguntarRapido(p: string, ids?: string[]) { setPergunta(""); perguntar(p, ids); }
  async function transcrever(id: string) {
    setTranscrevendo(s0 => new Set(s0).add(id));
    const j = await fetch("/api/chat/transcrever", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setTranscrevendo(s0 => { const n = new Set(s0); n.delete(id); return n; });
    if (j.erro) setAviso("Transcrição: " + j.erro);
    if (ativoId) carregarConversa(ativoId);
  }
  async function sugerir(instr = "") {
    if (!ativoId) return;
    setSugerindo(true); setDispensada(null);
    const j = await fetch("/api/chat/sugerir", { method: "POST", body: JSON.stringify({ id: ativoId, instrucao: instr }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setSugerindo(false); setInstrucao(null);
    if (j.erro) setAviso("IA: " + j.erro); else setConv((c: any) => ({ ...c, sugestao: j.texto, sugestao_em: new Date().toISOString() }));
  }
  function alternarSel(id: string) { setSel(s0 => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function tarefaDaSelecao() {
    if (!ativoId || !sel.size) return;
    setAviso("🤖 Criando tarefa das mensagens selecionadas…");
    const j = await fetch("/api/chat/tarefas-selecao", { method: "POST", body: JSON.stringify({ id: ativoId, ids: Array.from(sel) }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setAviso(j.erro ? "IA: " + j.erro : `${j.criadas} tarefa(s) criada(s).`); setSelecionando(false); setSel(new Set()); carregarConversa(ativoId);
  }
  async function perguntar(texto?: string, ids?: string[]) {
    const p = (texto ?? pergunta).trim(); if (!p || !ativoId) return;
    const hist = chat; setChat([...hist, { role: "user", content: p }]); setPergunta(""); setPensando(true);
    const j = await fetch("/api/chat/ia", { method: "POST", body: JSON.stringify({ id: ativoId, historico: hist, pergunta: p, selecionadas: ids || [] }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setPensando(false); setMostrarIA(true);
    setChat(c => [...c, { role: "assistant", content: j.erro ? "⚠️ " + j.erro : j.resposta }]);
  }

  async function enviarArquivos() {
    if (!ativoId || !arquivos.length || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true); setAviso("");
    try {
      for (let i = 0; i < arquivos.length; i++) {
        const f = arquivos[i];
        if (f.size > MAX_ARQ) { setAviso(`"${f.name}" passa de 3 MB — mande pelo celular por enquanto.`); continue; }
        const base64 = await lerBase64(f);
        const j = await fetch("/api/chat/enviar-arquivo", { method: "POST", body: JSON.stringify({ id: ativoId, base64, mime: f.type || "application/octet-stream", nome: f.name, legenda: i === 0 ? texto.trim() : "" }) }).then(r => r.json());
        if (j.erro) { setAviso("Não enviou " + f.name + ": " + j.erro); break; }
      }
      setArquivos([]); setTexto(""); grudado.current = true; carregarConversa(ativoId); carregarLista();
    } finally { setEnviando(false); enviandoRef.current = false; }
  }
  function adicionarArquivos(fl: FileList | null) {
    if (!fl?.length) return;
    const novos = Array.from(fl); // copia AGORA: a lista do campo é zerada logo depois (e.target.value = "")
    if (novos.length) setArquivos(a => [...a, ...novos]);
  }
  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "audio/webm;codecs=opus";
      const rec = new MediaRecorder(stream, { mimeType: tipo });
      pedacos.current = []; cancelarGravacao.current = false;
      rec.ondataavailable = e => { if (e.data.size) pedacos.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setGravando(false);
        if (cancelarGravacao.current || !ativoId) return;
        const blob = new Blob(pedacos.current, { type: tipo });
        setEnviando(true);
        const base64 = await lerBase64(blob);
        const j = await fetch("/api/chat/enviar-audio", { method: "POST", body: JSON.stringify({ id: ativoId, base64 }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
        setEnviando(false);
        if (j.erro) setAviso("Áudio não enviou: " + j.erro); else { grudado.current = true; carregarConversa(ativoId); carregarLista(); }
      };
      gravador.current = rec; rec.start(); setGravando(true); setSegGravando(0);
    } catch { setAviso("Não consegui usar o microfone — permita o acesso no navegador."); }
  }
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegGravando(s2 => s2 + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);
  function pararGravacao(cancelar = false) { cancelarGravacao.current = cancelar; gravador.current?.stop(); }

  async function alternarAvisos() {
    if (avisos) { setAvisos(false); try { localStorage.setItem("avisos-whats", "0"); } catch {} return; }
    if (!("Notification" in window)) { setAviso("Este navegador não suporta notificações."); return; }
    const p = await Notification.requestPermission();
    if (p === "granted") {
      setAvisos(true); bip(); try { localStorage.setItem("avisos-whats", "1"); } catch {}
      const e = await ligarPush().catch(err => String(err)); // também liga o aviso com a Mesa fechada
      if (e) setAviso(e);
    }
    else setAviso("Notificações bloqueadas — libere nas configurações do navegador para este site.");
  }
  async function sincronizar() {
    setSincronizando("Buscando conversas no celular…");
    const j = await fetch("/api/chat/sincronizar", { method: "POST" }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) setSincronizando("Erro: " + j.erro);
    else {
      const tot = Object.values(j.novas || {}).reduce((a: number, b: any) => a + Number(b), 0);
      const det = Object.entries(j.encontradas || {}).map(([k, v]) => `📱 ${k.replace(/^socio-/, "")}: ${v} no celular`).join(" · ");
      setSincronizando(`${tot} conversa(s) nova(s) trazidas. ${det}`); carregarLista();
    }
    setTimeout(() => setSincronizando(""), 12000);
  }
  const semAcento = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const opcoesMarcar = useMemo(() => {
    if (!marcando) return [];
    const t = semAcento(marcando.termo);
    const lista = [{ id: "todos", nome: "todos" }, ...participantes].filter(p => !t || semAcento(p.nome).includes(t));
    return lista.slice(0, 8);
  }, [marcando, participantes]);
  function aoDigitar(v: string, cursor: number) {
    setTexto(v);
    if (!participantes.length) { setMarcando(null); return; }
    const antes = v.slice(0, cursor);
    const m = antes.match(/(^|\s)@([^\s@]{0,30})$/);
    setMarcando(m ? { termo: m[2], inicio: cursor - m[2].length - 1, sel: 0 } : null);
  }
  function escolherMarcado(p: { id: string; nome: string }) {
    if (!marcando) return;
    const el = campoTexto.current; const cursor = el?.selectionStart ?? texto.length;
    const novo = texto.slice(0, marcando.inicio) + "@" + p.nome + " " + texto.slice(cursor);
    setTexto(novo); setMarcando(null);
    setMencoes(ms => ms.some(x => x.id === p.id) ? ms : [...ms, p]);
    setTimeout(() => { if (el) { const pos = marcando.inicio + p.nome.length + 2; el.focus(); el.setSelectionRange(pos, pos); } }, 0);
  }
  useEffect(() => {
    if (!encaminhando) { setContatosEnc([]); return; }
    const q = encaminhando.busca.trim();
    if (q.length < 2) { setContatosEnc([]); return; }
    const t = setTimeout(() => fetch(`/api/chat/contatos?q=${encodeURIComponent(q)}`).then(r => r.json()).then(j => setContatosEnc(j.contatos || [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [encaminhando?.busca]);
  function escolherContatoEnc(c: any) {
    if (!encaminhando) return;
    const conv = c.conversas.find((x: any) => x.instancia === encaminhando.instancia) || null;
    const noLista = conv ? lista.find(l => l.id === conv.id) : null;
    if (noLista) setEncaminhando({ ...encaminhando, destino: noLista, numero: "" });
    else setEncaminhando({ ...encaminhando, destino: null, numero: c.numero, rotulo: c.nome || "+" + c.numero } as any);
  }
  async function encaminhar() {
    if (!encaminhando) return;
    const e = encaminhando;
    if (!e.destino && !e.numero.trim()) return;
    setEncaminhandoAgora(true);
    const j = await fetch("/api/chat/encaminhar", { method: "POST", body: JSON.stringify({
      mensagemIds: Array.from(sel), destinoId: e.destino?.id || null, numero: e.destino ? null : e.numero, instancia: e.instancia }) })
      .then(r => r.json()).catch(x => ({ erro: String(x) }));
    setEncaminhandoAgora(false);
    if (j.erro) { alert(j.erro); return; }
    setEncaminhando(null); setSelecionando(false); setSel(new Set());
    setAviso(`↪ ${j.enviadas} mensagem(ns) encaminhada(s) para ${j.destino?.nome || "o destino"}.` + (j.falhas?.length ? ` Não foram: ${j.falhas.join("; ")}` : ""));
    carregarLista();
  }
  const podeEditar = (m: any) => m.de_mim && !m.apagada && !m.tem_midia && !String(m.id).startsWith("tmp-") &&
    (ativo?.instancia === "gchat" || Date.now() - new Date(m.enviada_em).getTime() < 15 * 60 * 1000);
  async function salvarEdicao() {
    if (!editando) return;
    const { m, texto: novo } = editando;
    if (!novo.trim() || novo.trim() === m.texto) { setEditando(null); return; }
    setMsgs(ms => (ms || []).map(x => x.id === m.id ? { ...x, texto: novo.trim(), editada: true } : x)); // já mostra editada
    setEditando(null);
    const j = await fetch("/api/chat/editar", { method: "POST", body: JSON.stringify({ mensagemId: m.id, texto: novo }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { alert(j.erro); }
    if (ativoId) carregarConversa(ativoId);
  }
  async function apagarMsg() {
    const m = apagando; setApagando(null); if (!m) return;
    const j = await fetch("/api/chat/apagar", { method: "POST", body: JSON.stringify({ mensagemId: m.id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { alert(j.erro); return; }
    if (ativoId) carregarConversa(ativoId, true);
  }
  async function corrigirGchat() {
    setSincronizando("Relendo 30 dias do Google Chat (pode levar 1–2 min)…");
    const j = await fetch("/api/chat/corrigir-gchat", { method: "POST" }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) setSincronizando("Erro: " + j.erro);
    else setSincronizando(j.nomesFuncionando ? `Pronto: ${j.espacos} espaço(s) relidos. Nomes e anexos acertados.` : `Anexos relidos, mas o Google ainda recusa os NOMES: ${j.erroNome || "sem detalhe"} — veja Configuração → Google.`);
    carregarLista(); if (ativoId) carregarConversa(ativoId, true);
    setTimeout(() => setSincronizando(""), 20000);
  }
  useEffect(() => {
    if (!modalNova) return;
    const t = setTimeout(() => fetch(`/api/chat/contatos?q=${encodeURIComponent(buscaContato)}`).then(r => r.json())
      .then(j => { setContatos(j.contatos || []); setInfoContatos({ total: j.total, google: j.google }); }).catch(() => setContatos([])), 250);
    return () => clearTimeout(t);
  }, [buscaContato, modalNova]);
  function escolherContato(c: any) {
    const ja = c.conversas.find((x: any) => x.instancia === nova.instancia) || c.conversas[0];
    if (ja && !nova.texto.trim()) { setModalNova(false); setAtivoId(ja.id); setViewMobile("conversa"); if (ja.instancia !== conexao && conexao !== "todas") setConexao("todas"); return; }
    setNova(n => ({ ...n, numero: c.numero, nome: c.nome }));
  }
  async function criarNova() {
    setAviso("");
    const j = await fetch("/api/chat/nova", { method: "POST", body: JSON.stringify(nova) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { setAviso(j.erro); return; }
    setModalNova(false); setNova({ instancia: nova.instancia, numero: "", nome: "", texto: "" });
    await carregarLista(); setAtivoId(j.id); setViewMobile("conversa");
  }
  async function criarContato() {
    setCriarContatoAviso("");
    const j = await fetch("/api/chat/contato", { method: "POST", body: JSON.stringify({ numero: nova.numero, nome: nova.nome }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { setCriarContatoAviso(j.erro); return; }
    setCriarContatoAviso("✓ Contato criado! Agora choose abaixo para conversar.");
    setTimeout(() => { setAbaNova("buscar"); setBuscaContato(nova.nome.trim() || nova.numero); }, 800);
  }
  async function carregarAntigas() {
    if (!ativoId) return;
    setCarregandoAntigas(true);
    await fetch("/api/chat/historico", { method: "POST", body: JSON.stringify({ id: ativoId, forcar: true, qtd: 200 }) }).catch(() => {});
    setCarregandoAntigas(false);
    const el = msgsRef.current; const alturaAntes = el?.scrollHeight || 0;
    await carregarConversa(ativoId);
    setTimeout(() => { if (el) el.scrollTop = el.scrollHeight - alturaAntes; }, 50);
  }

  async function marcarTodasLidas() {
    const ids = filtrada.filter(c => c.nao_lidas > 0).map(c => c.id);
    if (!ids.length) return;
    if (ids.length > 5 && !confirm(`Marcar ${ids.length} conversa(s) como lidas?`)) return;
    setLista(l => l.map(c => ids.includes(c.id) ? { ...c, nao_lidas: 0 } : c));
    await fetch("/api/chat/lidas-todas", { method: "POST", body: JSON.stringify({ ids }) });
    carregarLista();
  }

  if (carregando) return <><h1>WhatsApp</h1><p className="muted">Carregando…</p></>;

  return (
    <>
      <div className="dg-topo" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>WhatsApp</h1>
        <span className="muted small">Atualiza sozinho · {conexoes.map(c => <span key={c} className={cx(c)} style={{ marginRight: 4 }}>{rotuloCx(c)}</span>)}</span>
        <div className="acoes" style={{ marginLeft: "auto" }}>
          <button onClick={() => { setAbaNova("buscar"); setCriarContatoAviso(""); setNova(n => ({ ...n, instancia: n.instancia || conexoes.find(c => c !== "gchat") || "" })); setModalNova(true); }}>+ Nova conversa</button>
          <button className="sec" onClick={sincronizar} title="Traz pro painel as conversas dos últimos 90 dias do celular">🔄 Sincronizar conversas</button>
          {conexao === "gchat" && <button className="sec" onClick={corrigirGchat} title="Relê 30 dias do Google Chat e acerta nomes e anexos">🛠️ Corrigir Google Chat</button>}
          <button className="sec" onClick={alternarAvisos} title="Som e notificação quando chegar mensagem">{avisos ? "🔔 Avisos ligados" : "🔕 Ligar avisos"}</button>
        </div>
      </div>
      {sincronizando && <div className="aviso" style={{ marginTop: 8 }}>{sincronizando}</div>}
      {erroLista && <div className="aviso erro" style={{ marginTop: 8 }}>{erroLista}</div>}

      <div className={`dg-app dg-ver-${viewMobile}`}>
        {/* coluna 1: filtros */}
        <div className="dg-col1">
          <h4>Ver</h4>
          {VISOES.map(([v, r]) => (
            <div key={v} className={"dg-filtro" + (visao === v ? " ativo" : "")} onClick={() => { setVisao(v); setViewMobile("lista"); }}>
              {r} <span className="n">{contar(v)}</span>
            </div>
          ))}
          <h4>Conexão</h4>
          <div className={"dg-filtro" + (conexao === "todas" ? " ativo" : "")} onClick={() => { setConexao("todas"); setViewMobile("lista"); }}>Todos os números</div>
          {conexoes.map(c => {
            const n = naoLidasCx(c);
            return (
              <div key={c} className={"dg-atendente" + (conexao === c ? " ativo" : "")} onClick={() => { setConexao(c); setViewMobile("lista"); }}>
                <span className={cx(c)}>{rotuloCx(c)}</span>
                <div style={{ flex: 1 }} />
                <div className={"dg-badge" + (n === 0 ? " zero" : "")}>{n}</div>
              </div>
            );
          })}
        </div>

        {/* coluna 2: conversas */}
        <div className="dg-col2">
          <div className="cab"><button className="dg-voltar" onClick={() => setViewMobile("atendentes")}>← Filtros</button><b>{filtrada.length} conversa(s)</b>
            {filtrada.some(c => c.nao_lidas > 0) && <button className="linkbtn small" style={{ marginLeft: "auto" }} onClick={marcarTodasLidas} title="Zera as não lidas das conversas desta lista (no celular nada muda)">✓ marcar todas como lidas</button>}</div>
          <input className="dg-busca" placeholder="Buscar nome ou número…" value={busca} onChange={e => setBusca(e.target.value)} />
          {filtrada.length === 0 && <p className="muted small" style={{ padding: 16 }}>Nada por aqui.</p>}
          {filtrada.map(c => (
            <div key={c.id} className={"dg-chamado" + (c.id === ativoId ? " ativo" : "")} onClick={() => { setAtivoId(c.id); setViewMobile("conversa"); }}
              onContextMenu={e => { e.preventDefault(); fixar(c.id, !c.fixada_em); }} title="Botão direito: fixar / desafixar no topo">
              <div className="dg-avatar" style={{ width: 32, height: 32, fontSize: 11, background: c.is_grupo ? "var(--texto-2)" : c.modo === "pessoal" ? "#7a3db8" /* roxo fixo: fundo do avatar com iniciais brancas, legível nos dois temas */ : "var(--primaria)" }}>
                {c.foto_url ? <img src={c.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : c.is_grupo ? "👥" : iniciais(c.nome)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span className="nome" style={{ fontWeight: c.nao_lidas ? 700 : 600 }}>{c.nome}</span>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    {c.fixada_em && <button title="Fixada — clique pra desafixar" onClick={e => { e.stopPropagation(); fixar(c.id, false); }}
                      style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>📌</button>}
                    <span className="hora" style={{ color: c.nao_lidas ? "var(--ok)" : undefined }}>{hora(c.ultima_msg_em)}</span>
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div className="prev" style={{ flex: 1 }}>{c.ultima_msg_texto}</div>
                  {c.nao_lidas > 0 && <span className="nl">{c.nao_lidas}</span>}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                  <span className={cx(c.instancia)}>{rotuloCx(c.instancia)}</span>
                  {c.precisa_resposta && !c.ultima_msg_de_mim && <span className="pill p-ambar" style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>⏳ esperando você
                    <button title="Não é pra mim / já resolvi — tirar de esperando" onClick={e => { e.stopPropagation(); naoEsperando(c.id); }}
                      style={{ border: 0, background: "transparent", padding: "0 2px", cursor: "pointer", fontSize: 11, lineHeight: 1, color: "inherit", fontWeight: 700 }}>✕</button></span>}
                  {c.sem_retorno && <span className="pill p-erro" style={{ fontSize: 10 }}>sem retorno do time</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* coluna 3: chat */}
        <div className="dg-col3">
          {!ativo ? <p className="muted" style={{ margin: "40px auto" }}>Escolha uma conversa.</p> : (
            <>
              <div className="dg-conv-cab">
                <button className="dg-voltar" onClick={() => setViewMobile("lista")}>← Conversas</button>
                <div className="conv-info">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <b className="conv-nome" title={ativo.nome}>{ativo.is_grupo ? "👥 " : ""}{ativo.nome}</b>
                    {!ativo.is_grupo && !contatoSalvo && (
                      <button className="sec" style={{ fontSize: 12, padding: "4px 8px", whiteSpace: "nowrap" }}
                        onClick={() => setNovoContato({ nome: /^\+?\d[\d\s()-]*$/.test(ativo.nome || "") ? "" : (ativo.nome || ""), salvando: false, erro: "" })}
                        title="Este número não está nos seus contatos">➕ Criar contato</button>
                    )}
                  </div>
                  <div className="muted small conv-meta">
                    <span className={cx(ativo.instancia)}>{rotuloCx(ativo.instancia)}</span>
                    <span>{MODOS[ativo.modo] || ativo.modo}</span>
                    {!ativo.is_grupo && ativo.instancia !== "gchat" && <span>· {ativo.jid?.split("@")[0]}</span>}
                  </div>
                </div>
                <div className="acoes">
                  <button className="sec" onClick={() => fixar(ativo.id, !ativo.fixada_em)} title={ativo.fixada_em ? "Desafixar do topo" : "Fixar no topo da lista"}>📌<span className="rot"> {ativo.fixada_em ? "Desafixar" : "Fixar"}</span></button>
                  {!ativo.is_grupo && ativo.instancia !== "gchat" && ativo.jid?.endsWith("@s.whatsapp.net") && <button className="sec" title="Ligar pelo WhatsApp (abre no celular ou no WhatsApp do computador)"
                    onClick={() => { const n = ativo.jid.split("@")[0]; const celular = /Android|iPhone|iPad/i.test(navigator.userAgent);
                      window.open(celular ? `https://wa.me/${n}` : `whatsapp://send?phone=${n}`, "_blank"); setAviso("📞 Abrimos a conversa no WhatsApp — toque no telefone 📞 lá em cima pra ligar."); }}>📞<span className="rot"> Ligar</span></button>}
                  {ativo.precisa_resposta && !ativo.ultima_msg_de_mim && <button className="sec" onClick={() => naoEsperando(ativo.id)} title="A IA marcou errado ou você já resolveu por fora">✓<span className="rot"> Não é pra mim</span></button>}
                  <select value={ativo.modo} onChange={e => mudarModo(e.target.value)} style={{ width: "auto", fontSize: 12.5, padding: "5px 8px" }} title="Modo da conversa">
                    {Object.entries(MODOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                  <button className={selecionando ? "" : "sec"} onClick={() => { setSelecionando(v => !v); setSel(new Set()); }} title="Selecionar mensagens para a IA">☑️<span className="rot"> {selecionando ? "Selecionando" : "Selecionar"}</span></button>
                  <button className={mostrarIA ? "" : "sec"} onClick={() => setMostrarIA(v => !v)} title="Assistente (resumo, tarefas, conversar com a IA)">🤖<span className="rot"> IA</span></button>
                </div>
              </div>

              <div className="dg-msgs" ref={msgsRef} onScroll={aoRolar}>
                {msgs && msgs.length > 0 && <button className="linkbtn" style={{ alignSelf: "center", margin: "0 0 6px" }} onClick={carregarAntigas} disabled={carregandoAntigas}>{carregandoAntigas ? "buscando…" : "⬆ carregar mensagens mais antigas"}</button>}
                {msgs === null && <p className="muted">Carregando conversa…</p>}
                {msgs?.length === 0 && <p className="muted small">Sem mensagens guardadas ainda. As novas aparecem aqui na hora.</p>}
                {msgs?.map(m => {
                  const link = `/api/chat/midia?id=${m.id}`;
                  const txt = m.tipo === "audio" ? "" : m.tem_midia ? semMarcador(m.texto) : m.texto;
                  return (
                    <div key={m.id} className={"dg-msg " + (m.de_mim ? "equipe" : "cliente")}
                      onClick={selecionando ? () => alternarSel(m.id) : undefined}
                      style={selecionando ? { cursor: "pointer", outline: sel.has(m.id) ? "3px solid var(--acento)" : "1px dashed var(--borda-campo)", outlineOffset: 2 } : undefined}>
                      {selecionando && <span style={{ float: "right", marginLeft: 6 }}>{sel.has(m.id) ? "☑️" : "⬜"}</span>}
                      {!m.de_mim && ativo.is_grupo && m.autor && <div className="dg-autor" style={{ fontSize: 11, fontWeight: 700, color: "var(--link)" }}>{m.autor}</div>}
                      {m.me_citou && <span className="citou">📣 falou com você</span>}
                      {m.citada_texto && <div style={{ borderLeft: "3px solid var(--acento)", background: m.de_mim ? "rgba(255,255,255,.15)" : "var(--superficie-2)", padding: "3px 7px", borderRadius: 5, fontSize: 11.5, marginBottom: 4, opacity: .9, whiteSpace: "pre-wrap" }}>{renderizarComLinks(m.citada_texto.slice(0, 160))}</div>}
                      {m.apagada && <div style={{ fontStyle: "italic", opacity: .75 }}>🚫 {m.de_mim ? "Você apagou esta mensagem" : "Mensagem apagada"}</div>}
                      {!m.apagada && m.tem_midia && (
                        m.tipo === "imagem" ? <img className="midia" src={link} alt="imagem" loading="lazy" onClick={() => setVisor(m)} onLoad={() => { if (grudado.current) irProFim(); }} />
                        : m.tipo === "audio" ? <div>
                            <audio controls preload="none" src={link} />
                            {m.transcricao
                              ? <div style={{ fontSize: 12.5, fontStyle: "italic", marginTop: 4, opacity: .95, whiteSpace: "pre-wrap" }}>📝 {renderizarComLinks(m.transcricao)}</div>
                              : <div style={{ marginTop: 2 }}>
                                  <button className="linkbtn" style={{ color: "inherit", fontSize: 11.5 }} disabled={transcrevendo.has(m.id)} onClick={e => { e.stopPropagation(); transcrever(m.id); }}>
                                    {transcrevendo.has(m.id) ? "transcrevendo…" : "📝 transcrever áudio"}</button>
                                  {m.transcricao_erro && <span style={{ fontSize: 11, opacity: .8 }}> · {m.transcricao_erro.slice(0, 80)}</span>}
                                </div>}
                          </div>
                        : m.tipo === "video" ? <video controls preload="none" src={link} style={{ maxWidth: 240 }} />
                        : (m.midia_mime || "").includes("pdf")
                          ? <a href={link} className="dg-doc" onClick={e => { e.preventDefault(); setVisor(m); }}>📄 {m.midia_nome || "documento"}</a>
                          : <a href={link} target="_blank" className="dg-doc">📄 {m.midia_nome || "documento"}</a>
                      )}
                      {!m.apagada && m.tem_midia && m.tipo !== "imagem" && <a href={`${link}&baixar=1`} className="small" style={{ marginLeft: 6, opacity: .8 }}>⬇ baixar</a>}
                      {!m.apagada && txt && (m.msg_id?.startsWith("call-") || /^(📞|🎥) (Ligação|Chamada)/.test(txt)) ? <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: /perdida|recusada/.test(txt) ? "var(--erro)" : undefined }}>{txt}</div>
                        : !m.apagada && txt ? <div style={{ whiteSpace: "pre-wrap" }}>{renderizarComLinks(txt)}</div> : null}
                      <span className="qd">{(m as any).enviandoAgora ? "⏳ enviando…" : hora(m.enviada_em)}{m.editada && !m.apagada ? " · editada" : ""} {!m.apagada && <button className="linkbtn" style={{ color: "inherit", fontSize: 10, marginLeft: 6 }} onClick={() => setCitada(m)} title="Responder citando">↩ responder</button>}
                        {!m.apagada && !m.de_mim && ativo.is_grupo && ativo.instancia !== "gchat" && <button className="linkbtn" style={{ color: "inherit", fontSize: 10, marginLeft: 6 }} onClick={e => { e.stopPropagation(); responderPrivado(m); }} title="Abrir conversa no privado com quem mandou">🔒 no privado</button>}
                        {podeEditar(m) && <button className="linkbtn" style={{ color: "inherit", fontSize: 10, marginLeft: 6 }} onClick={() => setEditando({ m, texto: m.texto || "" })} title={ativo.instancia === "gchat" ? "Editar mensagem" : "Editar (o WhatsApp deixa até 15 min)"}>✏️ editar</button>}
                        {m.de_mim && !m.apagada && <button className="linkbtn" style={{ color: "inherit", fontSize: 10, marginLeft: 6 }} onClick={() => setApagando(m)} title="Apagar para todos">🗑 apagar</button>}</span>
                    </div>
                  );
                })}
              </div>
              {novasAbaixo > 0 && <button className="dg-novas" onClick={() => { grudado.current = true; irProFim(); }}>↓ {novasAbaixo} mensagem(ns) nova(s)</button>}

              <div className="dg-compositor">
                {ativo.modo === "ignorada"
                  ? <p className="muted small">Conversa ignorada: nada é guardado. Mude o modo acima pra voltar a acompanhar.</p>
                  : <>
                    {selecionando && <div className="small" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", background: "var(--alerta-fundo)", padding: "6px 8px", borderRadius: 8 }}>
                      <b>{sel.size} selecionada(s)</b> <span className="muted">— toque nas mensagens</span>
                      <div style={{ flex: 1 }} />
                      <button className="mini" disabled={!sel.size || pensando} onClick={() => perguntarRapido("Resuma estas mensagens e diga o que precisa ser feito.", Array.from(sel))}>🤖 Resumir</button>
                      <button className="mini" disabled={!sel.size || pensando} onClick={() => perguntarRapido("Sugira a minha resposta para estas mensagens.", Array.from(sel))}>✍️ Sugerir resposta</button>
                      <button className="mini" disabled={!sel.size} onClick={tarefaDaSelecao}>📌 Criar tarefa</button>
                      <button className="mini" disabled={!sel.size} onClick={() => setSetor(true)}>➡️ Setor</button>
                      <button className="mini" disabled={!sel.size} onClick={() => setEncaminhando({ busca: "", destino: null, numero: "", instancia: conexoes.find(x => x !== "gchat") || "" })}>↪ Encaminhar</button>
                      <button className="mini sec" onClick={() => { setSelecionando(false); setSel(new Set()); }}>Cancelar</button>
                    </div>}
                    {!selecionando && !ativo.ultima_msg_de_mim && (conv?.sugestao || conv?.resumo) && dispensada !== (conv?.sugestao_em || "x") && <div className="dg-sugestao" style={{ background: "var(--info-fundo)", border: "1px solid var(--linha)", borderRadius: 8, padding: "7px 10px" }}>
                      {conv?.resumo && <div className="small muted">🤖 {conv.resumo}</div>}
                      {conv?.sugestao && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 4 }}>
                        <div style={{ flex: 1, whiteSpace: "pre-wrap", fontSize: 13.5 }}><span className="small muted">💡 Sugestão: </span>{conv.sugestao}</div>
                        <div className="acoes" style={{ flexWrap: "nowrap" }}>
                          <button className="mini" onClick={() => { setTexto(conv.sugestao); setDispensada(conv.sugestao_em || "x"); }}>Usar</button>
                          <button className="mini sec" title="Gerar outra" disabled={sugerindo} onClick={() => sugerir()}>{sugerindo ? "…" : "↻"}</button>
                          <button className="mini sec" title="Dizer como quer responder" onClick={() => setInstrucao("")}>✏️</button>
                          <button className="mini sec" title="Esconder" onClick={() => setDispensada(conv.sugestao_em || "x")}>✕</button>
                        </div>
                      </div>}
                      {!conv?.sugestao && <button className="mini" style={{ marginTop: 4 }} disabled={sugerindo} onClick={() => sugerir()}>{sugerindo ? "Pensando…" : "💡 Sugerir resposta"}</button>}
                      {instrucao !== null && <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input value={instrucao} onChange={e => setInstrucao(e.target.value)} placeholder="Ex.: diz que envio amanhã de manhã e pede o CNPJ" autoFocus
                          onKeyDown={e => { if (e.key === "Enter") sugerir(instrucao); }} />
                        <button className="mini" disabled={sugerindo || !instrucao.trim()} onClick={() => sugerir(instrucao)}>Gerar</button>
                      </div>}
                    </div>}
                    {citada && <div className="small" style={{ display: "flex", gap: 8, alignItems: "center", borderLeft: "3px solid var(--acento)", background: "var(--superficie-2)", padding: "4px 8px", borderRadius: 6 }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↩ Respondendo {citada.de_mim ? "você" : (citada.autor || "contato")}: {semMarcador(citada.texto) || "[mídia]"}</span>
                      <button className="linkbtn" onClick={() => setCitada(null)}>✕</button></div>}
                    {arquivos.length > 0 && <div className="small" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {arquivos.map((f, i) => <span key={i} className="chip">{f.type.startsWith("image") ? "🖼️" : f.type.includes("pdf") ? "📄" : "📎"} {f.name} <span className="muted">{f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1).replace(".", ",")} MB`}</span>{f.size > MAX_ARQ && <b style={{ color: "var(--vermelho)" }}> grande demais</b>}
                        <button className="linkbtn" onClick={() => setArquivos(a => a.filter((_, k) => k !== i))}>✕</button></span>)}
                      <span className="muted">O texto vai como legenda do primeiro arquivo.</span></div>}
                    {gravando
                      ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: "var(--vermelho)", fontWeight: 700 }}>● Gravando {Math.floor(segGravando / 60)}:{String(segGravando % 60).padStart(2, "0")}</span>
                          <div style={{ flex: 1 }} />
                          <button className="sec" onClick={() => pararGravacao(true)}>Cancelar</button>
                          <button className="ok" onClick={() => pararGravacao(false)}>Enviar áudio</button>
                        </div>
                      : <div style={{ display: "flex", gap: 8 }}
                          onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
                          onDrop={e => { if (e.dataTransfer.files?.length) { e.preventDefault(); adicionarArquivos(e.dataTransfer.files); } }}>
                          <button type="button" className="sec" title="Anexar foto, PDF ou arquivo (até 3 MB)" onClick={() => inputArq.current?.click()}>📎</button>
                          <input ref={inputArq} type="file" multiple hidden onChange={e => { adicionarArquivos(e.target.files); e.target.value = ""; }} />
                          {marcando && opcoesMarcar.length > 0 && <div style={{ position: "absolute", bottom: "100%", left: 60, marginBottom: 6, background: "var(--superficie)", border: "1px solid var(--linha)", borderRadius: 10, boxShadow: "var(--sombra-2)", minWidth: 260, maxHeight: 280, overflowY: "auto", zIndex: 20 }}>
                            {opcoesMarcar.map((p, i) => <div key={p.id} onMouseDown={e => { e.preventDefault(); escolherMarcado(p); }}
                              style={{ padding: "8px 12px", cursor: "pointer", background: i === marcando.sel ? "var(--alerta-fundo)" : undefined, display: "flex", gap: 8, alignItems: "center" }}>
                              <span className="dg-avatar" style={{ width: 26, height: 26, fontSize: 10, background: p.id === "todos" ? "var(--acento)" : "var(--primaria)" }}>{p.id === "todos" ? "@" : iniciais(p.nome)}</span>
                              <span>{p.id === "todos" ? "todos (marcar o grupo inteiro)" : p.nome}</span></div>)}
                          </div>}
                          <textarea ref={campoTexto} value={texto} onChange={e => aoDigitar(e.target.value, e.target.selectionStart ?? e.target.value.length)} rows={2}
                            onPaste={e => { if (e.clipboardData.files?.length) { e.preventDefault(); adicionarArquivos(e.clipboardData.files); } }}
                            placeholder={arquivos.length ? "Legenda (opcional)…" : `Mensagem pelo ${rotuloCx(ativo.instancia)}… (Enter envia · Shift+Enter quebra linha · Win+. emojis)`}
                            onKeyDown={e => {
                              if (marcando && opcoesMarcar.length) {
                                if (e.key === "ArrowDown") { e.preventDefault(); setMarcando({ ...marcando, sel: (marcando.sel + 1) % opcoesMarcar.length }); return; }
                                if (e.key === "ArrowUp") { e.preventDefault(); setMarcando({ ...marcando, sel: (marcando.sel - 1 + opcoesMarcar.length) % opcoesMarcar.length }); return; }
                                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); escolherMarcado(opcoesMarcar[marcando.sel] || opcoesMarcar[0]); return; }
                                if (e.key === "Escape") { setMarcando(null); return; }
                              }
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
                            }}
                            style={{ flex: 1, minHeight: 64, resize: "none", lineHeight: 1.45 }} />
                          {texto.trim() || arquivos.length
                            ? <button onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : arquivos.length ? `Enviar ${arquivos.length}` : "Enviar"}</button>
                            : ativo.instancia === "gchat" ? <button disabled>Enviar</button> : <button className="sec" title="Gravar áudio" onClick={iniciarGravacao} disabled={enviando}>{enviando ? "…" : "🎤"}</button>}
                        </div>}
                  </>}
                {aviso && <p className="small" style={{ color: aviso.startsWith("Não") || aviso.startsWith("IA:") ? "var(--vermelho)" : "var(--verde)", margin: 0 }}>{aviso}</p>}
              </div>
            </>
          )}
        </div>

        {/* coluna 4: IA e tarefas */}
        {ativo && (
          <div className={"dg-col4" + (mostrarIA ? " aberta" : "")}>
            <div className="dg-ia-cab"><b>Assistente</b><button className="sec mini" onClick={() => setMostrarIA(false)}>fechar</button></div>
            {conv?.resumo && <div className="trecho" style={{ fontStyle: "normal" }}>🤖 {conv.resumo}</div>}
            {conv?.ia_erro && <div className="aviso erro small" style={{ marginTop: 6 }}>{conv.ia_erro}</div>}

            <b className="small" style={{ display: "block", marginTop: 12 }}>Tarefas desta conversa</b>
            {!tarefas.length && <p className="muted small" style={{ margin: "4px 0" }}>Nenhuma tarefa aberta.</p>}
            {tarefas.map(t => (
              <div key={t.id} className="tarefa-mini">
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`selo ${t.tipo}`}>{t.tipo === "promessa" ? "Prometi" : t.tipo === "reuniao" ? "Reunião" : t.tipo === "pedido" ? "Pedido" : "Anotação"}</span>
                  {t.categoria === "pessoal" && <span className="selo pessoal">🏠</span>}
                </div>
                <div style={{ fontWeight: 600, margin: "3px 0" }}>{t.titulo}</div>
                {t.prazo && <div className="muted small">⏰ {hora(t.prazo)}</div>}
                <div className="acoes" style={{ marginTop: 4 }}>
                  <button className="mini ok" onClick={() => acaoTarefa(t.id, "feita")}>✓ Feito</button>
                  <button className="mini sec" onClick={() => acaoTarefa(t.id, "descartada")}>Descartar</button>
                </div>
              </div>
            ))}
            <div className="acoes" style={{ marginTop: 6 }}>
              <button className="mini" onClick={analisar} disabled={analisando}>{analisando ? "Analisando…" : "🤖 Procurar tarefas agora"}</button>
              <button className="mini" onClick={() => setSetor(true)} title="Abre chamado no Acessórias com o que o cliente pediu">➡️ Mandar pro setor</button>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 10 }}>
              <b className="small">Conversar com a IA</b>
              <div className="acoes" style={{ margin: "4px 0 6px" }}>
                <button className="mini" onClick={() => perguntarRapido("Sugira a minha resposta para a última mensagem.")} disabled={pensando}>✍️ Sugerir resposta</button>
                <button className="mini sec" onClick={() => perguntarRapido("O que a pessoa está pedindo? Resuma em 2 linhas.")} disabled={pensando}>O que ela quer?</button>
              </div>
              <div className="ia-chat">
                {chat.map((c, i) => c.role === "assistant" && !c.content.startsWith("⚠️")
                  ? <BolhaIA key={i} texto={c.content} aoUsar={(m) => { setTexto(m); setMostrarIA(false); }} />
                  : <div key={i} className={"ia-bolha " + c.role}><div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div></div>)}
                {pensando && <div className="ia-bolha assistant muted">pensando…</div>}
              </div>
              <div className="acoes" style={{ marginTop: 6, flexWrap: "nowrap" }}>
                <textarea value={pergunta} onChange={e => setPergunta(e.target.value)} rows={2} placeholder="Pergunte algo sobre esta conversa…"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(); } }} style={{ flex: 1, resize: "vertical", minHeight: 44 }} />
                <button className="mini" onClick={() => perguntar()} disabled={pensando || !pergunta.trim()}>Enviar</button>
              </div>
              {chat.length > 0 && <button className="linkbtn small" onClick={() => setChat([])}>limpar conversa</button>}
            </div>
          </div>
        )}
      </div>

      {encaminhando && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setEncaminhando(null); }}>
        <div className="modal-caixa" style={{ width: 520, display: "grid", gap: 8 }}>
          <b style={{ fontSize: 16 }}>↪ Encaminhar {sel.size} mensagem(ns)</b>
          <input value={encaminhando.busca} onChange={e => setEncaminhando({ ...encaminhando, busca: e.target.value, destino: null })} placeholder="🔎 Procurar conversa (WhatsApp ou Google Chat)…" autoFocus />
          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
            <div className="muted small" style={{ padding: "6px 10px 2px", fontWeight: 700 }}>Conversas</div>
            {lista.filter(c => c.modo !== "ignorada" && (!encaminhando.busca.trim() || `${c.nome} ${c.jid}`.toLowerCase().includes(encaminhando.busca.toLowerCase()))).slice(0, 40).map(c => (
              <div key={c.id} className="dg-chamado" style={{ padding: "7px 10px", background: encaminhando.destino?.id === c.id ? "var(--ambar-bg)" : undefined }}
                onClick={() => setEncaminhando({ ...encaminhando, destino: c, numero: "" })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nome" style={{ fontWeight: 600 }}>{c.is_grupo ? "👥 " : ""}{c.nome}</div>
                  <span className={cx(c.instancia)}>{rotuloCx(c.instancia)}</span>
                </div>
              </div>))}
            {contatosEnc.length > 0 && <div className="muted small" style={{ padding: "8px 10px 2px", fontWeight: 700 }}>Contatos (envia pelo número escolhido abaixo)</div>}
            {contatosEnc.map(c => (
              <div key={c.numero} className="dg-chamado" style={{ padding: "7px 10px", background: !encaminhando.destino && encaminhando.numero === c.numero ? "var(--ambar-bg)" : undefined }}
                onClick={() => escolherContatoEnc(c)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nome" style={{ fontWeight: 600 }}>{c.nome || "(sem nome)"}</div>
                  <span className="muted small">+{c.numero} {c.fonte === "google" ? "· 📇 Google" : c.fonte === "whatsapp" ? "· WhatsApp" : ""}</span>
                </div>
              </div>))}
          </div>
          <div className="muted small">ou para um número novo:</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={encaminhando.numero} onChange={e => setEncaminhando({ ...encaminhando, numero: e.target.value, destino: null, rotulo: "" } as any)} placeholder="DDD + número" />
            <select value={encaminhando.instancia} onChange={e => setEncaminhando({ ...encaminhando, instancia: e.target.value })} style={{ maxWidth: 170 }}>
              {conexoes.filter(x => x !== "gchat").map(x => <option key={x} value={x}>{rotuloCx(x)}</option>)}
            </select>
          </div>
          <div className="acoes" style={{ justifyContent: "flex-end" }}>
            <span className="small muted" style={{ flex: 1 }}>{encaminhando.destino ? `Para: ${encaminhando.destino.nome}` : encaminhando.numero ? `Para: ${(encaminhando as any).rotulo || encaminhando.numero} (pelo ${rotuloCx(encaminhando.instancia)})` : ""}</span>
            <button className="sec" onClick={() => setEncaminhando(null)}>Cancelar</button>
            <button onClick={encaminhar} disabled={encaminhandoAgora || (!encaminhando.destino && !encaminhando.numero.trim())}>{encaminhandoAgora ? "Enviando…" : "Encaminhar"}</button>
          </div>
        </div>
      </div>}
      {editando && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setEditando(null); }}>
        <div className="modal-caixa" style={{ width: 480, display: "grid", gap: 8 }}>
          <b style={{ fontSize: 16 }}>✏️ Editar mensagem</b>
          <textarea value={editando.texto} onChange={e => setEditando({ ...editando, texto: e.target.value })} rows={4} autoFocus
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); salvarEdicao(); } if (e.key === "Escape") setEditando(null); }} />
          <span className="muted small">A mensagem muda também {ativo?.instancia === "gchat" ? "no Google Chat de todos" : "no WhatsApp de quem recebeu (aparece \"Editada\")"}.</span>
          <div className="acoes" style={{ justifyContent: "flex-end" }}>
            <button className="sec" onClick={() => setEditando(null)}>Cancelar</button>
            <button onClick={salvarEdicao} disabled={!editando.texto.trim()}>Salvar</button>
          </div>
        </div>
      </div>}
      {apagando && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setApagando(null); }}>
        <div className="modal-caixa" style={{ width: 340, textAlign: "center", display: "grid", gap: 10 }}>
          <b style={{ fontSize: 18 }}>Deseja apagar a mensagem?</b>
          <p className="small muted" style={{ margin: 0 }}>Some da Mesa, do seu {ativo?.instancia === "gchat" ? "Google Chat" : "celular"} e de quem recebeu.</p>
          <button className="perigo" onClick={() => apagarMsg()}>Apagar para todos</button>
          <button className="linkbtn" onClick={() => setApagando(null)}>Cancelar</button>
        </div>
      </div>}
      {visor && (() => {
        const link = `/api/chat/midia?id=${visor.id}`;
        const i = midiasVisor.findIndex(m => m.id === visor.id);
        const ehPdf = (visor.midia_mime || "").includes("pdf");
        const legenda = semMarcador(visor.texto);
        return <div className="visor-fundo" onClick={e => { if (e.target === e.currentTarget) setVisor(null); }}>
          <div className="visor-topo">
            <span>{visor.de_mim ? "Você" : (visor.autor || ativo?.nome)} · {hora(visor.enviada_em)}{midiasVisor.length > 1 ? ` · ${i + 1} de ${midiasVisor.length}` : ""}</span>
            <div style={{ flex: 1 }} />
            <a className="visor-btn" href={`${link}&baixar=1`}>⬇ Baixar</a>
            <button className="visor-btn" onClick={() => { setCitada(visor); setVisor(null); }}>↩ Responder</button>
            <button className="visor-btn" onClick={() => setVisor(null)}>✕</button>
          </div>
          {i > 0 && <button className="visor-seta esq" onClick={() => moverVisor(-1)}>‹</button>}
          {ehPdf
            ? <iframe src={link} className="visor-pdf" title={visor.midia_nome || "PDF"} />
            : <img src={link} alt="" className="visor-img" onClick={e => e.stopPropagation()} />}
          {i < midiasVisor.length - 1 && <button className="visor-seta dir" onClick={() => moverVisor(1)}>›</button>}
          {legenda && <div className="visor-legenda">{legenda}</div>}
        </div>;
      })()}

      {setor && ativoId && <MandarSetor conversaId={ativoId}
        midias={(msgs || []).filter(m => m.tem_midia && (!sel.size || sel.has(m.id))).slice(-15).reverse().map(m => ({ id: m.id, nome: `${m.tipo === "imagem" ? "📷" : m.tipo === "audio" ? "🎤" : "📄"} ${m.midia_nome || m.tipo} · ${hora(m.enviada_em)}` }))}
        onFechar={(msg) => { setSetor(false); if (msg) { setAviso(msg); setSelecionando(false); setSel(new Set()); } }} />}

      {novoContato && ativo && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setNovoContato(null); }}>
        <div className="modal-caixa" style={{ width: 420 }}>
          <b style={{ fontSize: 16 }}>➕ Criar contato</b>
          <p className="muted small" style={{ margin: 0 }}>Número: {ativo.jid?.split("@")[0]} · salva no Google Contatos (aparece no celular) e na Mesa.</p>
          <label>Nome<input autoFocus value={novoContato.nome} onChange={e => setNovoContato({ ...novoContato, nome: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" && novoContato.nome.trim()) salvarContatoDaConversa(); }} placeholder="Ex.: Solange - Policlínica Sapé" /></label>
          {novoContato.erro && <div className="aviso erro small">{novoContato.erro}</div>}
          <div className="acoes" style={{ justifyContent: "flex-end" }}>
            <button className="sec" onClick={() => setNovoContato(null)}>Cancelar</button>
            <button onClick={salvarContatoDaConversa} disabled={novoContato.salvando || !novoContato.nome.trim()}>{novoContato.salvando ? "Salvando…" : "Salvar contato"}</button>
          </div>
        </div>
      </div>}
      {modalNova && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setModalNova(false); }}>
        <div className="modal-caixa" style={{ width: 540 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <b style={{ fontSize: 16, flex: 1 }}>Nova conversa</b>
            <button className={`mini ${abaNova === "buscar" ? "" : "sec"}`} onClick={() => setAbaNova("buscar")}>🔎 Buscar contato</button>
            <button className={`mini ${abaNova === "criar" ? "" : "sec"}`} onClick={() => setAbaNova("criar")}>➕ Criar novo</button>
          </div>
          
          {abaNova === "buscar" && <>
            <input value={buscaContato} onChange={e => setBuscaContato(e.target.value)} placeholder="🔎 Procurar contato por nome ou número…" autoFocus style={{ marginTop: 8 }} />
            <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
              {contatos === null && <p className="muted small" style={{ padding: 10 }}>Carregando contatos…</p>}
              {contatos?.length === 0 && <p className="muted small" style={{ padding: 10 }}>Ninguém encontrado. Se for número novo, use "Criar novo" acima.</p>}
              {contatos?.map(c => (
                <div key={c.numero} className="dg-chamado" style={{ padding: "7px 10px", background: nova.numero === c.numero ? "var(--ambar-bg)" : undefined }} onClick={() => escolherContato(c)}>
                  <div className="dg-avatar" style={{ width: 30, height: 30, fontSize: 11, background: "var(--primaria)" }}>
                    {c.foto ? <img src={c.foto} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : iniciais(c.nome || "?")}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="nome" style={{ fontWeight: 600 }}>{c.nome || "(sem nome)"}</div>
                    <div className="muted small">+{c.numero} {c.fonte === "google" ? "· 📇 Google" : c.fonte === "whatsapp" ? "· WhatsApp" : ""}
                      {c.conversas.map((x: any) => <span key={x.id} className={cx(x.instancia)} style={{ marginLeft: 4 }}>{rotuloCx(x.instancia)}</span>)}</div>
                  </div>
                </div>
              ))}
            </div>
            {infoContatos && <p className="muted small" style={{ margin: 0 }}>{infoContatos.total} contato(s){infoContatos.google === "ok" ? " · inclui seus contatos do Google" : " · contatos do Google: " + (infoContatos.google === "desligado" ? "desligado" : "sem permissão (ver Configuração)")}. Quem já tem conversa abre direto.</p>}
            <label style={{ marginTop: 10 }}>Enviar pelo número
              <select value={nova.instancia} onChange={e => setNova({ ...nova, instancia: e.target.value })}>
                {conexoes.filter(c => c !== "gchat").map(c => <option key={c} value={c}>{rotuloCx(c)}</option>)}
              </select></label>
            <label style={{ marginTop: 8 }}>Telefone — escolha na lista ou digite<input value={nova.numero} onChange={e => setNova({ ...nova, numero: e.target.value })} placeholder="21 99999-9999" /></label>
            <label style={{ marginTop: 8 }}>Nome (opcional)<input value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} /></label>
            <label style={{ marginTop: 8 }}>Primeira mensagem (opcional)<textarea value={nova.texto} onChange={e => setNova({ ...nova, texto: e.target.value })} rows={3} /></label>
            {aviso && <p className="small" style={{ color: "var(--vermelho)" }}>{aviso}</p>}
            <div className="acoes" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button className="sec" onClick={() => setModalNova(false)}>Cancelar</button>
              <button onClick={criarNova} disabled={!nova.numero.trim()}>Abrir conversa</button>
            </div>
          </>}
          
          {abaNova === "criar" && <>
            <label style={{ marginTop: 8 }}>Nome do contato<input value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} placeholder="João Silva" autoFocus /></label>
            <label style={{ marginTop: 8 }}>Telefone<input value={nova.numero} onChange={e => setNova({ ...nova, numero: e.target.value })} placeholder="21 99999-9999" /></label>
            {criarContatoAviso && <p className="small" style={{ color: criarContatoAviso.startsWith("✓") ? "var(--verde)" : "var(--vermelho)" }}>{criarContatoAviso}</p>}
            <div className="acoes" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button className="sec" onClick={() => setModalNova(false)}>Cancelar</button>
              <button onClick={criarContato} disabled={!nova.nome.trim() || !nova.numero.trim()}>Criar contato</button>
            </div>
          </>}
        </div>
      </div>}
    </>
  );
}
