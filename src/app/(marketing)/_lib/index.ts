/* ----------------------------------------------------------------------------
 * Ponto único de importação da biblioteca compartilhada das landing pages.
 * As páginas (Server Components) importam daqui:
 *   import { World, MarketingNav, Section, Display, Button, CTASection, Footer,
 *            ICPS, imagensBarbeiros } from "@/app/(marketing)/_lib";
 * -------------------------------------------------------------------------- */
export * from "./icp";
export * from "./imagens";
export * from "./primitives";
export { World } from "./World";
export { Wordmark } from "./Wordmark";
/* Importa `./glass-button.css` junto. Está aqui e não numa LP específica porque o
   botão é compartilhado por construção — quem importar o componente leva o vidro. */
export { GlassButton } from "./GlassButton";
export { MarketingNav } from "./MarketingNav";
export { StickyMobileCta } from "./StickyMobileCta";
/* Montado pelo <World>, como a StickyMobileCta. Exportado aqui só para simetria do
   índice — nenhuma página precisa importá-lo à mão. */
export { EntrarNoApp } from "./EntrarNoApp";
/* Idem — montado pelo <World>. Exigência externa, não escolha de design: ver o cabeçalho. */
export { RodapeLegal } from "./RodapeLegal";
export { Footer } from "./Footer";
export { CTASection } from "./CTASection";
