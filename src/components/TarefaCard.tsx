import { concluirTarefa, descartarTarefa } from "@/app/actions";
import { dataHora, ROTULO_TIPO } from "@/lib/fmt";

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
          <a href={`/conversas/${t.conversa_id}`}>💬 {t.conversas.nome} ({t.conversas.instancia})</a>
        ) : t.origem === "manual" ? "✍️ anotação manual" : null}
      </div>
      {t.detalhe ? <div className="meta">{t.detalhe}</div> : null}
      {t.trecho ? <div className="trecho">“{t.trecho}”</div> : null}
      <div className="acoes">
        <form action={concluirTarefa}><input type="hidden" name="id" value={t.id} /><button className="ok">✓ Feito</button></form>
        <form action={descartarTarefa}><input type="hidden" name="id" value={t.id} /><button className="perigo">Descartar</button></form>
      </div>
    </div>
  );
}
