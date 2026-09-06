-- ============================================================================
-- Duas folgas de segurança, apanhadas ao rever a base para o redesenho.
--
-- Nenhuma era uma porta aberta: a primeira só se abriria se um gatilho
-- falhasse, e a segunda estava tapada por guardas dentro das funções. Mas em
-- ambos os casos a defesa estava um andar acima do que devia.
--
-- Idempotente — pode ser corrida várias vezes em segurança.
-- ============================================================================


--------------------------------------------------------------------------------
-- 1. Uma ficha criada pelo próprio só pode nascer jogador
--------------------------------------------------------------------------------
-- A política de INSERT deixava qualquer autenticado criar a *sua* ficha sem
-- dizer nada sobre `role` e `roles` — ou seja, com `role = 'admin'`, que é o
-- que `get_user_role()` passa a devolver e o que dá escrita em todo o esquema.
--
-- Na prática ninguém lá chegava: o gatilho `on_auth_user_created` cria a ficha
-- com `role = 'player'` no mesmo instante em que a conta nasce, e um INSERT do
-- próprio bate na chave primária (verificado: zero contas sem ficha). Mas esse
-- gatilho engole os seus próprios erros (`EXCEPTION WHEN OTHERS ... RAISE
-- WARNING`) e `profiles.email` é NOT NULL — uma conta sem email deixaria a
-- ficha por criar, e a porta aberta.
--
-- A equipa técnica continua a criar fichas com o papel que quiser: é o
-- trabalho dela. O que fica travado é o próprio dar-se um papel.
--
-- Verificado, a fazer-se passar por um autenticado sem ficha: inserir com
-- `role = 'admin'` dá 42501 (RLS), inserir com `role = 'player'` — o que a app
-- faz em `AuthContext` — passa.

DROP POLICY IF EXISTS "Criar a própria ficha ou, sendo equipa técnica, qualquer uma"
    ON public.profiles;

CREATE POLICY "Criar a própria ficha ou, sendo equipa técnica, qualquer uma"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
    public.get_user_role() = ANY (ARRAY['coach'::user_role, 'admin'::user_role])
    OR (
        (SELECT auth.uid()) = id
        AND role = 'player'::user_role
        AND roles = ARRAY['player']::user_role[]
    )
);


--------------------------------------------------------------------------------
-- 2. Funções SECURITY DEFINER deixam de ser chamáveis sem sessão
--------------------------------------------------------------------------------
-- Estavam expostas em `/rest/v1/rpc/...` à chave anónima, que é pública por
-- desenho (o Vite injeta-a no bundle que qualquer visitante descarrega). A
-- maioria tem guarda interna que dispara sem sessão — `get_user_role()` devolve
-- NULL e o `IS DISTINCT FROM` trava —, mas a guarda é a segunda linha de
-- defesa, não a primeira.
--
-- **É preciso revogar nos dois sítios.** O CLAUDE.md já registava metade da
-- lição: os *default privileges* deste schema concedem EXECUTE diretamente a
-- `anon` e `authenticated`, e por isso um REVOKE a PUBLIC não chega. A outra
-- metade é o inverso — o Postgres também concede EXECUTE a PUBLIC em toda a
-- função nova, e `anon` herda de lá. Revogar só ao `anon` deixou cinco destas
-- na mesma (`=X/postgres` à cabeça do `proacl`).
--
-- `authenticated` mantém o EXECUTE onde é preciso: as quatro primeiras são
-- chamadas pela app depois do login, e `get_user_role`/`get_user_roles` são
-- avaliadas dentro das próprias políticas de RLS — sem elas parava a leitura
-- toda. Nenhuma política deste esquema é dirigida a `anon`, por isso tirar-lhe
-- o EXECUTE não afeta a avaliação de política nenhuma.

REVOKE EXECUTE ON FUNCTION public.admin_linked_profile_ids()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_merge_profiles(uuid, uuid)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.associate_my_profile(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_my_profile_match(boolean)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role()                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles()                    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_linked_profile_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_profiles(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.associate_my_profile(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_my_profile_match(boolean)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles()                 TO authenticated;

-- `handle_new_user` é gatilho de `auth.users` e nunca uma RPC. Um gatilho corre
-- com as permissões com que foi criado e não exige EXECUTE a quem provoca a
-- escrita, por isso sai da API para os dois lados.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


--------------------------------------------------------------------------------
-- Como confirmar
--------------------------------------------------------------------------------
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public';
--
-- Depois de correr esta migração: `anon` falso em todas; `authenticated`
-- verdadeiro em todas menos `handle_new_user`. E, a fazer-se passar por um
-- utilizador real, o admin continua a ver 28 fichas e o jogador 1.
