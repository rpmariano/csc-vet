-- Uma conta por ligar não é uma conta "sem atleta".
--
-- A `admin_contas_sem_atleta()` procurava contas cuja ficha não tivesse número
-- de camisola, número de sócio, data de nascimento nem posição, e chamava-lhes
-- "contas sem atleta". As duas coisas estão erradas.
--
-- **`profiles` são as pessoas do clube, não os atletas.** Há quem jogue, quem
-- jogue e treine, quem jogue e dirija, e quem não jogue de todo — um treinador,
-- alguém da direção. Uma ficha sem camisola nem posição não é uma ficha por
-- ligar: é a ficha de quem não entra em campo. Em produção há exatamente uma
-- conta que a condição antiga apanhava, e é a de um treinador com 48
-- convocatórias e a ficha perfeitamente ligada.
--
-- O que a direção precisa de ver no ecrã 3d é outra coisa: **contas de login que
-- não correspondem a pessoa nenhuma do clube.** Quando alguém se regista, o
-- gatilho `handle_new_user` cria-lhe uma ficha com o nome e o email e mais nada
-- — `role = 'player'`, `roles = {player}`, que são os valores por omissão. Se a
-- associação automática não encontrar a ficha que a direção já tinha criado,
-- essa casca fica ali sozinha. É essa casca que se quer listar.
--
-- **A condição só usa colunas que o próprio não pode escrever**, e essa é a
-- parte que interessa:
--
--   role, roles         — a política de UPDATE do próprio tem
--                         `WITH CHECK (… AND role = get_user_role()
--                          AND NOT (roles IS DISTINCT FROM get_user_roles()))`.
--   jersey_number       — o bloco desportivo das Definições é só de leitura;
--   position              nenhum dos dois vai no payload que o próprio guarda.
--   callups, stats,     — escritas por treinador ou direção, nunca pelo atleta.
--   dues
--
-- Ficaram deliberadamente **de fora** `birth_date` e `member_number`, que a
-- condição antiga usava: as Definições deixam o próprio escrevê-los. Com eles na
-- condição, uma conta órfã desaparecia da lista da direção no instante em que a
-- pessoa preenchesse o seu aniversário — exatamente ao contrário do que se quer.
-- Pela mesma razão não entram o telefone, a fotografia nem a alcunha.
--
-- Verificado na base antes de aplicar: a condição nova devolve 0 linhas hoje, e
-- nenhuma das 27 fichas do clube — tenha conta ou não — lhe corresponde.

DROP FUNCTION IF EXISTS public.admin_contas_sem_atleta();

CREATE OR REPLACE FUNCTION public.admin_contas_por_ligar()
RETURNS TABLE (
    id         UUID,
    name       TEXT,
    email      TEXT,
    photo_url  TEXT,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- `IS DISTINCT FROM` e não `<>`: com `get_user_role()` a NULL — chamada sem
    -- sessão, ou conta ainda sem ficha — o `<>` dá NULL, e um IF com condição
    -- NULL não dispara. Ver o ponto 3 dos riscos no CLAUDE.md.
    IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem consultar esta informação.';
    END IF;

    RETURN QUERY
    SELECT p.id, p.name, p.email, p.photo_url, p.created_at
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
      -- Ninguém do clube lhe atribuiu papel: são os valores por omissão.
      AND p.role  = 'player'
      AND p.roles = ARRAY['player']::user_role[]
      -- O bloco desportivo está por preencher, e só o clube o escreve.
      AND p.jersey_number IS NULL
      AND COALESCE(btrim(p.position), '') = ''
      -- E o clube nunca contou com esta pessoa para nada.
      AND NOT EXISTS (SELECT 1 FROM public.callups c WHERE c.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.stats   s WHERE s.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.dues    d WHERE d.player_id = p.id)
    ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_contas_por_ligar() IS
'Contas de login que não correspondem a nenhuma pessoa do clube: ficha com nome '
'e email e mais nada, criada pelo registo e nunca ligada à ficha que a direção '
'já tinha. Para o ecrã de associação manual (3d). Só admin. Não confundir com '
'"sem dados de atleta" — um treinador que não joga também não os tem.';

-- Este esquema tem privilégios por omissão que dão EXECUTE a `anon` e
-- `authenticated` em toda a função nova — um REVOKE a PUBLIC não chegava.
-- Ver o ponto 7 dos riscos no CLAUDE.md.
REVOKE ALL ON FUNCTION public.admin_contas_por_ligar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_contas_por_ligar() TO authenticated;
