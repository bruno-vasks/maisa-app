/* Os cenários do ensaio da conta oficial (o suporte da maisa, 11 92749-1903).
 *
 * Os quatro primeiros são conversas REAIS do banco (só leitura), com a primeira mensagem igual
 * à que a pessoa mandou; os outros são as dúvidas de configuração que o Bruno quer que ela
 * resolva sozinha. `boasVindas` é o índice da versão sorteada pelo n8n (0 a 4): a MESMA versão
 * nas duas variantes, para o antes × depois comparar texto com texto. `null` = a pessoa chegou
 * pela LP, sem boas-vindas. */

export type CenarioSuporte = {
  id: string;
  titulo: string;
  /** De onde veio: conversa real (data e final do número) ou dúvida de configuração. */
  origem: string;
  relogio: string;
  telefone: string;
  boasVindas: number | null;
  /** Só quem entrou pelo Google tem o nome nas boas-vindas. */
  nome?: string;
  persona: string;
  objetivo: string;
  abertura: string[];
  maxTurnos?: number;
  esperado: string;
};

const LEU_RAPIDO = "Você leu as mensagens do outro lado rápido, no celular, entre uma coisa e outra.";

export const CENARIOS_SUPORTE: CenarioSuporte[] = [
  {
    id: "valor-do-corte",
    titulo: "Testa como se fosse cliente da própria barbearia",
    origem: "real, 17/11/2026, final 0842",
    relogio: "2026-11-17T13:41:00-03:00",
    telefone: "5511997620842",
    boasVindas: 1,
    persona: `Você tem uma barbearia pequena e acabou de criar sua conta na maisa pelo celular, porque viu um anúncio de uma secretária de IA que atende no WhatsApp. Uns minutos depois chegaram as mensagens que estão na tela, de um número que você não tinha salvo. ${LEU_RAPIDO} Você escreve curto, tudo minúsculo, sem pontuação.`,
    objetivo: `Você quer ver a maisa funcionando na sua barbearia. Já respondeu "nao" (não tinha dúvida) e mandou "valor do corte", do jeito que um cliente seu perguntaria. Daqui em diante, reaja ao que aparecer: se oferecerem um horário, aceite com "sim", como você faria; se explicarem que este número não é a sua maisa, pergunte o que falta para ela funcionar na sua barbearia e siga o que disserem. Se ficar confuso, diga que não entendeu. Encerre quando souber o que fazer, ou se desistir.`,
    abertura: ["nao", "valor do corte"],
    maxTurnos: 6,
    esperado: "Perceber que a pessoa está testando como cliente da própria barbearia; dizer que este número é o suporte da maisa e que a maisa dela atende no número dela, com os serviços dela; ajudar com o que falta para ativar. Não oferecer a conversa de 30 min como se fosse o corte.",
  },
  {
    id: "quem-e-o-bruno",
    titulo: "Pergunta quem é o Bruno",
    origem: "real, 09/11/2026, final 4906",
    relogio: "2026-11-18T15:49:00-03:00",
    telefone: "5511971234906",
    boasVindas: null,
    persona: "Você é estudante, viu um anúncio da maisa no Instagram e tocou no botão do WhatsApp. Escreve informal, sem acento, com 'kkk' às vezes.",
    objetivo: "Você quer entender o que é a maisa. Se te oferecerem conversar com alguém, pergunte quem é essa pessoa antes de aceitar. Depois de entender, recuse sem pressa ('vou pensar') e encerre.",
    abertura: ["Quero saber mais sobre a maisa"],
    maxTurnos: 5,
    esperado: "Explicar a maisa em poucas frases; ao oferecer a conversa, dizer quem é o Bruno (o especialista da maisa) e o que acontece nela; aceitar o 'vou pensar' sem insistir.",
  },
  {
    id: "onde-digito-o-codigo",
    titulo: "Não acha onde digitar o código no iPhone",
    origem: "real, 12/11/2026, final 7197",
    relogio: "2026-11-18T21:59:00-03:00",
    telefone: "5511988067197",
    boasVindas: 4,
    persona: `Você é manicure, tem 52 anos e criou a conta pelo iPhone, sem computador. O app mostrou um código de 8 letras e números para conectar o WhatsApp e você não sabe onde digitar. No seu WhatsApp do iPhone, as abas lá embaixo são: Atualizações, Ligações, Comunidades, Conversas e Você. Não existe aba "Configurações" no seu. Você escreve com erros e sem acento.`,
    objetivo: "Você quer conectar o WhatsApp. Siga o caminho que te passarem: se o nome que disserem não existir no seu WhatsApp, diga que não achou. Se mandarem um vídeo ou link, diga que vai ver. Encerre quando tiver o caminho certo, ou se desistir.",
    abertura: ["Onde digitar o codigo"],
    maxTurnos: 6,
    esperado: "Dizer que o código se digita dentro do WhatsApp do celular, com o caminho do iPhone nos nomes de hoje (Você, Dispositivos conectados, Conectar dispositivo, Conectar com número de telefone), e mandar o vídeo do caminho.",
  },
  {
    id: "quero-uma-pessoa",
    titulo: "Quer falar com uma pessoa",
    origem: "variação de 09/11/2026 (final 4001)",
    relogio: "2026-11-19T11:30:00-03:00",
    telefone: "5511971124001",
    boasVindas: 3,
    persona: `Você é a Carla, dona de uma clínica de estética com duas funcionárias. Criou a conta mas prefere ouvir de uma pessoa antes de configurar. ${LEU_RAPIDO} Escreve direto, abrevia ("vc", "q").`,
    objetivo: "Você quer conversar com alguém da maisa. Se oferecerem, aceite e marque para amanhã de manhã. Dê o seu nome se pedirem. Encerre quando estiver marcado.",
    abertura: ["prefiro falar com uma pessoa de vcs"],
    maxTurnos: 6,
    esperado: "Oferecer a conversa com o Bruno dizendo quem ele é (o especialista da maisa), mostrar horários de amanhã de manhã e marcar.",
  },
  {
    id: "servicos-e-horarios",
    titulo: "Onde cadastra serviços, preços e horário de cada profissional",
    origem: "dúvida de configuração",
    relogio: "2026-11-18T10:05:00-03:00",
    telefone: "5511981112233",
    boasVindas: 0,
    nome: "Rafa",
    persona: `Você é a Rafa, dona de um salão de beleza com três profissionais. Criou a conta pelo computador. ${LEU_RAPIDO} Escreve simpática, com um emoji às vezes.`,
    objetivo: "Primeiro você quer saber onde cadastra os serviços e os preços. Depois, como coloca o horário de cada profissional: a Bia só trabalha à tarde. Encerre quando souber onde fica cada coisa.",
    abertura: ["oi! onde eu coloco os meus serviços e os preços?"],
    maxTurnos: 6,
    esperado: "Indicar a tela de serviços e a de equipe com o horário de cada profissional, com os nomes que o app mostra.",
  },
  {
    id: "numero-pessoal-e-ligar",
    titulo: "Psicóloga com número pessoal: família e como ligar",
    origem: "dúvida de configuração",
    relogio: "2026-11-18T19:20:00-03:00",
    telefone: "5511984445566",
    boasVindas: 2,
    persona: `Você é psicóloga, atende sozinha e usa o seu número pessoal com os pacientes. Criou a conta hoje. ${LEU_RAPIDO} Escreve formal, frases completas, sem emoji.`,
    objetivo: "Você quer saber se ela vai responder a sua família e os amigos. Depois, quer saber o que falta para ela começar a responder os pacientes: você não sabe se ela já está ligada. Encerre quando souber o que fazer.",
    abertura: ["Boa noite. Sou psicóloga e uso o meu número pessoal. Ela vai responder a minha família?"],
    maxTurnos: 6,
    esperado: "Explicar como ela trata o número pessoal (família e amigos ficam de fora) e onde se liga a maisa para atender os pacientes, com os nomes do app.",
  },
  {
    id: "testei-e-nao-respondeu",
    titulo: "Mandou mensagem para o próprio número e ela não respondeu",
    origem: "dúvida de configuração",
    relogio: "2026-11-18T16:40:00-03:00",
    telefone: "5511973334455",
    boasVindas: 1,
    persona: `Você tem uma barbearia. Conectou o WhatsApp no app agora há pouco e, para testar, mandou "oi" do seu próprio celular para o seu próprio número. ${LEU_RAPIDO} Escreve curto, sem pontuação.`,
    objetivo: "Você quer saber se está funcionando e como testa. Siga o que disserem. Encerre quando souber como testar.",
    abertura: ["conectei o whatsapp", "mandei msg pro meu numero e ela nao respondeu", "ta funcionando?"],
    maxTurnos: 6,
    esperado: "Explicar como testar de verdade (de outro celular, como se fosse cliente) e o que conferir no app se não responder, com os nomes do app.",
  },
  {
    id: "pix-e-conversas",
    titulo: "Como liga a cobrança pelo Pix e onde vê as conversas",
    origem: "dúvida de configuração",
    relogio: "2026-11-19T09:15:00-03:00",
    telefone: "5511976667788",
    boasVindas: 4,
    persona: `Você é nutricionista e atende num consultório próprio. Já conectou o WhatsApp. ${LEU_RAPIDO} Escreve normal, com pontuação.`,
    objetivo: "Primeiro: onde você coloca a sua chave Pix para ela cobrar os pacientes. Depois: onde você vê as conversas que ela teve e como responde você mesma quando quiser. Encerre quando souber.",
    abertura: ["Bom dia! Como faço para ela cobrar meus pacientes pelo Pix? Onde coloco minha chave?"],
    maxTurnos: 6,
    esperado: "Indicar onde se cadastra a chave Pix e se escolhe quando cobrar, e onde ficam as conversas e como assumir uma, com os nomes do app.",
  },
];

export const cenarioSuporte = (id: string): CenarioSuporte => {
  const c = CENARIOS_SUPORTE.find((x) => x.id === id);
  if (!c) throw new Error(`cenário desconhecido: ${id}`);
  return c;
};
