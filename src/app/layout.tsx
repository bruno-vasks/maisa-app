import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Plus_Jakarta_Sans, Alegreya_Sans } from "next/font/google";
import "./globals.css";
import { BASE_DE_METADATA } from "@/config/endereco";

// A face de UI. Escolhida por métrica, não por gosto: os dez dígitos da IBM Plex Sans têm o MESMO
// avanço (600/1000) e os da Plex Mono também — então um valor alinha em coluna no cartão, na
// tabela e no recibo da NFS-e sem um único font-feature-settings. A Plus Jakarta Sans, que estava
// aqui, tem dígitos proporcionais (o "1" mede metade do "0"), e por isso dinheiro e hora nunca
// alinhavam; o paliativo era trocar de família para mono em 19 pontos.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"], // 800 não existe no sistema novo
  variable: "--font-plex-sans",
  display: "swap",
});


// A VOZ DA SIDEBAR. O rail navy é o único lugar do app que não está a serviço de uma tarefa — é
// onde a MAISA se apresenta —, então ganha uma segunda família, contrastando no eixo de
// PERSONALIDADE (humanista calligráfica contra a neo-grotesque técnica da Plex), que é um dos três
// eixos de pareamento legítimos. Medido contra a Plex Sans: x-height 11% menor, cap 14% menor, 'n'
// 9% mais estreita, overshoot do 'o' de 5/1000 (lados quase retos = traço modulado à pena).
// Descartei a Fira Sans, que era a candidata óbvia, porque é metricamente quase IGUAL à Plex
// (x-height 0.527 vs 0.516) — pareamento similar-mas-não-idêntico lê como erro.
// Pesos 400/500/700: a Alegreya Sans NÃO tem 600, e --w-title é 600, então o navegador
// sintetizaria para 700. O rail usa 500/700 explicitamente (ver AppShell).
const alegreya = Alegreya_Sans({
  subsets: ["latin", "latin-ext"], // latin-ext: ã õ ç é ê desenhados, não compostos
  weight: ["400", "500", "700"],
  variable: "--font-nav-src", // --font-nav (com fallbacks) é composto no globals.css
  display: "swap",
});

// Jakarta sobrevive como LOGOTIPO, não como família de texto: só o wordmark "maisa" (800 dourado),
// no rail do app e dentro das landing pages — cujo escopo usa outra fonte de corpo, e por isso ela
// precisa existir como variável, não só como className.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  /* ⚠️ SEM ISTO, TODO `canonical` DO PROJETO APONTA PARA A MÁQUINA DE QUEM COMPILOU.
   *
   * `/barbeiros`, `/barbeiro`, `/privacidade` e `/termos` declaram `alternates.canonical`
   * com caminho RELATIVO. O Next resolve caminho relativo contra o `metadataBase`, e sem
   * ele o padrão é `http://localhost:3000` — a tag ia publicada assim, dizendo ao buscador
   * que a versão oficial daquela página mora no localhost. O único aviso é uma linha no
   * meio do log do build.
   *
   * Vale duplo agora que o app responde em dois endereços: é o `metadataBase` que faz cada
   * página do host antigo apontar para a do domínio próprio. Ver `config/endereco.ts`. */
  metadataBase: BASE_DE_METADATA,
  applicationName: "MAISA",
  title: "MAISA — atendimento no WhatsApp, no automático",
  description: "Agendamento e atendimento por WhatsApp, no automático — por MAISA",
  manifest: "/manifest.webmanifest",
  // apple explícito: definir `icons` no metadata desliga a auto-injeção do
  // apple-icon.tsx, então apontamos o apple-touch-icon pra rota gerada.
  icons: {
    icon: "/icon.svg",
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  // Faz o iOS abrir em tela cheia (sem barra do Safari) ao "Adicionar à Tela de Início".
  appleWebApp: {
    capable: true,
    // ⚠️ `maisa`, minúsculo — é o rótulo embaixo do ícone na tela inicial do iPhone, e o
    // design system é explícito: "nunca `Maisa` ou `MAISA`". Dizia "MAISA" até 22/09/2026.
    title: "maisa",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  /* acompanha --nav (oklch(0.290 0.078 262)); antes era o navy antigo #233E71
   *
   * ⚠️ FICA AZUL DE PROPÓSITO, e isso NÃO é o mesmo descuido que o ícone tinha.
   *
   * Em 22/09/2026 o ícone, o apple-icon e o manifest foram alinhados ao verde do design
   * system — são o que o Google e a tela inicial do celular mostram, e lá havia DUAS
   * marcas concorrendo. Esta linha é outra coisa: ela pinta a moldura do navegador em
   * volta do app, e o app inteiro (`--nav`, `--primary`) ainda roda na paleta navy
   * antiga. Verde aqui com a tela azul embaixo pareceria defeito.
   *
   * O que isso revela é o gargalo de verdade: o painel nunca foi repintado no design
   * system. Isso é decisão de produto, não conserto de arquivo — e enquanto não for
   * tomada, o honesto é esta linha seguir o que a tela realmente é. */
  themeColor: "#152A52",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${alegreya.variable} ${jakarta.variable}`}>
      {/* sem className de fonte no body: quem manda é `font-family: var(--font-sans)` no
          globals.css. Antes havia um literal 'Plus Jakarta Sans' no CSS que NUNCA resolvia (o
          next/font ofusca o nome da família) e só não quebrava porque o className vencia por
          especificidade — duas fontes de verdade, uma delas morta. */}
      <body>{children}</body>
    </html>
  );
}
