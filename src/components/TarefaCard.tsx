import { concluirTarefa, descartarTarefa } from "@/app/actions";
import { dataHora, ROTULO_TIPO } from "@/lib/fmt";
import AgendarBotao from "./AgendarBotao";
import SetorBotao from "./SetorBotao";

export default function TarefaCard({ t, classe = "" }: { t: any; classe?: string }) {
  return (
    <div className={`card ${classe}`}>
      <div className="linha">
        <span className={`selo ${t.tipo}`}>{ROTULO_TIPO[t.tipo] || t.tipo}</span>
        {t.categoria === "pessoal" ? <span className="selo pessoal">🏠 Pessoal</span> : null}
        <span className="titulo">{t.titulo}</span>
      </div>
      <div className="meta">
        {t.prazo ? <>⏰ {dataHora(t.prazo)} · </> : null}
        {t.quem ? <>👤 {t.quem} · </> : null}
        {t.conversas ? (
          <a href={`/whatsapp?c=${t.conversa_id}`}>💬 {t.conversas.nome}</a>
        ) : t.origem === "email" && t.email_thread_id ? <a href={`/email?thread=${t.email_thread_id}`}>✉️ e-mail</a>
          : t.origem === "reuniao" && t.reuniao_id ? <a href={`/reunioes?r=${t.reuniao_id}`}>🎙️ reunião</a>
          : t.origem === "manual" ? "✍️ anotação manual" : null}
      </div>
      {t.detalhe ? <div className="meta">{t.detalhe}</div> : null}
      {t.trecho ? <div className="trecho">“{t.trecho}”</div> : null}
      {t.conflito ? <div className="meta" style={{ color: "var(--vermelho)", fontWeight: 600 }}>⚠️ {t.conflito}</div> : null}
      <div className="acoes">
        <form action={concluirTarefa}><input type="hidden" name="id" value={t.id} /><button className="ok">✓ Feito</button></form>
        <form action={descartarTarefa}><input type="hidden" name="id" value={t.id} /><button className="perigo">Descartar</button></form>
        {t.categoria !== "pessoal" ? <SetorBotao tarefaId={t.id} /> : null}
        {t.prazo && !t.evento_id ? <AgendarBotao id={t.id} /> : t.evento_id ? <span className="small muted">📅 na agenda</span> : null}
      </div>
    </div>
  );
}
