/* A conta oficial da maisa (o suporte, 11 92749-1903) como negócio de teste, em duas variantes.
 *
 * ANTES: o que está no banco em 17/11/2026 (copiado por leitura), e as cinco boas-vindas do n8n.
 * DEPOIS: a proposta aprovada pelo Bruno em 17/11/2026. Muda só configuração, nada de código:
 *   - nome do negócio "suporte da maisa", papel do Bruno "especialista da maisa", serviço
 *     "Conversa com o Bruno, nosso especialista";
 *   - respostas prontas com os nomes de tela do commit d8638b2 (mapa lido do código em 17/11)
 *     e o vídeo do código;
 *   - boas-vindas novas, com a última bolha "dúvida sobre como terminar de ativar a sua maisa". */

import type { NegocioDeTeste } from "../negocios";
import { FAQS_ANTES } from "./faqs-antes";

const VIDEO = "https://app.maisasecretary.com.br/tutorial/whatsapp-codigo-iphone.mp4";

/* ───────────────────────────── as respostas prontas ───────────────────────────── */

type Faq = { id: string; pergunta: string; resposta: string };

/** O que muda numa resposta que já existe (pelo id do banco). `pergunta` ausente = a mesma. */
const EDITADAS: Record<string, Partial<Faq>> = {
  "57dfd605": {
    pergunta: "Você é a maisa? Estou falando com um robô? Que número é esse? Com quem estou falando?",
    resposta: "Sou a maisa, a assistente de IA, e este número é o suporte da maisa: aqui eu atendo quem quer conhecer a maisa ou está terminando de ativar a conta. A sua maisa é outra: ela atende os seus clientes no seu próprio WhatsApp, depois que você conecta o seu número no app.",
  },
  d89991ee: {
    resposta: "Pode! Quer conversar com o Bruno, nosso especialista? É uma conversa de 30 minutos pelo WhatsApp, sem custo: ele mostra como a maisa fica no seu negócio e tira as suas dúvidas. Qual dia fica bom para você?",
  },
  "5f1fa3ff": {
    resposta: "A diferença é só quantos agendamentos a maisa faz por mês: 300 no Essencial, 700 no Profissional e 1.700 no Escala. Todos têm as mesmas funções e profissionais ilimitados. Quem atende sozinho costuma caber no Essencial. O Escala é combinado numa conversa com o Bruno, nosso especialista.",
  },
  cd65696d: {
    resposta: `O código se digita dentro do próprio WhatsApp, no celular do número que você quer conectar. No iPhone: toque em Você, embaixo à direita, depois em Dispositivos conectados e em Conectar dispositivo. No Android: toque nos três pontinhos lá em cima, depois em Dispositivos conectados e em Conectar dispositivo. A câmera vai abrir, mas não precisa apontar para nada: embaixo dela, toque em Conectar com número de telefone e digite o código. Este vídeo de 11 segundos mostra o caminho no iPhone: ${VIDEO} . O código troca sozinho a cada minuto na tela do app: digite o que estiver aparecendo.`,
  },
  "25d3371f": {
    resposta: `Dá. No app, no menu A MAISA, abra WhatsApp e número (no celular ele já abre no caminho do código). Confira o número, toque em Receber código e depois em "Está certo, enviar". Aparece um código de 8 caracteres, que você digita no WhatsApp do celular: Você (no iPhone) ou os três pontinhos (no Android), Dispositivos conectados, Conectar dispositivo, Conectar com número de telefone. O vídeo do caminho no iPhone: ${VIDEO}`,
  },
  "277b9b42": {
    resposta: "No app, no menu A MAISA, abra WhatsApp e número e toque em Conectar WhatsApp. No computador aparece um QR code. No celular do negócio, abra o WhatsApp e vá em Dispositivos conectados (no iPhone, pela aba Você; no Android, pelos três pontinhos), toque em Conectar dispositivo e aponte a câmera para o QR. A tela do app avisa sozinha quando conectar. Se o QR expirar, é só tocar em conectar de novo.",
  },
  ea847b39: {
    pergunta: "Ela vai responder meus amigos e minha família? Uso meu número pessoal. Número pessoal ou só do negócio?",
    resposta: "Não, se você escolher assim. No app, em A MAISA, WhatsApp e número, tem a pergunta \"De quem é esse número?\". Com \"É meu número pessoal também\", que é como toda conta começa, ela só atende quem você marcar como cliente e número novo que chega pedindo horário; família e amigos ficam de fora. Em \"Trazer meus contatos\" você escolhe quem ela atende. Com \"É só do negócio\", ela atende todo mundo que escrever.",
  },
  "858d9dfa": {
    resposta: "Sim. Conectando o Google Agenda, compromisso seu bloqueia o horário e o que ela marca aparece lá. Para conectar: no menu Equipe, toque no profissional e em Conectar agenda do Google. Sem Google, ela usa a agenda do próprio app.",
  },
  c082afc2: {
    resposta: "Manda. Em A MAISA, Agendamentos, ligue Lembrete antes do atendimento e escolha quando mandar, de 1 hora a 1 semana antes. Se o cliente não puder ir, ela remarca ou cancela na mesma conversa.",
  },
  "153467e8": {
    pergunta: "E se o cliente perguntar algo que ela não sabe? Posso assumir a conversa? Onde vejo as conversas que ela teve? Como respondo eu mesmo?",
    resposta: "Ela não inventa resposta: passa a conversa para você. No menu Conversas você vê todas, e o botão Assumir deixa você responder; quando terminar, toque em Devolver à MAISA. Se você preencher, em A MAISA, WhatsApp e número, o telefone de quem ela chama quando precisa de ajuda, ela te avisa no WhatsApp com um link para assumir.",
  },
  b3398a5c: {
    resposta: "Não cobra nada sozinho. Nos últimos 3 dias do teste aparece um aviso no alto do app, com o botão Ver planos. Para continuar, você escolhe o plano e paga por Pix ou cartão ali mesmo. Se não pagar, a maisa pausa e não responde seus clientes até você assinar.",
  },
  a335883d: {
    resposta: "Uns 5 minutos: você responde três perguntas (nome do negócio, serviços e horário), conecta o WhatsApp e ela já começa a atender. Cobrança, recibo e nota se ligam depois, cada um no seu passo. Para começar agora, com 14 dias grátis: https://app.maisasecretary.com.br/assinar/profissional?teste=1&utm_source=whatsapp&utm_medium=conta-oficial",
  },
  "5db6f275": {
    resposta: "A autorização é feita uma vez só, no e-CAC, com a sua conta gov.br nível prata ou ouro. Ela permite à maisa emitir os recibos do Receita Saúde no seu nome, só no serviço do Carnê-Leão, e você pode revogar quando quiser. O passo a passo, com o CNPJ que você autoriza, aparece no app em Mais, Documento fiscal.",
  },
  aa6a4a6e: {
    resposta: "Funciona. Cada profissional entra no menu Equipe, em Adicionar profissional, com o próprio horário e a própria agenda, e os profissionais são ilimitados em todos os planos. A recepcionista usa o mesmo acesso ao app e vê a agenda de todos.",
  },
};

const NOVAS: Faq[] = [
  {
    id: "nova-minha",
    pergunta: "Essa é a minha maisa? Você é a minha secretária? Por que você não tem os meus serviços? Quero testar como se fosse meu cliente. Valor do corte, preço da consulta, tem horário pra mim?",
    resposta: "Ainda não: este número é o suporte da maisa, e aqui eu atendo você, não os seus clientes. A sua maisa atende no seu WhatsApp, com os seus serviços e horários, depois que você conecta o seu número no app. Para ver como ela responde um cliente seu: com o WhatsApp conectado, abra o app em Hoje e toque no cartão Ver funcionando.",
  },
  {
    id: "nova-bruno",
    pergunta: "Quem é o Bruno? Quem vai falar comigo? Com quem é a conversa?",
    resposta: "O Bruno é o nosso especialista na maisa. Na conversa com ele, de 30 minutos pelo WhatsApp e sem custo, ele mostra como a maisa fica no seu negócio e tira as suas dúvidas.",
  },
  {
    id: "nova-falta",
    pergunta: "O que falta para ativar a minha maisa? Quais são os passos para ela começar a atender? Terminei o cadastro, e agora?",
    resposta: "São três passos: responder as três perguntas do começo (nome do negócio, serviços e horário), conectar o seu WhatsApp e conferir se ela está ligada. Para conectar: no menu A MAISA, abra WhatsApp e número. Quando estiver tudo certo, o alto do app mostra Atendendo. Na tela Hoje, o app mostra quantos passos faltam.",
  },
  {
    id: "nova-testar",
    pergunta: "Como testo se a minha maisa está funcionando? Mandei mensagem para o meu número e ela não respondeu. Ela está funcionando?",
    resposta: "Mensagem que você manda do seu próprio número ela não responde. Para testar: no app, em Hoje, toque no cartão Ver funcionando e fale com ela como se fosse seu cliente. Ou peça para alguém mandar mensagem de outro celular pedindo um horário. Se ela não responder, olhe o alto do app: Pausada, toque em Voltar a atender; Sem WhatsApp, conecte de novo em A MAISA, WhatsApp e número. No número pessoal, ela não responde quem você não marcou como cliente, a não ser que a pessoa peça horário.",
  },
  {
    id: "nova-servicos",
    pergunta: "Onde cadastro os meus serviços e preços? Como mudo o preço ou a duração de um serviço?",
    resposta: "No menu Serviços. O botão Novo serviço fica no alto; para mudar um que já existe, toque nele e edite nome, preço, duração e quem faz. A maisa usa essa lista para responder preço e oferecer horário.",
  },
  {
    id: "nova-equipe",
    pergunta: "Como coloco o horário de cada profissional? Como adiciono alguém na equipe? Como mudo os dias e horários de atendimento?",
    resposta: "No menu Equipe. Para alguém novo, toque em Adicionar profissional. Para o horário, toque na pessoa e ajuste o bloco Quando atende: os dias e o horário, das e até. Fora desse horário a maisa não oferece vaga com essa pessoa. O horário que ela informa quando perguntam \"que horas vocês abrem?\" é outro, em A MAISA, Horário.",
  },
  {
    id: "nova-ligar",
    pergunta: "Como ligo ou desligo a maisa? Como pauso? Ela está desligada, como faço ela começar a responder?",
    resposta: "No alto do app fica o status dela, com os botões Pausar a MAISA e Voltar a atender. Também dá em A MAISA, no interruptor MAISA respondendo no WhatsApp. Ela só liga com o WhatsApp conectado. Pausada, as mensagens ficam esperando você responder.",
  },
  {
    id: "nova-tom",
    pergunta: "Como mudo o nome dela, o jeito que ela fala, o tom de voz?",
    resposta: "Em A MAISA, Como ela fala: nome do negócio, nome da assistente e tom de voz, que pode ser amigável, profissional ou descontraído.",
  },
  {
    id: "nova-respostas",
    pergunta: "Como ensino a maisa a responder perguntas do meu negócio? Endereço, estacionamento, formas de pagamento, política de atraso",
    resposta: "Em A MAISA, Respostas prontas: escreva a pergunta e a resposta e toque em Adicionar. Não precisa cadastrar variações: ela entende a mesma pergunta escrita de outro jeito.",
  },
  {
    id: "nova-pix",
    pergunta: "Onde coloco a minha chave Pix? Como ligo a cobrança pelo Pix? Como faço ela cobrar meus clientes?",
    resposta: "No menu Recebimentos (no celular, Cobranças), em Ligar o Pix: escolha o tipo da chave, cole a chave como está no banco, ponha o nome de quem recebe e toque em Ligar o Pix. Depois, em Configurar, você escolhe o que ela faz quando o atendimento acaba: perguntar se o cliente já pagou, mandar o Pix direto, ou só mandar quando você apertar Mandar Pix.",
  },
  {
    id: "nova-fiscal",
    pergunta: "Como ligo o recibo do Receita Saúde? E a nota fiscal? Onde configuro a parte fiscal? Precisa de certificado digital?",
    resposta: "Em Mais, Documento fiscal. Se você atende como pessoa física, escolha Atendo como pessoa física: a maisa emite o recibo do Receita Saúde no seu CPF, sem certificado, depois de uma autorização no e-CAC. Se tem CNPJ, escolha Tenho CNPJ: ela emite a nota fiscal de serviço, e para isso precisa do certificado digital A1 (arquivo .pfx ou .p12) e da senha dele.",
  },
  {
    id: "nova-assinar",
    pergunta: "Onde pago a assinatura? Como assino? Como troco de plano?",
    resposta: "No app, toque no seu negócio, no rodapé do menu (no celular, em Mais, Sua conta), e abra Meu plano. Lá tem o botão para assinar e os outros planos. Dá para pagar por Pix ou cartão.",
  },
  {
    id: "nova-desconectou",
    pergunta: "O WhatsApp desconectou. Ela parou de responder. Aparece Sem WhatsApp ou WhatsApp desconectado",
    resposta: "Com o WhatsApp desconectado ela não responde ninguém até conectar de novo. No alto do app, toque em Conectar o WhatsApp, ou vá em A MAISA, WhatsApp e número, e conecte pelo QR ou pelo código, do mesmo jeito da primeira vez.",
  },
];

const FAQS_DEPOIS: Faq[] = [
  ...FAQS_ANTES.map((f) => ({ ...f, ...(EDITADAS[f.id] ?? {}) })),
  ...NOVAS,
];

/** As respostas prontas da proposta, para aplicar no banco depois do OK. */
export const RESPOSTAS = { antes: FAQS_ANTES, depois: FAQS_DEPOIS, editadas: Object.keys(EDITADAS), novas: NOVAS.map((f) => f.id) };

/* ───────────────────────────── o negócio ───────────────────────────── */

const SERVICO_ANTES = "Conversar com o Bruno";
const SERVICO_DEPOIS = "Conversa com o Bruno, nosso especialista";

function conta(variante: "antes" | "depois"): NegocioDeTeste {
  const depois = variante === "depois";
  return {
    chave: `suporte-${variante}` as never,
    negocio: { nome: depois ? "suporte da maisa" : "maisa", plano: "Profissional", precoPlano: 0, proximaCobranca: "", cartao: "", conversasPlano: "" },
    assistente: { nome: "maisa", tom: "amigável", saudacao: "Oi! Aqui é a maisa.", ativa: true, lembreteHoras: 3 },
    cfg: {
      confirmar: true, lembrete: true, remarcar: true, encaixe: false, encaminhar: true,
      precoCatalogo: false, pix: false, avisarRecibo: true, reciboPrimeiroParaMim: false,
    },
    servicos: [
      { id: "827d17f2", nome: depois ? SERVICO_DEPOIS : SERVICO_ANTES, categoria: "Extra", preco: 0, duracao: 30, profissionalIds: ["b3ef27d6"], ativo: true },
    ],
    profissionais: [
      {
        id: "b3ef27d6", nome: "Bruno", papel: depois ? "nosso especialista" : "Atendimento geral",
        atendimentosMes: 0, avaliacao: 5, comissao: 0, desde: "2026-11-08", servicoIds: ["827d17f2"], ativo: true,
        horario: "Seg–Sáb 09–19", folga: "domingo", expediente: { folga: [6], de: 9, ate: 19 },
      },
    ],
    /* `horarios_anunciados` do banco: seg a sex 9–19, sábado 9–13, domingo fechado. */
    semana: [0, 1, 2, 3, 4, 5, 6].map((dow) =>
      dow === 6 ? { dow, aberto: false, de: null, ate: null } : { dow, aberto: true, de: "09:00", ate: dow === 5 ? "13:00" : "19:00" },
    ),
    faqs: depois ? FAQS_DEPOIS : FAQS_ANTES,
  } as NegocioDeTeste;
}

export const CONTA_OFICIAL = { antes: conta("antes"), depois: conta("depois") };

/* ───────────────────────────── as boas-vindas (nó Mensagens do n8n) ───────────────────────────── */

type Versao = (n: string) => string[];

export const BOAS_VINDAS: Record<"antes" | "depois", Versao[]> = {
  antes: [
    (n) => ["Olá" + n + "! Boas-vindas à maisa",
      "Eu vou ser a sua secretária: respondo seus clientes, marco os horários e cobro, tudo pelo WhatsApp, do jeito que estou falando com você agora",
      "Estou disponível aqui para tirar qualquer dúvida. É só me chamar"],
    (n) => ["Oi" + n + "! Aqui é a maisa",
      "Vi que você acabou de criar sua conta. Vou ser sua secretária: atendo seus clientes por aqui, marco os horários e cuido das cobranças",
      "Ficou com alguma dúvida? Pode me perguntar por aqui"],
    (n) => ["Oi" + n + ", tudo bem? Sou a maisa",
      "Que bom ter você com a gente! Depois que você conectar seu WhatsApp, eu respondo seus clientes, marco na sua agenda e cobro, do mesmo jeito que estou falando com você agora",
      "Qualquer dúvida na configuração, me chama aqui"],
    (n) => ["Olá" + n + "! Sua conta na maisa está criada",
      "Eu sou a maisa, sua secretária no WhatsApp. É assim que seus clientes vão falar comigo, a qualquer hora",
      "Se precisar de ajuda para configurar, é só responder esta mensagem"],
    (n) => ["Oi" + n + "! Que bom que você chegou",
      "Eu sou a maisa. Vou atender seus clientes pelo WhatsApp, marcar os horários e cobrar por você",
      "Estou por aqui se tiver qualquer dúvida"],
  ],
  depois: [
    (n) => ["Olá" + n + "! Boas-vindas à maisa. Aqui é o suporte",
      "Quem responde por aqui sou eu, a maisa, a mesma assistente de IA que vai atender os seus clientes. Só que neste número eu atendo você",
      "Se tiver alguma dúvida sobre como terminar de ativar a sua maisa, fico à disposição"],
    (n) => ["Oi" + n + "! Aqui é o suporte da maisa",
      "Eu sou a maisa, a assistente de IA. Do jeito que eu converso com você aqui, a sua maisa vai conversar com os seus clientes",
      "Ficou com alguma dúvida sobre como terminar de ativar a sua maisa? Fico à disposição por aqui"],
    (n) => ["Oi" + n + ", tudo bem? Sua conta na maisa está criada",
      "Este é o número do suporte, e quem responde sou eu, a maisa, a assistente de IA. Sou a mesma que vai atender os seus clientes, mas aqui eu atendo você",
      "Qualquer dúvida sobre como terminar de ativar a sua maisa, fico à disposição"],
    (n) => ["Olá" + n + "! Que bom que você chegou na maisa",
      "Aqui é o suporte, e quem fala com você é a própria maisa, a assistente de IA. É assim que ela vai conversar com os seus clientes",
      "Se surgir alguma dúvida para terminar de ativar a sua maisa, fico à disposição por aqui"],
    (n) => ["Oi" + n + "! Boas-vindas à maisa",
      "Este número é o suporte da maisa. Quem responde sou eu, a assistente de IA, do mesmo jeito que vou responder os seus clientes",
      "Se tiver dúvida em algum passo para terminar de ativar a sua maisa, fico à disposição"],
  ],
};

/* ───────────────────────────── a referência do juiz ───────────────────────────── */

export const REFERENCIA = `- Este número de WhatsApp (11 92749-1903) é o suporte da maisa. Quem responde é a própria maisa.
- O Bruno é o especialista da maisa. A conversa com ele dura 30 minutos, é pelo WhatsApp e não tem custo; ele atende de segunda a sábado, das 9h às 19h.
- O vídeo do caminho do código no iPhone: ${VIDEO}
- Quando a maisa não sabe responder, ela pode chamar o responsável: o Bruno recebe um aviso no WhatsApp dele e responde nesta mesma conversa quando puder, sem prazo garantido. Isso é o certo quando a resposta NÃO está na referência abaixo; quando está, chamar o Bruno em vez de responder é falha.

Fatos do app (as respostas prontas da proposta, conferidas no código em 17/11/2026):
${FAQS_DEPOIS.map((f) => `- P: ${f.pergunta}\n  R: ${f.resposta}`).join("\n")}`;
