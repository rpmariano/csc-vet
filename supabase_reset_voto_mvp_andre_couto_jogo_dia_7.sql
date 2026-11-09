-- ==============================================================================
-- RESET AO VOTO DE MVP DO JOGADOR A. COUTO (ANDRÉ COUTO) PARA O JOGO DE DIA 7
-- ==============================================================================
-- Este script:
-- 1. Localiza o atleta André Couto (ID 065e8e4d-174f-4747-b607-1c5325ef87c8);
-- 2. Localiza o jogo de dia 07/11/2026 (ou o jogo mais recente realizado a 7 de Novembro);
-- 3. Elimina o voto que André Couto submeteu como eleitor (voter_id), permitindo-lhe
--    votar novamente;
-- 4. Mantém intactos os votos que outros atletas possam ter submetido.
-- ==============================================================================

DO $$
DECLARE
    v_andre_id uuid;
    v_andre_name text;
    v_jogo_id uuid;
    v_jogo_titulo text;
    v_jogo_data timestamptz;
    v_votos_removidos integer := 0;
BEGIN
    -- 1. Obter André Couto
    SELECT id, name
    INTO v_andre_id, v_andre_name
    FROM public.profiles
    WHERE id = '065e8e4d-174f-4747-b607-1c5325ef87c8'
       OR email = 'andre.coutofz@gmail.com'
       OR LOWER(name) LIKE '%andré%couto%'
       OR LOWER(name) LIKE '%andre%couto%'
       OR LOWER(shirt_name) = 'a. couto'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_andre_id IS NULL THEN
        RAISE EXCEPTION 'Perfil de André Couto não foi encontrado.';
    END IF;

    RAISE NOTICE 'Atleta identificado: % (ID: %)', v_andre_name, v_andre_id;

    -- 2. Localizar o jogo de dia 7 (Novembro de 2026 ou último dia 7)
    SELECT id, title, date_time
    INTO v_jogo_id, v_jogo_titulo, v_jogo_data
    FROM public.events
    WHERE type = 'match'
      AND (
        date_time::date = '2026-11-07'
        OR (EXTRACT(DAY FROM date_time) = 7 AND date_time <= now())
      )
    ORDER BY date_time DESC
    LIMIT 1;

    -- Caso não encontre especificamente por dia 7, procura o último jogo realizado
    IF v_jogo_id IS NULL THEN
        SELECT id, title, date_time
        INTO v_jogo_id, v_jogo_titulo, v_jogo_data
        FROM public.events
        WHERE type = 'match'
          AND date_time <= now()
        ORDER BY date_time DESC
        LIMIT 1;
    END IF;

    IF v_jogo_id IS NULL THEN
        RAISE EXCEPTION 'Não foi encontrado nenhum jogo para a data indicada.';
    END IF;

    RAISE NOTICE 'Jogo selecionado: % em % (ID: %)', v_jogo_titulo, v_jogo_data, v_jogo_id;

    -- 3. Eliminar o voto de André Couto (onde ele votou como eleitor)
    DELETE FROM public.mvp_votes
    WHERE event_id = v_jogo_id
      AND voter_id = v_andre_id;

    GET DIAGNOSTICS v_votos_removidos = ROW_COUNT;

    IF v_votos_removidos > 0 THEN
        RAISE NOTICE 'SUCESSO: Foi eliminado o voto de André Couto para o jogo % (ID do evento: %).', v_jogo_titulo, v_jogo_id;
    ELSE
        RAISE NOTICE 'AVISO: André Couto não tinha nenhum voto registado na base de dados para o jogo %.', v_jogo_titulo;
    END IF;

    -- 4. Garantir que a votação do jogo permanece aberta para que ele possa votar
    UPDATE public.events
    SET mvp_voting_closed = FALSE
    WHERE id = v_jogo_id;

END $$;

-- 5. Consulta de verificação dos votos restantes para este jogo
SELECT
    v.id,
    e.title AS jogo,
    e.date_time,
    p_eleitor.name AS eleitor,
    p1.name AS melhor_3pts,
    p2.name AS segundo_1pt,
    v.created_at
FROM public.mvp_votes v
JOIN public.events e ON e.id = v.event_id
JOIN public.profiles p_eleitor ON p_eleitor.id = v.voter_id
LEFT JOIN public.profiles p1 ON p1.id = v.player1_id
LEFT JOIN public.profiles p2 ON p2.id = v.player2_id
WHERE e.date_time::date = '2026-11-07'
   OR (EXTRACT(DAY FROM e.date_time) = 7 AND e.date_time <= now())
ORDER BY v.created_at DESC;
