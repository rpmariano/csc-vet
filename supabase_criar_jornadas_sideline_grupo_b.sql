-- ============================================================================
-- CRIAÇÃO SEGURA DAS JORNADAS EM FALTA: SIDELINE EVENTS (GRUPO B - 2026/27)
-- ============================================================================
-- Baseado no Calendário Oficial da Liga Masters 35 - 2026/27 - Grupo B
--
-- REGRA ESTRITA:
-- 1. NÃO apaga NENHUM jogo existente.
-- 2. NÃO altera nem limpa NENHUM resultado já registado.
-- 3. Insere APENAS os jogos em falta para completar as 7 Jornadas Oficiais (21 jogos).
-- ============================================================================

DO $$
DECLARE
  v_tour_id UUID;
  v_group_b_id UUID;

  -- IDs de Opponents
  v_opp_csc UUID := NULL; -- Cascais é o clube próprio (opponent_id IS NULL)
  v_opp_fer UUID;
  v_opp_tec UUID;
  v_opp_bcac UUID;
  v_opp_amo UUID;
  v_opp_elis UUID;
  v_opp_tor UUID;

  -- IDs de Tournament Teams no Grupo B
  v_tt_csc UUID;
  v_tt_fer UUID;
  v_tt_tec UUID;
  v_tt_bcac UUID;
  v_tt_amo UUID;
  v_tt_elis UUID;
  v_tt_tor UUID;

  v_criados INT := 0;
  v_mantidos INT := 0;

  -- Função local para garantir inserção segura
  PROCEDURE inserir_jogo_se_nao_existir(
    p_matchday INT,
    p_home UUID,
    p_away UUID,
    p_date TIMESTAMPTZ
  ) IS
    v_existente UUID;
  BEGIN
    SELECT id INTO v_existente
      FROM public.tournament_matches
     WHERE tournament_id = v_tour_id
       AND matchday = p_matchday
       AND (
         (home_team_id = p_home AND away_team_id = p_away) OR
         (home_team_id = p_away AND away_team_id = p_home)
       )
     LIMIT 1;

    IF v_existente IS NOT NULL THEN
      v_mantidos := v_mantidos + 1;
      -- Manter resultados e ficha intactos; preencher match_date se estivesse vazio
      UPDATE public.tournament_matches
         SET match_date = COALESCE(match_date, p_date)
       WHERE id = v_existente;
    ELSE
      INSERT INTO public.tournament_matches (
        tournament_id,
        group_id,
        matchday,
        home_team_id,
        away_team_id,
        status,
        match_date,
        home_score,
        away_score
      ) VALUES (
        v_tour_id,
        v_group_b_id,
        p_matchday,
        p_home,
        p_away,
        'scheduled',
        p_date,
        NULL,
        NULL
      );
      v_criados := v_criados + 1;
    END IF;
  END;

BEGIN
  RAISE NOTICE '=== INÍCIO DA SINCRONIZAÇÃO DAS JORNADAS DO GRUPO B (SIDELINE) ===';

  -- 1. Localizar o Torneio Sideline
  SELECT id INTO v_tour_id
    FROM public.tournaments
   WHERE name ILIKE '%sideline%'
      OR organizer_name ILIKE '%sideline%'
      OR name ILIKE '%masters%'
   ORDER BY (status = 'ativo') DESC, created_at DESC
   LIMIT 1;

  IF v_tour_id IS NULL THEN
    SELECT id INTO v_tour_id
      FROM public.tournaments
     WHERE format <> 'knockout'
     ORDER BY (status = 'ativo') DESC, created_at DESC
     LIMIT 1;
  END IF;

  IF v_tour_id IS NULL THEN
    RAISE EXCEPTION 'Torneio Sideline não encontrado!';
  END IF;

  -- 2. Localizar ou criar o Grupo B
  SELECT id INTO v_group_b_id
    FROM public.tournament_groups
   WHERE tournament_id = v_tour_id
     AND (LOWER(TRIM(name)) = 'grupo b' OR LOWER(TRIM(name)) = 'b' OR name ILIKE '%grupo b%')
   LIMIT 1;

  IF v_group_b_id IS NULL THEN
    INSERT INTO public.tournament_groups (tournament_id, name, phase)
    VALUES (v_tour_id, 'Grupo B', 1)
    RETURNING id INTO v_group_b_id;
  END IF;

  RAISE NOTICE 'Torneio: % | Grupo B: %', v_tour_id, v_group_b_id;

  -- 3. Obter Opponents do Grupo B
  SELECT id INTO v_opp_fer FROM public.opponents WHERE name ILIKE '%ferrovi_rio%' OR initials = 'FER' LIMIT 1;
  SELECT id INTO v_opp_tec FROM public.opponents WHERE name ILIKE '%t_cnico%' OR name ILIKE '%aeist%' OR initials = 'TEC' LIMIT 1;
  SELECT id INTO v_opp_bcac FROM public.opponents WHERE name ILIKE '%cac_m%' OR name ILIKE '%bola%' OR initials = 'BCAC' LIMIT 1;
  SELECT id INTO v_opp_amo FROM public.opponents WHERE name ILIKE '%amora%' OR initials = 'AMO' LIMIT 1;
  SELECT id INTO v_opp_elis FROM public.opponents WHERE name ILIKE '%estrelas%' OR initials = 'ELIS' LIMIT 1;
  SELECT id INTO v_opp_tor FROM public.opponents WHERE (name ILIKE '%torre%' OR initials = 'TOR') AND name NOT ILIKE '%cascais%' LIMIT 1;

  -- 4. Garantir tournament_teams para cada uma das 7 equipas no Grupo B
  -- Cascais (opponent_id IS NULL)
  SELECT id INTO v_tt_csc FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id IS NULL LIMIT 1;
  IF v_tt_csc IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, NULL) RETURNING id INTO v_tt_csc;
  ELSE
    UPDATE public.tournament_teams SET group_id = COALESCE(group_id, v_group_b_id) WHERE id = v_tt_csc;
  END IF;

  -- Ferroviário
  SELECT id INTO v_tt_fer FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_fer LIMIT 1;
  IF v_tt_fer IS NULL AND v_opp_fer IS NOT NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_fer) RETURNING id INTO v_tt_fer;
  END IF;

  -- Técnico
  SELECT id INTO v_tt_tec FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_tec LIMIT 1;
  IF v_tt_tec IS NULL AND v_opp_tec IS NOT NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_tec) RETURNING id INTO v_tt_tec;
  END IF;

  -- Bola Cacém
  SELECT id INTO v_tt_bcac FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_bcac LIMIT 1;
  IF v_tt_bcac IS NULL AND v_opp_bcac IS NOT NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_bcac) RETURNING id INTO v_tt_bcac;
  END IF;

  -- Amora
  SELECT id INTO v_tt_amo FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_amo LIMIT 1;
  IF v_tt_amo IS NULL AND v_opp_amo IS NOT NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_amo) RETURNING id INTO v_tt_amo;
  END IF;

  -- Estrelas Lisboa
  SELECT id INTO v_tt_elis FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_elis LIMIT 1;
  IF v_tt_elis IS NULL AND v_opp_elis IS NOT NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_elis) RETURNING id INTO v_tt_elis;
  END IF;

  -- Torre
  SELECT id INTO v_tt_tor FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_tor LIMIT 1;
  IF v_tt_tor IS NULL AND v_opp_tor IS NOT NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_tor) RETURNING id INTO v_tt_tor;
  END IF;

  -- --------------------------------------------------------------------------
  -- 5. PROCESSAR OS 21 JOGOS OFICIAIS (JORNADAS 1 A 7)
  -- --------------------------------------------------------------------------

  -- 1ª JORNADA (Isento: Torre)
  -- J1: Ferroviário vs Técnico (11/10/26 18:30)
  inserir_jogo_se_nao_existir(1, v_tt_fer, v_tt_tec, '2026-10-11 18:30:00+01');
  -- J2: Bola Cacém vs Amora (25/10/26 19:00)
  inserir_jogo_se_nao_existir(1, v_tt_bcac, v_tt_amo, '2026-10-25 19:00:00+01');
  -- J3: Estrelas Lisboa vs Cascais (11/10/26 19:30)
  inserir_jogo_se_nao_existir(1, v_tt_elis, v_tt_csc, '2026-10-11 19:30:00+01');

  -- 2ª JORNADA (Isento: Ferroviário)
  -- J5: Técnico vs Bola Cacém (16/10/26 22:15)
  inserir_jogo_se_nao_existir(2, v_tt_tec, v_tt_bcac, '2026-10-16 22:15:00+01');
  -- J7: Amora vs Estrelas Lisboa (17/10/26 18:00)
  inserir_jogo_se_nao_existir(2, v_tt_amo, v_tt_elis, '2026-10-17 18:00:00+01');
  -- J8: Cascais vs Torre (17/10/26 20:00)
  inserir_jogo_se_nao_existir(2, v_tt_csc, v_tt_tor, '2026-10-17 20:00:00+01');

  -- 3ª JORNADA (Isento: Cascais)
  -- J9: Estrelas Lisboa vs Técnico (01/11/26 19:00)
  inserir_jogo_se_nao_existir(3, v_tt_elis, v_tt_tec, '2026-11-01 19:00:00+00');
  -- J10: Bola Cacém vs Ferroviário (01/11/26 19:00)
  inserir_jogo_se_nao_existir(3, v_tt_bcac, v_tt_fer, '2026-11-01 19:00:00+00');
  -- J11: Torre vs Amora (01/11/26 18:30)
  inserir_jogo_se_nao_existir(3, v_tt_tor, v_tt_amo, '2026-11-01 18:30:00+00');

  -- 4ª JORNADA (Isento: Bola Cacém)
  -- J13: Técnico vs Torre (06/11/26 22:15)
  inserir_jogo_se_nao_existir(4, v_tt_tec, v_tt_tor, '2026-11-06 22:15:00+00');
  -- J14: Ferroviário vs Estrelas Lisboa (08/11/26 18:30)
  inserir_jogo_se_nao_existir(4, v_tt_fer, v_tt_elis, '2026-11-08 18:30:00+00');
  -- J16: Amora vs Cascais (07/11/26 18:00)
  inserir_jogo_se_nao_existir(4, v_tt_amo, v_tt_csc, '2026-11-07 18:00:00+00');

  -- 5ª JORNADA (Isento: Amora)
  -- J17: Cascais vs Técnico (21/11/26 20:00)
  inserir_jogo_se_nao_existir(5, v_tt_csc, v_tt_tec, '2026-11-21 20:00:00+00');
  -- J18: Torre vs Ferroviário (22/11/26 18:30)
  inserir_jogo_se_nao_existir(5, v_tt_tor, v_tt_fer, '2026-11-22 18:30:00+00');
  -- J19: Estrelas Lisboa vs Bola Cacém (22/11/26 19:00)
  inserir_jogo_se_nao_existir(5, v_tt_elis, v_tt_bcac, '2026-11-22 19:00:00+00');

  -- 6ª JORNADA (Isento: Estrelas Lisboa)
  -- J21: Técnico vs Amora (27/11/26 22:15)
  inserir_jogo_se_nao_existir(6, v_tt_tec, v_tt_amo, '2026-11-27 22:15:00+00');
  -- J22: Ferroviário vs Cascais (29/11/26 18:30)
  inserir_jogo_se_nao_existir(6, v_tt_fer, v_tt_csc, '2026-11-29 18:30:00+00');
  -- J23: Bola Cacém vs Torre (29/11/26 19:00)
  inserir_jogo_se_nao_existir(6, v_tt_bcac, v_tt_tor, '2026-11-29 19:00:00+00');

  -- 7ª JORNADA (Isento: Técnico)
  -- J26: Amora vs Ferroviário (12/12/26 18:00)
  inserir_jogo_se_nao_existir(7, v_tt_amo, v_tt_fer, '2026-12-12 18:00:00+00');
  -- J27: Cascais vs Bola Cacém (12/12/26 20:00)
  inserir_jogo_se_nao_existir(7, v_tt_csc, v_tt_bcac, '2026-12-12 20:00:00+00');
  -- J28: Torre vs Estrelas Lisboa (13/12/26 18:30)
  inserir_jogo_se_nao_existir(7, v_tt_tor, v_tt_elis, '2026-12-13 18:30:00+00');

  RAISE NOTICE 'Sincronização concluída: % criados, % já existentes mantidos intactos.', v_criados, v_mantidos;
END $$;
