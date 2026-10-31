"use client";
/* ─────────────────────────────────────────────────────────────────────────────
 * CRIAR CONTA — a porta que o produto não tinha.
 *
 * Até 15/08/2026 o `/login` terminava com "Acesso restrito. As contas são criadas pelo
 * administrador — fale com o responsável para receber o seu acesso". Não era um texto de
 * segurança: era a descrição honesta do produto. Não existia UMA chamada a `signUp` no
 * repositório inteiro, então toda conta nascia de alguém abrindo o painel do Supabase.
 *
 * Um SaaS em que o primeiro passo do funil exige uma pessoa não se vende sozinho — e o
 * resto do funil não importa se ninguém entra nele. É a mesma frase que justificou o
 * `POST /api/negocio` (ver o cabeçalho daquela rota); esta tela é o degrau ANTERIOR, que
 * ficou faltando: aquela rota cria o NEGÓCIO de quem já tem conta, e conta ninguém tinha
 * como criar.
 *
 * ── ESTA TELA É IRMÃ DO `/login`, NÃO UMA VARIAÇÃO DELE ──
 *
 * Mesmo cartão, mesmo wordmark, mesma checagem do provedor Google. O que muda é o modo de
 * falhar, e é isso que impediu de virar um `?modo=cadastro` na tela de login: entrar erra
 * de um jeito só ("e-mail ou senha inválidos") e cadastrar erra de quatro, sendo que dois
 * deles não são erro nenhum — e-mail já cadastrado e "deu certo, agora vá para a sua
 * caixa de entrada". Um formulário com dois conjuntos de estado é o formulário onde uma
 * das mensagens sai no lugar da outra.
 *
 * ── ★ DUAS TELAS, DESDE 31/10/2026 ──
 *
 * E-mail e senha numa, o WhatsApp na outra, na moldura das telas de entrada
 * (`ui/componentes/MolduraDeEntrada.tsx`), com o cadastro da Wise como referência. A conta só
 * nasce no fim da segunda, já com o número no metadata: é o que faz o aviso de cadastro novo
 * chegar ao Bruno com um WhatsApp para chamar. O "Repita a senha" saiu na mesma mudança, porque
 * o olho do `CampoSenha` mostra o que foi digitado e o `/esqueci` existe desde 17/08/2026.
 *
 * ⚠️ ROTA PÚBLICA. Precisa estar em `PUBLIC_PREFIXES` (`saida/supabase/sessao.ts`), senão
 * o middleware manda para o login quem estava indo criar conta — o laço perfeito. A
 * checagem é por SEGMENTO, então `/cadastro` não herda nada de outro prefixo. Há teste.
 * ────────────────────────────────────────────────────────────────────────────── */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LinhaLegal } from "@/app/(marketing)/_lib/LinhaLegal";
import { useSearchParams } from "next/navigation";
import { s, Icon } from "@/ui/primitivos";
import { CampoSenha } from "@/ui/componentes/CampoSenha";
import { createClient } from "@/adaptadores/saida/supabase/client";
import { isSupabaseConfigured } from "@/adaptadores/saida/supabase/config";
import { BotaoGoogle } from "@/ui/componentes/BotaoGoogle";
import { empurrar } from "@/ui/medicao";
import { whatsappDaConta } from "@/nucleo/dominio/whatsapp-da-conta";
import { AcaoDiscreta, MolduraDeEntrada, TituloDaEntrada } from "@/ui/componentes/MolduraDeEntrada";
import { CAMPO_DE_AUTH, CampoWhatsapp } from "@/ui/componentes/CampoWhatsapp";

/**
 * Piso da senha.
 *
 * O mínimo do Supabase neste projeto é 6. Aqui são 8 de propósito: ser MAIS estrito que o
 * servidor nunca produz surpresa (o que passa daqui o servidor aceita), enquanto ser mais
 * frouxo produziria a pior sequência possível — o formulário aprova, a API recusa, e a
 * pessoa lê um erro em inglês vindo do Supabase sobre um campo que a tela disse estar bom.
 */
const SENHA_MIN = 8;

/** O primário das duas telas. `<button>` cru pelo `disabled`, como o `Botao` do wizard. */
function BotaoPrincipal({ children, carregando, travado }: { children: React.ReactNode; carregando: boolean; travado: boolean }) {
  return (
    <button type="submit" disabled={travado} className="m-hov-primary m-press m-focus" style={s(`display:flex;align-items:center;justify-content:center;gap:9px;height:48px;border:none;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${travado ? "not-allowed" : "pointer"};opacity:${travado ? ".6" : "1"};font-family:inherit`)}>
      {carregando && <span style={{ ...s("width:17px;height:17px;border:2px solid rgba(255,255,255,.4);border-top-color:var(--on-primary);border-radius:50%"), animation: "mspin .7s linear infinite" }} />}
      {children}
    </button>
  );
}

function CadastroInner() {
  const params = useSearchParams();

  /* De onde a pessoa veio. `stripe` é o único valor que muda a tela hoje: quem acabou de
   * pagar chega aqui pela `success_url` do checkout e precisa ler que a compra deu certo
   * ANTES de encarar mais um formulário — senão a leitura é "paguei e agora estão me
   * pedindo cadastro de novo?". Valor desconhecido é ignorado, nunca ecoado: é query
   * string, ou seja, texto de terceiro. */
  const veioDoPagamento = params.get("origem") === "stripe";

  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  /** As duas telas do formulário: e-mail e senha, depois o WhatsApp. */
  const [passo, setPasso] = useState<"conta" | "whatsapp">("conta");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  /** Sucesso é TELA, não aviso. Guarda o e-mail porque a instrução precisa dizer qual. */
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  /* ─────────────────────────────────────────────────────────────────────────────
   * A ABA QUE FICOU PARA TRÁS.
   *
   * Relato de quem fez o onboarding em 18/08/2026: *"quando confirma o e-mail pelo Supabase,
   * a tela não atualiza na aba de origem — é chato digitar e-mail + senha que você acabou de
   * digitar para ter a conta."*
   *
   * O link do e-mail abre uma aba NOVA (quem decide isso é o cliente de e-mail, não nós), e é
   * lá que a sessão nasce. A aba de origem — justamente a que tem o e-mail e a senha na
   * memória — fica em "confira sua caixa de entrada" para sempre. O caminho de saída era
   * fechar, ir ao login e redigitar o que tinha sido digitado um minuto antes.
   *
   * Duas verificações, de custos deliberadamente diferentes:
   *
   *  • `getSession()` a cada 2s — **não é rede.** O cliente do `@supabase/ssr` guarda a
   *    sessão em cookie, e cookie é compartilhado entre abas do mesmo navegador. Confirmou na
   *    aba ao lado ⇒ esta aba percebe em no máximo dois segundos. É exatamente o caso do relato.
   *
   *  • `signInWithPassword` a cada 15s, com o que esta aba já tem em mãos. Cobre o caso em
   *    que o link foi aberto em OUTRO aparelho — o e-mail chega no celular e o cadastro estava
   *    no computador — onde não existe cookie para compartilhar e nenhuma checagem local pode
   *    funcionar.
   *
   * ⚠️ 15s E NÃO 2s NO SEGUNDO, e a diferença é o ponto: `signInWithPassword` tem limite de
   * tentativas no Supabase. Poll agressivo gastaria a cota, e o sintoma seria a pessoa
   * trancada FORA da conta que acabou de criar — o oposto do que este bloco existe para
   * resolver. Antes da confirmação essa chamada falha com "email not confirmed", e isso é o
   * esperado: não vira mensagem na tela.
   *
   * ⚠️ O RELÓGIO PARA em `ESPERA_MAX_MS`. Uma aba esquecida aberta o dia inteiro não pode
   * ficar batendo em rota de autenticação — e depois desse tempo o link provavelmente já
   * venceu. O botão manual continua ali, então parar o relógio não fecha nenhuma porta.
   * ───────────────────────────────────────────────────────────────────────────── */
  const [entrando, setEntrando] = useState(false);
  const espera = useRef<{ inicio: number; ultimoLogin: number }>({ inicio: 0, ultimoLogin: 0 });

  const ESPERA_MAX_MS = 10 * 60 * 1000;
  const INTERVALO_LOGIN_MS = 15_000;

  /* Navegação DURA, não `router.push`. Acabou de nascer uma sessão em cookie, e o que precisa
   * enxergá-la é o middleware, no servidor. Recarregar do zero é a garantia de que a próxima
   * tela já monta autenticada — em vez de depender de a navegação de cliente carregar o
   * cookie novo na mesma batida. */
  const irParaComecar = () => { window.location.replace("/comecar"); };

  const conferirSePodeEntrar = useCallback(async (manual: boolean) => {
    if (!isSupabaseConfigured) return false;
    const supabase = createClient();

    /* Barato primeiro: já existe sessão neste navegador? */
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { irParaComecar(); return true; }

    const agora = Date.now();
    const cedoDemais = !manual && agora - espera.current.ultimoLogin < INTERVALO_LOGIN_MS;
    if (cedoDemais || !senha) return false;
    espera.current.ultimoLogin = agora;

    if (manual) setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: enviadoPara ?? email.trim(),
      password: senha,
    });
    if (!error) { irParaComecar(); return true; }

    /* Só o clique manual merece resposta na tela. No automático, "e-mail não confirmado" é o
     * estado normal da espera — dizê-lo a cada 15s seria transformar o funcionamento correto
     * em alarme. */
    if (manual) {
      const m = error.message.toLowerCase();
      setErro(
        /confirm/.test(m)
          ? "Ainda não vi a confirmação. Abra o link do e-mail e volte para esta aba."
          : "Não consegui entrar automaticamente. Use a tela de login.",
      );
      setEntrando(false);
    }
    return false;
  }, [email, enviadoPara, senha]);

  useEffect(() => {
    if (!enviadoPara || !isSupabaseConfigured) return;
    let vivo = true;
    espera.current = { inicio: Date.now(), ultimoLogin: Date.now() };

    const bater = () => {
      if (!vivo) return;
      if (Date.now() - espera.current.inicio > ESPERA_MAX_MS) return;
      void conferirSePodeEntrar(false);
    };

    const id = setInterval(bater, 2000);
    /* O instante em que a pessoa VOLTA para esta aba é o momento mais provável de a
     * confirmação já ter acontecido — mais rápido que qualquer relógio. */
    const aoVoltar = () => { if (document.visibilityState === "visible") bater(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [enviadoPara, conferirSePodeEntrar]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) return;
    setErro(null);

    const alvo = email.trim();

    /* O WhatsApp é obrigatório desde 30/10/2026: é por ele que a equipe chama quem acabou de
     * entrar. Pedir aqui faz o número chegar no aviso de cadastro novo, que sai no instante em
     * que a conta nasce. Quem entra pelo Google é pedido depois, no `/whatsapp`. Ver
     * `nucleo/dominio/whatsapp-da-conta.ts`. */
    const whatsapp = whatsappDaConta(telefone);
    if (!whatsapp) {
      setErro("Confira o WhatsApp e escreva com o DDD.");
      return;
    }
    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa de pelo menos ${SENHA_MIN} caracteres.`);
      setPasso("conta");
      return;
    }

    setCarregando(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: alvo,
      password: senha,
      options: {
        data: { telefone: whatsapp },
        /* Para onde o link do e-mail devolve. `/auth/callback` transforma o que veio na
         * URL em sessão — é o MESMO caminho do OAuth, e o comentário de lá diz isso.
         *
         * ⚠️ `next=/comecar` E NÃO `next=/`. Quem acaba de confirmar o e-mail é, por
         * definição, alguém que ainda não tem negócio: mandá-lo ao painel o fazia bater
         * num 409 `sem_negocio` e ser reexpulso para `/comecar` pelo store. Funcionava por
         * ricochete, e ricochete só funciona enquanto todo mundo no caminho concorda —
         * bastava o painel demorar a montar para a pessoa ver uma tela quebrada no
         * primeiro segundo de uso. Ir direto tira um salto e um estado intermediário.
         *
         * ⚠️ E ESTE ENDEREÇO PRECISA ESTAR EM **Redirect URLs** NO PAINEL DO SUPABASE.
         * Fora da lista, o Supabase IGNORA o `emailRedirectTo` em silêncio e usa o Site
         * URL do projeto — que não é `/auth/callback`, então não há `?code=` para trocar,
         * e a pessoa cai numa tela de login limpa logo depois de confirmar a conta. É
         * configuração, não código: `RecuperarSessaoDaUrl` é a rede de segurança, não o
         * conserto. */
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fcomecar`,
      },
    });

    if (error) {
      /* A mensagem do Supabase vem em inglês e fala de "user"/"credentials". Traduzir os
       * dois casos que a pessoa pode CONSERTAR, e cair numa frase honesta no resto —
       * ecoar o texto cru transformaria a resposta da API no texto da nossa tela. */
      const m = error.message.toLowerCase();
      /* Com "Confirm email" desligado, e-mail já cadastrado vem como erro 422, e não como o
       * 200 de `identities` vazio tratado abaixo. Ver o ⚠️ igual em `assinar/[plano]/Assinar.tsx`. */
      /* Erro de e-mail ou de senha volta para a tela onde está o campo que o causou. */
      if (error.code === "user_already_exists" || /already registered|already exists/.test(m)) { setErro("Este e-mail já tem uma conta. Entre por aqui embaixo."); setPasso("conta"); }
      else if (/password/.test(m)) { setErro(`A senha precisa de pelo menos ${SENHA_MIN} caracteres.`); setPasso("conta"); }
      else if (/email|invalid/.test(m)) { setErro("Confira o e-mail digitado."); setPasso("conta"); }
      else if (/rate|limit|seconds/.test(m)) setErro("Muitas tentativas seguidas. Espere um minuto e tente de novo.");
      else setErro("Não foi possível criar a conta agora. Tente de novo em instantes.");
      setCarregando(false);
      return;
    }

    /* ⚠️ E-MAIL JÁ CADASTRADO NÃO VEM COMO ERRO.
     *
     * O Supabase responde 200 com um usuário de `identities` VAZIO quando o e-mail já
     * existe — é a defesa dele contra alguém usar o cadastro para descobrir quem tem
     * conta. O efeito colateral, se ninguém tratar, é o pior beco do fluxo: a tela diz
     * "confira sua caixa de entrada", nenhum e-mail chega (porque não há o que confirmar),
     * e a pessoa espera por algo que não vem.
     *
     * Preferimos dizer. Quem digita um e-mail no cadastro pode digitá-lo no login e ver o
     * mesmo resultado por outro caminho, então o que se ganha em sigilo aqui é quase
     * nada — e o que se perde em silêncio é um cliente parado olhando a caixa de entrada.
     */
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setErro("Este e-mail já tem uma conta. Entre por aqui embaixo.");
      setPasso("conta");
      setCarregando(false);
      return;
    }

    empurrar({ event: "maisa_sign_up", maisa_method: "email", maisa_origem: "cadastro" });
    /* Com "Confirm email" desligado (produção), o `signUp` já devolve a sessão: não há o que
     * esperar na caixa de entrada, e a tela de "Confirme seu e-mail" só piscava até o relógio
     * de 2s perceber o cookie. */
    if (data.session) { irParaComecar(); return; }
    setEnviadoPara(alvo);
    setCarregando(false);
  };

  /** A primeira tela só confere a senha e passa adiante: a conta nasce no fim da segunda. */
  const continuar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa de pelo menos ${SENHA_MIN} caracteres.`);
      return;
    }
    setPasso("whatsapp");
  };

  const travado = !isSupabaseConfigured || carregando;

  const caixaDeErro = erro && (
    <div role="alert" style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--danger);background:var(--danger-soft);padding:10px 12px;border-radius:var(--r-controle);line-height:1.45")}>{erro}</div>
  );

  /* ── estado de sucesso: SUBSTITUI o formulário ──
     Não é toast e não é faixa acima dos campos. A pessoa vai SAIR do app agora, abrir outro
     aplicativo e voltar — e o que ela precisa levar na cabeça é "procure um e-mail da maisa".
     Um formulário ainda visível ao lado disso convida a tentar de novo, o que só gera um
     segundo e-mail e mais confusão sobre qual link vale. */
  if (enviadoPara) {
    return (
      <MolduraDeEntrada chave="confirmar">
        <div style={s("display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:999px;background:var(--success-soft);align-self:center")}>
          <Icon name="check" size={26} stroke="var(--success)" />
        </div>
        <TituloDaEntrada>Confirme seu e-mail</TituloDaEntrada>
        <p style={s("margin:0;font-size:var(--t-body);color:var(--ink);line-height:1.5;text-align:center")}>
          Enviamos um link de confirmação para<br />
          <strong style={s("font-weight:var(--w-title)")}>{enviadoPara}</strong>
        </p>
        <p style={s("margin:0;font-size:var(--t-sm);color:var(--muted);line-height:1.5;text-align:center")}>
          Clique no link para entrar e configurar seu negócio. Se ele não aparecer em alguns
          minutos, <strong style={s("font-weight:var(--w-title);color:var(--ink)")}>olhe o spam</strong>: é
          onde e-mail de confirmação costuma cair.
        </p>
        {/* ── "PODE DEIXAR ABERTA" É PROMESSA, E O CÓDIGO CUMPRE ──
            Ver o bloco `A ABA QUE FICOU PARA TRÁS`, acima. Esta frase existe para a pessoa NÃO
            fechar a aba: fechar é o que a obrigava a redigitar tudo. O ponto pulsando é o sinal
            de que algo está acontecendo. */}
        <div style={s("display:flex;align-items:center;justify-content:center;gap:9px;font-size:var(--t-label);color:var(--muted);line-height:1.5;text-align:center")}>
          <span
            aria-hidden
            style={{ ...s("width:7px;height:7px;border-radius:999px;background:var(--primary);flex-shrink:0"), animation: "mpulse 1.6s ease-in-out infinite" }}
          />
          <span>Pode deixar esta aba aberta: assim que você confirmar, eu entro sozinho.</span>
        </div>

        {erro && (
          <div style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--warn);background:var(--warn-soft);padding:10px 12px;border-radius:var(--r-controle);line-height:1.45")}>
            {erro}
          </div>
        )}

        {/* O caminho manual existe desde o primeiro segundo, e não como resgate depois de o
            relógio parar: quem confirmou em outro aparelho e voltou não deveria esperar 15s
            para descobrir que já podia entrar. */}
        <button
          onClick={() => void conferirSePodeEntrar(true)}
          disabled={entrando}
          className="m-hov-primary m-press m-focus"
          style={s(`display:flex;align-items:center;justify-content:center;gap:9px;height:48px;border:none;border-radius:var(--r-painel);background:var(--primary);color:var(--on-primary);font-weight:var(--w-title);font-size:var(--t-body);cursor:${entrando ? "not-allowed" : "pointer"};opacity:${entrando ? ".6" : "1"};font-family:inherit`)}
        >
          {entrando && <span style={{ ...s("width:15px;height:15px;border:2px solid rgba(255,255,255,.4);border-top-color:var(--on-primary);border-radius:50%"), animation: "mspin .7s linear infinite" }} />}
          Já confirmei, entrar
        </button>
        <AcaoDiscreta onClick={() => { setEnviadoPara(null); setPasso("conta"); setSenha(""); setErro(null); }}>
          Digitei o e-mail errado
        </AcaoDiscreta>
      </MolduraDeEntrada>
    );
  }

  /* ── a segunda tela: o WhatsApp ──
     A conta nasce aqui, no "Criar minha conta". Voltar não perde nada: e-mail e senha ficam
     no estado. */
  if (passo === "whatsapp") {
    return (
      <MolduraDeEntrada chave="whatsapp">
        <TituloDaEntrada>Qual é o seu WhatsApp?</TituloDaEntrada>
        <form onSubmit={criar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CampoWhatsapp valor={telefone} aoMudar={setTelefone} desabilitado={travado} autoFocus />
          {caixaDeErro}
          <BotaoPrincipal carregando={carregando} travado={travado}>Criar minha conta</BotaoPrincipal>
        </form>
        <AcaoDiscreta onClick={() => { setPasso("conta"); setErro(null); }} desligada={carregando}>Voltar</AcaoDiscreta>
        <LinhaLegal />
      </MolduraDeEntrada>
    );
  }

  return (
    <MolduraDeEntrada chave="conta">
      <TituloDaEntrada>Crie sua conta na maisa</TituloDaEntrada>

      {!isSupabaseConfigured && (
        <div style={s("display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:var(--r-painel);background:var(--warm-soft);color:var(--warn);font-size:var(--t-label);line-height:1.45")}>
          <Icon name="alert" size={16} style={s("flex-shrink:0")} />
          <span><strong>Cadastro indisponível neste ambiente.</strong></span>
        </div>
      )}

      {veioDoPagamento && (
        <div style={s("display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:var(--r-painel);background:var(--success-soft);color:var(--success);font-size:var(--t-label);line-height:1.45")}>
          <Icon name="check" size={16} />
          <span><strong>Pagamento recebido.</strong> Crie sua conta com o mesmo e-mail da compra para a gente ligar as duas.</span>
        </div>
      )}

      <form onSubmit={continuar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={s("font-size:var(--t-sm);font-weight:var(--w-title);color:var(--ink)")}>E-mail</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Escreva seu e-mail…" className="m-focus" style={s(CAMPO_DE_AUTH)} disabled={travado} />
        </label>
        {/* ⚠️ NÃO usa o placeholder de bolinhas: com o olho ao lado, `••••••••` parece um campo
            JÁ PREENCHIDO cuja senha bastava revelar. */}
        <CampoSenha
          rotulo="Crie uma senha" valor={senha} aoMudar={setSenha}
          autoComplete="new-password" minLength={SENHA_MIN}
          placeholder={`Pelo menos ${SENHA_MIN} caracteres…`} desabilitado={travado}
        />
        {caixaDeErro}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BotaoPrincipal carregando={false} travado={travado}>Continuar</BotaoPrincipal>
          <span style={s("text-align:center;font-size:var(--t-label);color:var(--muted)")}>14 dias grátis, sem cartão.</span>
        </div>
      </form>

      <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={s("flex:1;height:1px;background:var(--line)")} />
        <span style={s("font-size:var(--t-label);color:var(--muted)")}>ou</span>
        <span style={s("flex:1;height:1px;background:var(--line)")} />
      </div>

      {/* Entrar e cadastrar são a MESMA chamada no Google — o provedor não distingue, e a conta
          nasce no primeiro acesso. Quem vem por aqui não passou pela tela do WhatsApp: o
          middleware pede o número logo depois (`desvioParaWhatsapp`). */}
      <BotaoGoogle modo="criar" destino="/comecar" desabilitado={travado} />

      <p style={s("margin:0;text-align:center;font-size:var(--t-sm);color:var(--muted);line-height:1.5")}>
        Já tem conta?{" "}
        <Link href="/login" className="m-focus" style={s("color:var(--primary);font-weight:var(--w-title)")}>
          Entrar
        </Link>
      </p>
      <LinhaLegal />
    </MolduraDeEntrada>
  );
}

/* `useSearchParams` obriga a fronteira de Suspense no App Router — sem ela a página
 * inteira vira renderização sob demanda no build. Mesmo arranjo do `/login`. */
export default function CadastroPage() {
  return (
    <Suspense fallback={<div className="m-altura-tela" />}>
      <CadastroInner />
    </Suspense>
  );
}
