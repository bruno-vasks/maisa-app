/* ─────────────────────────────────────────────────────────────────────────────
 * O AVISO DE CADASTRO NOVO — o e-mail que chega ao Bruno quando alguém entra (22/10/2026).
 *
 * Pedido dele, com as palavras dele: "toda vez que alguém se cadastre na plataforma, ou clique
 * que quer fazer um teste grátis, ou que a gente ganhe o e-mail dela, chegue um e-mail para mim
 * também, para eu conseguir analisar e ver como tudo está funcionando."
 *
 * Os três eventos são um só: UMA CONTA NOVA NASCE EM `auth.users`. Pelo `/assinar/<plano>?teste=1`
 * (teste grátis), pelo `/assinar/<plano>` (Pix), pelo `/cadastro`, pelo botão do Google, ou por
 * qualquer caminho que vier depois. Quem percebe é um trigger no banco (`035_aviso_de_cadastro.sql`),
 * não o navegador — ver o cabeçalho de `app/api/interno/novo-cadastro/route.ts`.
 *
 * Este arquivo é a parte pura: o que é uma conta nova, por qual funil ela entrou, para quem o
 * aviso vai e o texto dele. Quem lê a conta é a porta `ContasNovas`; quem manda é o `Correio`.
 *
 * ⚠️ O TEXTO CARREGA DADO ESCRITO PELA PRÓPRIA PESSOA. Tudo que vem do `user_metadata` (nome do
 * negócio, telefone, campanha) foi digitado num formulário ou numa barra de endereço. Por isso
 * `limpo()` tira quebra de linha e caractere de controle e põe teto: sem isso, um `?utm_source=`
 * com `\n` escreveria linhas falsas no meio do e-mail ("Plano: Escala · pagou").
 * ────────────────────────────────────────────────────────────────────────────── */

import { ehUuid } from "./agenda";
import { emailPlausivel, telefoneBonito } from "./clientes";
import { civilSP, horaDeISO, rotuloBR } from "./tempo";

/** Para quem o aviso vai quando `AVISO_CADASTRO_PARA` não existe. Exatamente este endereço. */
export const DESTINATARIO_PADRAO_DO_AVISO = "bruno.vaskevicius@polijunior.com.br";

/**
 * Os parâmetros de campanha que o `/assinar` grava no metadata, nesta ordem. É a mesma lista de
 * `CAMPANHA` em `ui/medicao.ts` (a que o `/assinar` lê e as LPs repassam), que passou a vir daqui: uma lista só, para o
 * e-mail nunca deixar de mostrar um parâmetro que a página grava.
 */
export const CHAVES_DE_CAMPANHA = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "gclid", "fbclid",
] as const;

export type ChaveDeCampanha = (typeof CHAVES_DE_CAMPANHA)[number];

/**
 * Uma conta de `auth.users`, com o que o aviso precisa e nada mais. Sem senha, sem token, sem
 * `raw_app_meta_data` inteiro: a porta só devolve estes campos, e o texto só usa estes.
 */
export type ContaNova = {
  id: string;
  email: string | null;
  /** Instante ISO em que a conta nasceu (`created_at`). */
  criadaEm: string;
  /** `email_confirmed_at` preenchido. Com "Confirm email" desligado, nasce confirmada. */
  emailConfirmado: boolean;
  /** Provedor do primeiro login: `email`, `google`… */
  provedor: string | null;
  /** O nome do negócio: o do banco se ele já nasceu, senão o que o `/assinar` gravou no metadata. */
  negocio: string | null;
  /** Nome da pessoa (`full_name` do Google, quando houver). */
  nome: string | null;
  /** Só dígitos, como o `/assinar` grava. */
  telefone: string | null;
  /** `essencial` · `profissional` · `escala`, como o `/assinar` grava. */
  plano: string | null;
  /** `teste` · `pix`, como o `/assinar` grava. Ausente em conta de antes de 22/10/2026 ou do `/cadastro`. */
  funil: string | null;
  /** `terapeutas` · `barbeiros` · `generico` (o `icp` do metadata). */
  vertical: string | null;
  campanha: Partial<Record<ChaveDeCampanha, string>>;
  /** Quando o aviso desta conta já saiu (marca de idempotência). Nulo = nunca avisada. */
  avisadaEm: string | null;
};

export type FunilDoCadastro = "teste" | "pix" | "cadastro";

/**
 * Por onde a conta entrou. A MESMA regra do `npm run leads` (`scripts/leads.mjs`): `funil` diz;
 * sem `funil` mas com `plano`, é lead de antes de 22/10/2026, quando só existia o funil com Pix;
 * sem nenhum dos dois, não passou pelo `/assinar` — é `/cadastro`, Google ou conta criada à mão.
 */
export function funilDoCadastro(c: Pick<ContaNova, "funil" | "plano">): FunilDoCadastro {
  if (c.funil === "teste") return "teste";
  if (c.funil === "pix" || c.plano) return "pix";
  return "cadastro";
}

/** Do jeito que vai no assunto e no corpo. */
export function rotuloDoFunil(c: Pick<ContaNova, "funil" | "plano" | "provedor">): string {
  const f = funilDoCadastro(c);
  if (f === "teste") return "teste grátis";
  if (f === "pix") return "Pix";
  return c.provedor === "google" ? "cadastro direto (Google)" : "cadastro direto";
}

/**
 * Para quem o aviso vai, a partir do valor cru de `AVISO_CADASTRO_PARA`.
 *
 * Aceita lista separada por vírgula, ponto e vírgula ou espaço; tira aspas que a Vercel guarda
 * quando alguém cola com elas; descarta o que não tem cara de e-mail; não repete endereço. Sem
 * nada aproveitável (variável ausente, vazia ou toda torta), vale o padrão: o aviso existe para o
 * Bruno ver o funil, e um valor colado errado no painel não pode silenciá-lo.
 */
export function destinatariosDoAviso(bruto?: string | null): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const pedaco of (bruto ?? "").split(/[,;\s]+/)) {
    const e = pedaco.trim().replace(/^["'<]+|["'>]+$/g, "");
    if (!e || !emailPlausivel(e)) continue;
    const chave = e.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push(e);
  }
  return lista.length ? lista : [DESTINATARIO_PADRAO_DO_AVISO];
}

/** O id que o trigger manda. Só uuid: é a chave de `auth.users`, e outra coisa é ruído. */
export const idDeContaValido = (v: unknown): v is string => typeof v === "string" && ehUuid(v.trim());

/** Uma linha só, sem caractere de controle, com teto. Ver o ⚠️ do cabeçalho. */
export function limpo(v: string | null | undefined, max = 120): string {
  return (v ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const NADA = "—";

const ROTULO_VERTICAL: Record<string, string> = {
  terapeutas: "terapeutas",
  barbeiros: "barbeiros",
  generico: "genérico",
};

const primeiraMaiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "22/10/2026 às 20:15", em São Paulo. */
function quandoEmSP(iso: string): string {
  const c = civilSP(iso);
  return c ? `${rotuloBR(c.data)} às ${horaDeISO(iso)}` : "data indisponível";
}

/**
 * O e-mail inteiro. Texto puro, como todo e-mail da porta `Correio` (ver o cabeçalho dela).
 *
 * O assunto começa sempre com `[MAISA] Novo cadastro:` para dar para filtrar numa regra da caixa
 * de entrada, e termina no funil, que é a primeira pergunta de quem lê ("veio pelo teste?").
 */
export function textoDoAvisoDeCadastro(c: ContaNova): { assunto: string; texto: string } {
  const email = limpo(c.email, 200);
  const negocio = limpo(c.negocio, 60);
  const nome = limpo(c.nome, 80);
  const funil = rotuloDoFunil(c);
  const quem = negocio || email || nome || "conta sem e-mail";

  const plano = limpo(c.plano, 30);
  const vertical = limpo(c.vertical, 30);
  const telefone = limpo(c.telefone, 30);

  const campanha = CHAVES_DE_CAMPANHA
    .map((k) => [k, limpo(c.campanha[k])] as const)
    .filter(([, v]) => v);

  const linhas = [
    "Alguém novo entrou na MAISA.",
    "",
    `Quando: ${quandoEmSP(c.criadaEm)} (horário de Brasília)`,
    `Funil: ${funil}`,
    `E-mail: ${email || NADA} (${c.emailConfirmado ? "confirmado" : "ainda não confirmado"})`,
    `Negócio: ${negocio || NADA}`,
    ...(nome && nome !== negocio ? [`Nome: ${nome}`] : []),
    `WhatsApp: ${telefone ? telefoneBonito(telefone) : NADA}`,
    `Plano: ${plano ? primeiraMaiuscula(plano) : NADA}`,
    `Vertical: ${vertical ? ROTULO_VERTICAL[vertical] ?? vertical : NADA}`,
    "",
    ...(campanha.length
      ? ["Campanha:", ...campanha.map(([k, v]) => `  ${k}: ${v}`)]
      : ["Campanha: nenhuma (sem utm, gclid nem fbclid no link)"]),
    "",
    ...(funilDoCadastro(c) === "cadastro"
      ? ["Não passou pelo /assinar, então o `npm run leads` não lista esta conta (ele mostra só o funil)."]
      : ["Para ver depois em que pé ela está (em teste, pagou, travou no e-mail, não pagou), rode",
        "`npm run leads` na pasta do app."]),
    "",
    `Conta: ${c.id}`,
  ];

  return {
    assunto: `[MAISA] Novo cadastro: ${quem} · ${funil}`,
    texto: linhas.join("\n"),
  };
}
