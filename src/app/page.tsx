import AutoRefresh from "@/components/AutoRefresh";
import TarefaCard from "@/components/TarefaCard";
import { db } from "@/lib/db";
import { agoraTexto, fimDoDia, haQuanto } from "@/lib/fmt";
import { analisarAgora, criarTarefa, grupoResolvido, jaRespondi } from "./actions";

export const dynamic = "force-dynamic";

export default async function Hoje({ searchParams }: { searchParams: { ver?: string } }) {
  const ver = ["trabalho", "pessoal"].includes(searchParams.ver || "") ? searchParams.ver! : "tudo";
  const sb = db();

  let qt = sb.from("tarefas").select("*, conversas(nome,instancia)").eq("status", "aberta");
  if (ver !== "tudo") qt = qt.eq("categoria", ver);
  const { data: tarefas } = await qt
    .order("prazo", { ascending: true, nullsFirst: false }).order("criada_em", { ascending: false });

  const { data: esperando } = ver === "pessoal" ? { data: [] as any[] } : await sb.from("conversas").select("*")
    .eq("precisa_resposta", true).in("modo", ["auto", "grupo"]).eq("ultima_msg_de_mim", false)
    .order("ultima_msg_em", { ascending: true });

  const { data: parados } = ver === "pessoal" ? { data: [] as any[] } : await sb.from("conversas").select("*")
    .eq("modo", "grupo").eq("sem_retorno", true).eq("ultima_msg_de_mim", false)
    .order("ultima_msg_em", { ascending: true });

  const { count: naFila } = await sb.from("conversas").select("id", { count: "exact", head: true })
    .eq("pendente_ia", true).neq("modo", "ignorada");

  const agora = Date.now(), fim = fimDoDia().getTime();
  const lista = tarefas || [];
  const atrasadas = lista.filter((t) => t.prazo && new Date(t.prazo).getTime() < agora);
  const deHoje = lista.filter((t) => t.prazo && new Date(t.prazo).getTime() >= agora && new Date(t.prazo).getTime() <= fim);
  const proximas = lista.filter((t) => t.prazo && new Date(t.prazo).getTime() > fim);
  const semPrazo = lista.filter((t) => !t.prazo);

  return (
    <>
      <AutoRefresh />
      <div className="conteudo">
        <h1>Bom trabalho, Maiccon 👋</h1>
        <div className="sub">
          {agoraTexto()} · {lista.length} tarefa(s) · {esperando?.length || 0} esperando você · {parados?.length || 0} grupo(s) sem retorno do time
          {naFila ? <> · 🤖 {naFila} na fila da IA </> : null}
          <form action={analisarAgora} style={{ display: "inline", marginLeft: 8 }}>
            <button>Analisar agora</button>
          </form>
        </div>

        <div className="abas">
          <a href="/" className={ver === "tudo" ? "ativa" : ""}>Tudo</a>
          <a href="/?ver=trabalho" className={ver === "trabalho" ? "ativa" : ""}>💼 Trabalho</a>
          <a href="/?ver=pessoal" className={ver === "pessoal" ? "ativa" : ""}>🏠 Pessoal</a>
        </div>

        <details className="card" style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>✍️ Anotar algo à mão (reunião, ligação, pedido de corredor, compromisso pessoal)</summary>
          <form action={criarTarefa} className="form-linha" style={{ marginTop: 10, gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto" }}>
            <div><input name="titulo" placeholder="O que fazer (ex.: Enviar proposta para Tiago)" required /></div>
            <div>
              <select name="tipo" defaultValue="outro">
                <option value="outro">Anotação</option>
                <option value="pedido">Pedido</option>
                <option value="promessa">Prometi</option>
                <option value="reuniao">Reunião</option>
              </select>
            </div>
            <div>
              <select name="categoria" defaultValue={ver === "pessoal" ? "pessoal" : "trabalho"}>
                <option value="trabalho">💼 Trabalho</option>
                <option value="pessoal">🏠 Pessoal</option>
              </select>
            </div>
            <div><input name="quem" placeholder="Quem" /></div>
            <div><input name="prazo" type="datetime-local" /></div>
            <div><button className="primario">Salvar</button></div>
          </form>
        </details>

        <div className="grade">
          <div>
            <h2>🔥 Atrasadas {atrasadas.length ? <span className="contador">{atrasadas.length}</span> : null}</h2>
            {atrasadas.length ? atrasadas.map((t) => <TarefaCard key={t.id} t={t} classe="atrasada" />) : <div className="vazio">Nada atrasado.</div>}

            <h2>📅 Para hoje {deHoje.length ? <span className="contador">{deHoje.length}</span> : null}</h2>
            {deHoje.length ? deHoje.map((t) => <TarefaCard key={t.id} t={t} classe="hoje" />) : <div className="vazio">Nada com prazo hoje.</div>}

            <h2>🗓️ Próximos dias</h2>
            {proximas.length ? proximas.map((t) => <TarefaCard key={t.id} t={t} />) : <div className="vazio">Nada agendado.</div>}

            <h2>📌 Sem prazo</h2>
            {semPrazo.length ? semPrazo.map((t) => <TarefaCard key={t.id} t={t} />) : <div className="vazio">Nada.</div>}
          </div>

          <div>
            {ver !== "pessoal" ? (
              <>
                <h2>⏳ Esperando resposta sua {esperando?.length ? <span className="contador">{esperando.length}</span> : null}</h2>
                {esperando?.length ? esperando.map((c) => (
                  <div className="card" key={c.id}>
                    <div className="linha">
                      <span className="selo inst">{c.instancia}</span>
                      <a className="titulo" href={`/whatsapp?c=${c.id}`}>{c.is_grupo ? "👥 " : ""}{c.nome}</a>
                    </div>
                    <div className="meta">{haQuanto(c.ultima_msg_em)}</div>
                    <div className="trecho">{c.ultima_msg_texto}</div>
                    {c.resumo ? <div className="meta">🤖 {c.resumo}</div> : null}
                    <div className="acoes">
                      <form action={jaRespondi}><input type="hidden" name="id" value={c.id} /><button className="ok">Já respondi</button></form>
                      <a className="botao" href={`/whatsapp?c=${c.id}`}>Mudar modo</a>
                    </div>
                  </div>
                )) : <div className="vazio">Ninguém esperando. 🎉</div>}

                <h2>👥 Grupos sem retorno do time {parados?.length ? <span className="contador">{parados.length}</span> : null}</h2>
                <div className="meta" style={{ marginTop: -6, marginBottom: 8 }}>Cliente pediu algo e ninguém respondeu há mais de 4h.</div>
                {parados?.length ? parados.map((c) => (
                  <div className="card parado" key={c.id}>
                    <div className="linha">
                      <span className="selo inst">{c.instancia}</span>
                      <a className="titulo" href={`/whatsapp?c=${c.id}`}>👥 {c.nome}</a>
                    </div>
                    <div className="meta">parado {haQuanto(c.ultima_msg_em)}</div>
                    {c.resumo ? <div className="trecho">🤖 {c.resumo}</div> : <div className="trecho">{c.ultima_msg_texto}</div>}
                    <div className="acoes">
                      <form action={grupoResolvido}><input type="hidden" name="id" value={c.id} /><button className="ok">Resolvido / já cobrei o time</button></form>
                    </div>
                  </div>
                )) : <div className="vazio">Nenhum grupo parado.</div>}
              </>
            ) : (
              <div className="card" style={{ marginTop: 26 }}>🏠 Aqui ficam só os compromissos pessoais. Conversas de família e amigos não entram em "esperando resposta".</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
