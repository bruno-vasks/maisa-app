import { PLANOS } from "../../planos";

/* FAQ curta, antes do rodapé. Só repete afirmações que a página já faz. Os valores do
   excedente são lidos de `PLANOS` (planos.ts), a mesma fonte dos cartões. */
const excedentes = PLANOS.map(
  (p) => p.specs.find((s) => s.rotulo === "Excedente por agendamento")?.valor ?? "",
);
const listaExcedente = `${excedentes.slice(0, -1).join(", ")} ou ${excedentes.at(-1)}`;

const PERGUNTAS: readonly { p: string; r: string }[] = [
  {
    p: "Preciso trocar o número de WhatsApp da barbearia?",
    r: "Não. A maisa atende no número que a barbearia já tem. Você não troca de WhatsApp nem avisa cliente nenhum.",
  },
  {
    p: "Quanto tempo leva para começar?",
    r: "No ar em 5 minutos. Você conecta o WhatsApp e ela já começa a marcar horário.",
  },
  {
    p: "E se o cliente perguntar algo que ela não sabe?",
    r: "Ela não inventa resposta. Passa a conversa para você, e no painel você vê todas as conversas e pode assumir qualquer uma.",
  },
  {
    p: "Funciona com o Google Agenda?",
    r: "Sim. Ela marca, remarca e cancela no Google Agenda os horários que combina no WhatsApp.",
  },
  {
    p: "Tem limite de barbeiros?",
    r: "Não. Barbeiro é ilimitado em todos os planos: você paga pelo que a maisa agenda.",
  },
  {
    p: "E se eu passar do limite de agendamentos do mês?",
    r: `Nada trava. Você paga só o excedente: ${listaExcedente} por agendamento, conforme o plano.`,
  },
  {
    p: "Tem fidelidade?",
    r: "Não. Você cancela quando quiser.",
  },
];

export function Faq() {
  return (
    <section className="lp3-f" aria-labelledby="lp3-f-titulo">
      <div className="lp3-f-miolo">
        <h2 className="lp3-f-titulo" id="lp3-f-titulo">
          Perguntas que a gente sempre ouve.
        </h2>
        <span className="lp3-f-filete" aria-hidden="true" />
        <div className="lp3-f-lista">
          {PERGUNTAS.map(({ p, r }) => (
            <details className="lp3-f-item" key={p}>
              <summary className="lp3-f-pergunta">
                <span>{p}</span>
                <span className="lp3-f-ind" aria-hidden="true" />
              </summary>
              <p className="lp3-f-resposta">{r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
