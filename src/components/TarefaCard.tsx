import { concluirTarefa, descartarTarefa, reabrirTarefa } from "@/app/actions";
import { dataHora, ROTULO_TIPO } from "@/lib/fmt";
import Destaque from "./Destaque";
import AgendarBotao from "./AgendarBotao";
import SetorBotao from "./SetorBotao";
import ResolverTarefa from "./ResolverTarefa";
import OrigemTarefa from "./OrigemTarefa";

// De onde a tarefa veio, em texto curto (selo do cartão compacto do Kanban)
function origemCurta(t: any) {
  if (t.conversas) return t.conversas.instancia === "gchat" ? "via Google Chat" : "via WhatsApp";
  if (t.origem === "email") return "via e-mail";
  if (t.origem === "reuniao") return "via reunião";
  if (t.origem === "manual") return "à mão";
  return null;
}

export default function TarefaCard({ t, classe = "", compacto = false, selecionada = false, onSelecionar, busca }: {
  t: any; classe?: string;
  compacto?: boolean;                                       // cartão enxuto (Kanban)
  selecionada?: boolean;                                    // marcada para ação em lote
  onSelecionar?: (marcar: boolean, shift: boolean) => void; // com isso, aparece a caixa de seleção
  busca?: string;                                           // resultado da pesquisa: destaca o termo e mostra situação/data
}) {
  const D = (s?: string | null) => (busca ? <Destaque texto={s} termo={busca} /> : s);
  const fechada = t.status && t.status !== "aberta";
  const caixa = onSelecionar ? (
    <input type="checkbox" className="sel-caixa" checked={selecionada}
      aria-label={`Selecionar a tarefa: ${t.titulo}`}
      onChange={() => { /* tratado no onClick (precisa do Shift) */ }}
      onClick={e => onSelecionar(e.currentTarget.checked, e.shiftKey)} />
  ) : null;
  const cls = `card ${classe}${compacto ? " compacto" : ""}${selecionada ? " selecionada" : ""}`;

  if (compacto) {
    const pessoa = Array.from(new Set([t.quem, t.conversas?.nome].filter(Boolean))).join(" · ");
    const origem = origemCurta(t);
    return (
      <div className={cls}>
        <div className="linha">
          {caixa}
          <span className="titulo">{t.titulo}</span>
        </div>
        {pessoa || t.prazo ? (
          <div className="meta">
            {t.prazo ? <>⏰ {dataHora(t.prazo)}{classe === "atrasada" ? " (atrasada)" : ""}</> : null}
            {t.prazo && pessoa ? " · " : null}
            {pessoa ? <>👤 {pessoa}</> : null}
          </div>
        ) : null}
        <div className="linha" style={{ marginTop: 6 }}>
          {origem ? <span className="selo outro">{origem}</span> : null}
          {t.categoria === "pessoal" ? <span className="selo pessoal">Pessoal</span> : null}
          <form action={concluirTarefa} style={{ marginLeft: "auto" }}><input type="hidden" name="id" value={t.id} /><button className="ok mini">✓ Feito</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cls}${fechada ? " bm-fechada" : ""}`}>
      <div className="linha">
        {caixa}
        <span className={`selo ${t.tipo}`}>{ROTULO_TIPO[t.tipo] || t.tipo}</span>
        {t.categoria === "pessoal" ? <span className="selo pessoal">🏠 Pessoal</span> : null}
        {busca ? <span className={`bm-sit bm-sit-${t.status || "aberta"}`}>{t.status === "feita" ? "✓ concluída" : t.status === "descartada" ? "descartada" : "aberta"}</span> : null}
        <span className="titulo">{D(t.titulo)}</span>
      </div>
      <div className="meta">
        {busca ? <>{fechada && t.concluida_em ? `${t.status === "feita" ? "concluída" : "fechada"} em ${dataHora(t.concluida_em)}` : `criada em ${dataHora(t.criada_em)}`} · </> : null}
        {t.prazo ? <>⏰ {dataHora(t.prazo)} · </> : null}
        {t.quem ? <>👤 {D(t.quem)} · </> : null}
        {t.conversas ? (
          <a href={`/whatsapp?c=${t.conversa_id}`}>💬 {D(t.conversas.nome)}</a>
        ) : t.origem === "email" && t.email_thread_id ? <a href={`/email?thread=${t.email_thread_id}`}>✉️ e-mail</a>
          : t.origem === "reuniao" && t.reuniao_id ? <a href={`/reunioes?r=${t.reuniao_id}`}>🎙️ reunião</a>
          : t.origem === "manual" ? "✍️ anotação manual" : null}
      </div>
      {t.detalhe ? <div className="meta">{D(t.detalhe)}</div> : null}
      {t.trecho ? <div className="trecho">“{D(t.trecho)}”</div> : null}
      {t.conflito && !fechada ? <div className="meta" style={{ color: "var(--vermelho)", fontWeight: 600 }}>⚠️ {t.conflito}</div> : null}
      {t.origem !== "manual" ? <OrigemTarefa id={t.id} /> : null}
      {fechada ? <div className="acoes">
        <form action={reabrirTarefa}><input type="hidden" name="id" value={t.id} /><button className="sec">↺ Reabrir</button></form>
      </div> : <div className="acoes">
        <form action={concluirTarefa}><input type="hidden" name="id" value={t.id} /><button className="ok">✓ Feito</button></form>
        <form action={descartarTarefa}><input type="hidden" name="id" value={t.id} /><button className="perigo">Descartar</button></form>
        <ResolverTarefa t={{ id: t.id, titulo: t.titulo, conversa_id: t.conversa_id }} />
        {t.categoria !== "pessoal" ? <SetorBotao tarefaId={t.id} /> : null}
        {t.prazo && !t.evento_id ? <AgendarBotao id={t.id} /> : t.evento_id ? <span className="small muted">📅 na agenda</span> : null}
      </div>}
    </div>
  );
}
