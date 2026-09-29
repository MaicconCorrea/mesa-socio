import Topo from "@/components/Topo";
import TarefaCard from "@/components/TarefaCard";
import { db } from "@/lib/db";
import { dataHora } from "@/lib/fmt";
import ModoSelect from "@/components/ModoSelect";
import { grupoResolvido, jaRespondi, reanalisar } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Conversa({ params }: { params: { id: string } }) {
  const sb = db();
  const { data: c } = await sb.from("conversas").select("*").eq("id", params.id).single();
  if (!c) return (<><Topo /><div className="conteudo">Conversa não encontrada.</div></>);
  const { data: msgsDesc } = await sb.from("mensagens").select("*").eq("conversa_id", c.id)
    .order("enviada_em", { ascending: false }).limit(150);
  const msgs = (msgsDesc || []).reverse();
  const { data: tarefas } = await sb.from("tarefas").select("*").eq("conversa_id", c.id)
    .eq("status", "aberta").order("prazo", { ascending: true, nullsFirst: false });

  return (
    <>
      <Topo />
      <div className="conteudo">
        <h1>{c.is_grupo ? "👥 " : ""}{c.nome}</h1>
        <div className="sub"><span className="selo inst">{c.instancia}</span> · {c.jid}</div>
        {c.resumo ? <div className="card">🤖 {c.resumo}</div> : null}
        {c.ia_erro ? <div className="aviso">Erro da IA: {c.ia_erro}</div> : null}
        <div className="acoes" style={{ marginBottom: 10 }}>
          <form action={reanalisar}><input type="hidden" name="id" value={c.id} /><button className="primario">🤖 Reanalisar conversa</button></form>
          {c.precisa_resposta ? <form action={jaRespondi}><input type="hidden" name="id" value={c.id} /><button className="ok">Já respondi</button></form> : null}
          {c.sem_retorno ? <form action={grupoResolvido}><input type="hidden" name="id" value={c.id} /><button className="ok">Grupo resolvido</button></form> : null}
          <ModoSelect id={c.id} modo={c.modo} />
        </div>

        <div className="grade">
          <div>
            <h2>Mensagens</h2>
            {msgs.length ? msgs.map((m) => (
              <div key={m.id} className={`msg ${m.de_mim ? "eu" : "ele"}`}>
                <div className="quem">{m.de_mim ? "Você" : m.autor} · {dataHora(m.enviada_em)}</div>
                {m.me_citou ? <b>📣 </b> : null}{m.texto}
              </div>
            )) : <div className="vazio">Sem mensagens guardadas.</div>}
          </div>
          <div>
            <h2>Tarefas desta conversa</h2>
            {tarefas?.length ? tarefas.map((t) => <TarefaCard key={t.id} t={t} />) : <div className="vazio">Nenhuma tarefa aberta.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
