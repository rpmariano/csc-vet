-- ============================================================================
-- search_path fixo nas quatro funções que ainda o herdavam (2026-09-26)
-- ============================================================================
--
-- O `get_advisors(security)` do Supabase marcava-as com "Function Search Path
-- Mutable": sem `SET search_path`, a função resolve os nomes pelo caminho de
-- quem a chama, e quem puser à frente um esquema com um `lower()` ou um
-- `unnest()` seus muda o que ela faz.
--
-- Nenhuma das quatro é SECURITY DEFINER, por isso não havia por aqui como
-- ganhar privilégios — é higiene, e o aviso deixa de tapar os que contam.
--
-- O caminho fica vazio, e não `public` como nas outras funções deste
-- repositório: os corpos só usam o que vive em `pg_catalog` (que se procura
-- sempre, com caminho ou sem ele) e as colunas da linha do gatilho, e não
-- referem nada de `public`. Um caminho vazio é o que não deixa resolver mais
-- nada. Uma função nova que leia tabelas qualifica-as (`public.profiles`) ou
-- leva `SET search_path = public`.
--
-- Quem as usa, verificado na base antes e depois (mesmos resultados):
--   * nome_mes_ano                 → v_financial_movements ("Quota de Setembro 2026")
--   * nome_do_mes                  → avisos_pendentes() (o texto dos avisos push)
--   * profiles_janela_de_atividade → o gatilho de `profiles`
--   * nome_palavras                → já ninguém: era da ligação de contas por
--                                    nome, que saiu a 2026-09-07
--                                    (supabase_identidade_por_email_migration.sql)
--
-- Nota: uma função SQL com `SET` deixa de ser embutida pelo planeador na
-- consulta que a chama. Na `v_financial_movements` isso é uma chamada por
-- linha, a umas dezenas de linhas — não se mede.
-- ============================================================================

ALTER FUNCTION public.nome_do_mes(integer)          SET search_path = '';
ALTER FUNCTION public.nome_mes_ano(date)            SET search_path = '';
ALTER FUNCTION public.nome_palavras(text)           SET search_path = '';
ALTER FUNCTION public.profiles_janela_de_atividade() SET search_path = '';
