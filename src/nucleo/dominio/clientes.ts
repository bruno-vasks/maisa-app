/* ─────────────────────────────────────────────────────────────────────────────
 * CLIENTES — quem é atendido.
 *
 * O `telefone` vai ganhar peso: é por ele que o agente de WhatsApp vai reconhecer
 * quem está falando ("+55 11 98123-4567" → cl1) antes de mexer na agenda. Hoje
 * ninguém depende disso, mas é o motivo de o campo ser obrigatório.
 * ────────────────────────────────────────────────────────────────────────────── */

export type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  canal: "Online" | "Presencial";
  ativo: boolean;
  desde: string;
  servicoId: string;
  /** Atendimentos fechados na competência corrente. */
  atendimentos: number;
  /** Valor fechado na competência — base da nota fiscal. */
  valor: number;
  /**
   * O preço da sessão DESTA pessoa, quando ela não paga o do catálogo. `null` = vale o
   * do serviço. Na terapia o preço muda de pessoa para pessoa (tabela social, convênio),
   * e é daqui que o novo atendimento e o agente puxam o valor. Migração 030.
   */
  valorSessao?: number | null;
  /**
   * O dia do mês (1 a 31) em que a MAISA emite sozinha os recibos desta pessoa, com as sessões
   * que ainda não têm recibo. `null` = não emite sozinha. Em mês curto vale o último dia. Só faz
   * sentido para quem emite Receita Saúde. Pedido da Regina (01/10/2026); migração 032. Ver
   * `dominio/recibo-automatico.ts`.
   */
  diaRecibo?: number | null;
  /**
   * Cliente que existe só para validar a integração fiscal em produção.
   * A NFS-e só autoriza de verdade em produção, então testar exige emitir uma
   * nota real — e uma nota real de teste não pode ficar de pé. Marcar `teste`
   * faz o store cancelar automaticamente logo após a autorização, de forma que
   * nunca sobra nota órfã.
   */
  teste?: boolean;
};

/** Só dígitos, do jeito que o WhatsApp e a prefeitura gostam. */
export const soDigitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/**
 * O caminho de volta: dígitos → "(11) 98123-4567".
 *
 * Existe por causa de quem manda mensagem e não está no cadastro. Uma conversa de WhatsApp
 * de número desconhecido tem que aparecer na lista com ALGUMA coisa no lugar do nome, e o
 * telefone cru ("5511981234567") é a única informação verdadeira que temos dela — mas escrito
 * assim é uma senha, não um contato. Nome inventado ("Cliente #4") seria pior: some a única
 * pista que o dono tem de quem é a pessoa.
 *
 * O DDI 55 é retirado da exibição por ser ruído: todo mundo aqui tem o mesmo. Número que não
 * tem cara de brasileiro volta como veio — melhor um formato feio que um recorte errado.
 */
/**
 * O CPF fecha na conta do dígito verificador?
 *
 * ★ ESTA FUNÇÃO NASCEU DE UM ERRO REAL DA RECEITA, em 21/08/2026. O primeiro arquivo do
 * Receita Saúde levado ao "Analisar Arquivo" do e-CAC voltou com:
 *
 *     CPF Titular Pagamento — "Titular do pagamento inválido."
 *     CPF Beneficiário ..... — "Beneficiário do serviço inválido."
 *
 * Os dois eram CPFs de teste inventados (111.222.333-44), que têm 11 dígitos e não fecham no
 * módulo 11. Ou seja: a checagem de TAMANHO que existia deixava passar, e o erro só aparecia
 * depois — no portal da Receita, com a pessoa já achando que o arquivo estava pronto.
 *
 * ⚠️ ISTO NÃO DIZ QUE O CPF EXISTE. Diz que ele não é digitação errada. Existência só a
 * Receita sabe, e é ela quem recusa na análise — que continua sendo o juiz.
 *
 * Rejeita os onze dígitos repetidos (111.111.111-11 e companhia) porque eles PASSAM no módulo
 * 11 e não são CPF de ninguém: é o placeholder que todo formulário do país recebe.
 */
export function cpfValido(v?: string | null): boolean {
  const d = soDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export function telefoneBonito(v?: string | null): string {
  const d = soDigitos(v);
  const nacional = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (nacional.length === 11) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  if (nacional.length === 10) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  // 8 dígitos é a `telefone_chave`: sem DDD, então nada de parênteses vazios.
  if (nacional.length === 8 || nacional.length === 9) {
    return `${nacional.slice(0, nacional.length - 4)}-${nacional.slice(-4)}`;
  }
  return d;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * OS LIMITES DE UM CLIENTE EDITADO À MÃO.
 *
 * Entraram em 24/08/2026, junto com a primeira tela que ESCREVE cliente. Até então o
 * cadastro só nascia por dois caminhos automáticos — `provisionar_negocio()` e o
 * `garantirCliente` do agente de WhatsApp — e nenhum dos dois passa por teclado. Um
 * telefone digitado errado ficava errado para sempre, e o sintoma era o pior possível:
 * a MAISA não reconhecia a pessoa e tratava cliente antigo como desconhecido.
 *
 * Os números são os `check` das colunas de `clientes` (`002_multitenant.sql`), repetidos
 * aqui para a recusa virar frase em vez de `check_violation` 500. Divergir deles é criar
 * uma segunda regra — o teto que a tela mostra tem que ser o teto que o banco aceita.
 * ────────────────────────────────────────────────────────────────────────────── */

/** `check (length(btrim(nome)) between 1 and 160)`. O chão é 1, e não 2 como no
 *  profissional: quem tem apelido de uma letra na agenda do dono é problema dele. */
export const NOME_CLIENTE_MIN = 1;
export const NOME_CLIENTE_MAX = 160;

/** `check (length(btrim(telefone)) >= 8)`, medido em DÍGITOS e não em caracteres: a
 *  coluna conta o texto cru, então `"(11) 9"` passaria no banco com seis dígitos. */
export const TELEFONE_MIN_DIGITOS = 8;

/** O teto do RFC 5321 para um endereço inteiro. A coluna não tem `check`, e é por isso
 *  que o limite mora aqui: sem ele, `email` é um campo de texto livre sem fim. */
export const EMAIL_MAX = 254;

/**
 * CPF em `000.000.000-00`, ou `""` quando não são onze dígitos.
 *
 * Existe por causa da escrita: o dono digita "12345678909" ou "123.456.789-09" e as duas
 * grafias iriam para a coluna como digitadas — o mesmo documento com duas caras, e a
 * comparação "esse CPF já está em outro cliente?" quebrando por causa de ponto.
 *
 * A máscara e não os dígitos crus porque todo consumidor do CPF já aplica `soDigitos`
 * (`focus/nfsen.ts`, `dominio/recibo-saude.ts`), então o formato guardado é livre — e
 * entre dois formatos livres, o que se guarda é o que a tela mostra sem traduzir.
 */
export function cpfMascarado(v?: string | null): string {
  const d = soDigitos(v);
  if (d.length !== 11) return "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Tem cara de e-mail?
 *
 * ⚠️ NÃO valida endereço — isso só o servidor de e-mail do outro lado sabe, e a regex
 * completa do RFC 5322 é um monstro que rejeita endereços válidos. O que se pega aqui é
 * digitação interrompida ("bruno@", "bruno.com"), que é o erro real de um campo de
 * formulário. E-mail de cliente não recebe nada hoje: é anotação de ficha, então recusar
 * demais custaria mais que aceitar um endereço estranho.
 */
export function emailPlausivel(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
}
