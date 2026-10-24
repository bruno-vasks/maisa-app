/* ─────────────────────────────────────────────────────────────────────────────
 * A MEDIÇÃO DO FUNIL — o que o código conta para o Google Tag Manager.
 *
 * O container é da MAISA (`GTM-NPQSDKVD`), configurado pelo marketing. Até 21/10/2026 as
 * páginas do app não tinham tag nenhuma, e a conversão era lida do TEXTO da tela ("Confirme
 * seu e-mail", "Gerando o seu Pix") por uma tag do GTM: quebrava quando a frase mudasse, e o
 * redirecionamento para o Pix podia cortar o envio. Os eventos daqui substituem essa leitura.
 *
 * ⚠️ OS NOMES SÃO CONTRATO COM O MARKETING. `maisa_sign_up`, `maisa_begin_checkout` e
 * `maisa_account_activated`, e os campos `maisa_*`, são o que as tags do container escutam.
 * Renomear aqui zera a conversão no Google Ads sem erro em lugar nenhum.
 * ────────────────────────────────────────────────────────────────────────────── */

import { CHAVES_DE_CAMPANHA } from "@/nucleo/dominio/aviso-de-cadastro";

export const GTM_ID = "GTM-NPQSDKVD";

/** ⚠️ O GTM SÓ CARREGA NO FUNIL, NUNCA NO PAINEL. O painel mostra nome de paciente, valor
 *  de sessão e conversa de WhatsApp, e uma tag de gravação de sessão (Clarity, Hotjar) ali
 *  mandaria isso para terceiro. A lista é por segmento, como `PUBLIC_PREFIXES`.
 *
 *  `/lp/terapeutas` não está aqui porque é HTML estático: o snippet mora no `index.html`
 *  dela. A raiz `/` é o app, então também fica de fora. */
const ROTAS_DO_FUNIL = [
  "/barbeiro", "/barbeiros", "/sobre", "/privacidade", "/termos", "/autorizar",
  "/assinar", "/cadastro", "/login", "/esqueci", "/auth", "/comecar", "/pagar",
];

export const rotaMedida = (path: string): boolean =>
  ROTAS_DO_FUNIL.some((p) => path === p || path.startsWith(p + "/"));

/** Os parâmetros de campanha que viajam do anúncio para o `metadata` da conta, lidos pelo
 *  `/assinar` e repassados pelas LPs. ⚠️ A LP estática de terapeutas repete esta lista no
 *  `index.html` dela, porque HTML puro não importa TypeScript, e o `planos.test.ts` executa o
 *  script de lá e reprova se divergir.
 *
 *  A lista mora no domínio (`CHAVES_DE_CAMPANHA`, 22/10/2026) porque o e-mail do aviso de
 *  cadastro novo lê as mesmas chaves do metadata: duas listas divergiriam no primeiro
 *  parâmetro novo. */
export const CAMPANHA = CHAVES_DE_CAMPANHA;

/** Teto de cada valor de campanha. É texto que qualquer um escreve na barra de endereço, e
 *  vai parar no metadata do usuário: sem teto, um `?utm_content=` de 50 mil caracteres. */
export const CAMPANHA_MAX = 120;

/** Os parâmetros de campanha de uma busca (`?…`), já com teto. Vazio quando não há nenhum.
 *  É o que o `/assinar` grava no `metadata` da conta. */
export function campanhaDaBusca(busca: string | URLSearchParams): Record<string, string> {
  const q = typeof busca === "string" ? new URLSearchParams(busca) : busca;
  const m: Record<string, string> = {};
  for (const k of CAMPANHA) {
    const v = q.get(k);
    if (v) m[k] = v.slice(0, CAMPANHA_MAX);
  }
  return m;
}

/** O link do botão de plano com a campanha da página atual somada.
 *
 *  ⚠️ ATÉ 21/10/2026 O ANÚNCIO CHEGAVA NA LP E A CAMPANHA MORRIA NO CLIQUE. O botão ia para
 *  `/assinar/essencial?icp=terapeutas` e só, então o `/assinar` não via `utm_*` nem `gclid`
 *  e o `npm run leads` mostrava a coluna da campanha vazia. O que já está no link vence. */
export function levarCampanha(href: string, buscaAtual: string): string {
  const url = new URL(href, "https://x.invalid");
  const atual = new URLSearchParams(buscaAtual);
  for (const k of CAMPANHA) {
    const v = atual.get(k);
    if (v && !url.searchParams.has(k)) url.searchParams.set(k, v);
  }
  return url.pathname + url.search + url.hash;
}

type Evento = { event: string } & Record<string, unknown>;
type ComDataLayer = Window & { dataLayer?: unknown[] };

export function empurrar(evento: Evento): void {
  const w = window as ComDataLayer;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(evento);
}

/** Empurra e espera o GTM dizer que as tags saíram, com teto. Para o evento que vem logo
 *  antes de sair da página: sem a espera, o navegador cancela o envio no meio.
 *
 *  O `setTimeout` não é redundante com o `eventTimeout`: quando o GTM não carregou
 *  (bloqueador de anúncio), ninguém chama o `eventCallback`, e a pessoa ficaria parada. */
export function empurrarEEsperar(evento: Evento, tetoMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    empurrar({ ...evento, eventCallback: () => resolve(), eventTimeout: tetoMs });
    setTimeout(resolve, tetoMs + 100);
  });
}

/** O pedaço do usuário do Supabase que a medição lê. */
export type ContaMedida = {
  id: string;
  created_at: string;
  last_sign_in_at?: string | null;
  app_metadata?: { provider?: string };
};

const ms = (iso?: string | null) => (iso ? Date.parse(iso) : NaN);

/** O primeiro login é o próprio cadastro: o Google cria a conta e entra no mesmo instante.
 *
 *  ⚠️ COMPARA AS DUAS DATAS DO SERVIDOR, e não `created_at` com o relógio do navegador. Um
 *  computador com o relógio dois minutos atrasado perderia todo cadastro numa janela de 60 s. */
export function cadastrouAgora(c: ContaMedida): boolean {
  const d = ms(c.last_sign_in_at) - ms(c.created_at);
  return Number.isFinite(d) && d >= 0 && d < 60_000;
}

/** Entrou pela primeira vez num prazo de 24 h da criação: é a conta que confirmou o e-mail
 *  (ou o Google) e chegou ao produto. "Primeira vez" é por navegador, ver `Medicao.tsx`. */
export function ativouAgora(c: ContaMedida): boolean {
  const d = ms(c.last_sign_in_at) - ms(c.created_at);
  return Number.isFinite(d) && d >= 0 && d < 24 * 60 * 60_000;
}
