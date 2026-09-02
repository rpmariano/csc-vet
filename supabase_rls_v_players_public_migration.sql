-- ============================================================================
-- Fecha a escrita e o acesso anónimo a `v_players_public`
-- ============================================================================
--
-- Encontrado em 2026-09-02, ao apontar as leituras de plantel para esta vista.
--
-- A vista é SECURITY DEFINER — corre como a dona, sem passar pela RLS de
-- `profiles`. É isso que lhe permite servir o plantel a qualquer membro depois
-- de `profiles` ter sido fechada. Só que é também uma vista simples
-- (`select <colunas> from profiles`), portanto o Postgres torna-a
-- **automaticamente atualizável**; e os privilégios por omissão do Supabase
-- davam INSERT, UPDATE e DELETE a `anon` e a `authenticated`.
--
-- Somando as três coisas: a chave anónima — que vai no bundle público, ao
-- alcance de qualquer visitante do site — dava escrita direta em `profiles`,
-- sem sessão nenhuma. Verificado na base antes de corrigir, numa transação
-- revertida: com o papel `anon` e sem JWT, foi possível ler as 27 fichas do
-- plantel e correr `UPDATE ... SET role = 'admin'` sobre a ficha de um jogador.
-- Era um caminho aberto para qualquer pessoa se promover a administrador, ou
-- apagar o plantel.
--
-- Correção: a vista serve para uma coisa só — ler o plantel estando
-- autenticado. Fica só com isso.
--
-- APLICADA em 2026-09-02 ao projeto vwvsfrzwcwdvbuaxftoh (migração
-- `fechar_escrita_e_acesso_anonimo_a_v_players_public`). Verificado depois, na
-- base: `anon` bloqueado na leitura; um jogador autenticado lê as 27 fichas do
-- plantel; a escrita pela vista bloqueada.
--
-- Nota: o linter do Supabase continua a assinalar `security_definer_view` nesta
-- vista. É intencional — é o que lhe permite mostrar o plantel a um jogador
-- depois de `profiles` ter deixado de o fazer. O que a tornava perigosa não era
-- ser SECURITY DEFINER, eram os privilégios; e esses ficaram fechados.
-- ============================================================================

BEGIN;

REVOKE ALL ON public.v_players_public FROM anon;
REVOKE ALL ON public.v_players_public FROM authenticated;

GRANT SELECT ON public.v_players_public TO authenticated;

COMMIT;

-- ============================================================================
-- Confirmar depois de correr — deve devolver uma linha só, `authenticated` com
-- SELECT:
--
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'v_players_public'
--     and grantee in ('anon', 'authenticated');
-- ============================================================================
