/* ─────────────────────────────────────────────────────────────────────────────
 * 031 — A FOTO DE PERFIL DO NEGÓCIO.
 *
 * Pedida em 29/09/2026 para a gaveta "Seu negócio" do painel. O navegador reduz a imagem para
 * 256px e JPEG antes de enviar, e o que chega é uma `data:` URL de 15 a 40 KB. Uma por negócio,
 * lida junto com o cadastro: não compensa bucket, política de storage nem URL assinada. O
 * porquê inteiro está em `FOTO_MAX` (`src/nucleo/dominio/negocio.ts`), que espelha o teto daqui.
 *
 * Nula = sem foto, e o painel desenha o avatar sorteado. Aditivo e reexecutável. O código lê a
 * tabela com `*`, então funciona antes desta migração (sem foto) e depois.
 *
 * A escrita já está coberta pela política `gestao atualiza` (`003_rls.sql`): só dono e gestor.
 * ────────────────────────────────────────────────────────────────────────────── */

alter table public.negocios add column if not exists foto text;

alter table public.negocios drop constraint if exists negocios_foto_check;
alter table public.negocios add constraint negocios_foto_check
  check (foto is null or (length(foto) <= 200000 and foto ~ '^data:image/(jpeg|png|webp);base64,'));
