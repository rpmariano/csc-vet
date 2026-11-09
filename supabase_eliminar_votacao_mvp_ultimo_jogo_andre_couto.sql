-- ==============================================================================
-- ELIMINAÇÃO DA VOTAÇÃO DE MVP DO ÚLTIMO JOGO REALIZADO POR ANDRÉ COUTO
-- ==============================================================================
-- Este script localiza o André Couto, identifica o último jogo em que ele
-- jogou/participou (ou para o qual esteve convocado/confirmado) e elimina todos
-- os votos de MVP registados para esse jogo, repondo também o estado de MVP.
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
    -- 1. Obter o ID de André Couto
    SELECT id, name
    INTO v_andre_id, v_andre_name
    FROM public.profiles
    WHERE (
        email = 'andre.coutofz@gmail.com'
        OR LOWER(name) LIKE '%andré%couto%'
        OR LOWER(name) LIKE '%andre%couto%'
        OR LOWER(shirt_name) = 'a. couto'
        OR LOWER(nickname) = 'a. couto'
    )
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_andre_id IS NULL THEN
        RAISE EXCEPTION 'Perfil de André Couto não foi encontrado em public.profiles';
    END IF;

    RAISE NOTICE 'Atleta encontrado: % (ID: %)', v_andre_name, v_andre_id;

    -- 2. Encontrar o último jogo realizado por André Couto
    -- Prioridade 1: Jogo onde conste na ficha de jogo / estatísticas (stats)
    SELECT e.id, e.title, e.date_time
    INTO v_jogo_id, v_jogo_titulo, v_jogo_data
    FROM public.stats s
    JOIN public.events e ON e.id = s.event_id
    WHERE s.player_id = v_andre_id
      AND e.type = 'match'
      AND e.date_time <= now()
    ORDER BY e.date_time DESC
    LIMIT 1;

    -- Prioridade 2: Caso não haja registo em stats, procurar por convocatória confirmada
    IF v_jogo_id IS NULL THEN
        SELECT e.id, e.title, e.date_time
        INTO v_jogo_id, v_jogo_titulo, v_jogo_data
        FROM public.callups c
        JOIN public.events e ON e.id = c.event_id
        WHERE c.player_id = v_andre_id
          AND c.status = 'confirmed'
          AND e.type = 'match'
          AND e.date_time <= now()
        ORDER BY e.date_time DESC
        LIMIT 1;
    END IF;

    -- Prioridade 3: Convocado para jogo já realizado
    IF v_jogo_id IS NULL THEN
        SELECT e.id, e.title, e.date_time
        INTO v_jogo_id, v_jogo_titulo, v_jogo_data
        FROM public.callups c
        JOIN public.events e ON e.id = c.event_id
        WHERE c.player_id = v_andre_id
          AND e.type = 'match'
          AND e.date_time <= now()
        ORDER BY e.date_time DESC
        LIMIT 1;
    END IF;

    IF v_jogo_id IS NULL THEN
        RAISE EXCEPTION 'Não foi encontrado nenhum jogo realizado para André Couto.';
    END IF;

    RAISE NOTICE 'Último jogo de André Couto: % em % (ID: %)', v_jogo_titulo, v_jogo_data, v_jogo_id;

    -- 3. Eliminar todos os votos de MVP desse jogo da tabela public.mvp_votes
    DELETE FROM public.mvp_votes
    WHERE event_id = v_jogo_id;

    GET DIAGNOSTICS v_votos_removidos = ROW_COUNT;
    RAISE NOTICE 'Foram eliminados % voto(s) de MVP da tabela public.mvp_votes para este jogo.', v_votos_removidos;

    -- 4. Repor is_mvp na tabela public.stats para esse jogo
    UPDATE public.stats
    SET is_mvp = FALSE
    WHERE event_id = v_jogo_id
      AND is_mvp = TRUE;

    -- 5. Reabrir a votação ou marcar o estado conforme pretendido no evento
    UPDATE public.events
    SET mvp_voting_closed = FALSE
    WHERE id = v_jogo_id;

    -- 6. Limpar registos de avisos push de MVP para este jogo (permitindo novo ciclo se necessário)
    DELETE FROM public.avisos_enviados
    WHERE tipo = 'voto_mvp'
      AND origem_id = v_jogo_id::text;

    RAISE NOTICE 'Limpeza da votação de MVP concluída com sucesso para o jogo %!', v_jogo_titulo;
END;
$$;

-- Consulta de confirmação: Votos restantes no jogo após a execução
SELECT 
    v.id,
    v.event_id,
    e.title AS jogo,
    e.date_time,
    v.voter_id,
    v.created_at
FROM public.mvp_votes v
JOIN public.events e ON e.id = v.event_id
ORDER BY v.created_at DESC
LIMIT 10;
