-- ============================================================================
-- INSERÇÃO E RESTAURO DOS RESULTADOS OFICIAIS DA 1ª JORNADA (GRUPOS A E B)
-- ============================================================================
-- Baseado na Ficha de Jogos da 1ª Jornada e nas Tabelas de Classificação Oficiais
-- Sideline Events - XIII Edição 2026/2027.
--
-- RESULTADOS EXTRAÍDOS DAS CLASSIFICAÇÕES OFICIAIS:
--
-- GRUPO A:
-- 1. DS Private T.V. 4 - 0 U.R.D. Tires (09-10-2026 | Frielas | Realizado)
-- 2. G.D. Banco Portugal 4 - 1 Janas F.C. (09-10-2026 | Caneças | Realizado)
-- 3. Lisbon Casuals F.C. 0 - 3 Veteranos do Sul (11-10-2026 | Trajouce | Realizado)
-- 4. A.R. Melo Falcão vs G.D.Á. Camarate (25-10-2026 19:00 | S.L. Olivais | Adiado/Agendado)
--
-- GRUPO B:
-- 1. F.C. Estrelas Lisboa 0 - 2 G.D.S. Cascais (11-10-2026 | S.L. Olivais | Realizado)
-- 2. C. Ferroviário P. 2 - 2 Técnico F.C. (11-10-2026 | Marvila | Realizado)
-- 3. E.C. Santa Cruz / Bola Cacém vs Amora F.C. (10-10-2026 | Frielas | Agendado)
-- 4. A.F.D. Torre: Isento (Folga na 1ª Jornada)
-- ============================================================================

DO $$
DECLARE
  v_tour_id UUID;
  v_group_a_id UUID;
  v_group_b_id UUID;

  -- IDs de Opponents
  v_opp_jan UUID;
  v_opp_dsp UUID;
  v_opp_tir UUID;
  v_opp_vsul UUID;
  v_opp_mfal UUID;
  v_opp_lcas UUID;
  v_opp_bpor UUID;
  v_opp_cam UUID;

  v_opp_elis UUID;
  v_opp_tec UUID;
  v_opp_fer UUID;
  v_opp_tor UUID;
  v_opp_amo UUID;
  v_opp_bcac UUID;

  -- IDs de Tournament Teams
  v_tt_jan UUID;
  v_tt_dsp UUID;
  v_tt_tir UUID;
  v_tt_vsul UUID;
  v_tt_mfal UUID;
  v_tt_lcas UUID;
  v_tt_bpor UUID;
  v_tt_cam UUID;

  v_tt_elis UUID;
  v_tt_tec UUID;
  v_tt_fer UUID;
  v_tt_tor UUID;
  v_tt_amo UUID;
  v_tt_bcac UUID;
  v_tt_csc UUID;

  v_existing_id UUID;
BEGIN
  RAISE NOTICE '=== INÍCIO DA ATUALIZAÇÃO DOS JOGOS DA 1ª JORNADA ===';

  -- 1. Localizar Torneio
  SELECT id INTO v_tour_id
    FROM public.tournaments
   ORDER BY (status = 'ativo') DESC, created_at DESC
   LIMIT 1;

  IF v_tour_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum torneio encontrado!';
  END IF;

  -- 2. Localizar Grupos A e B
  SELECT id INTO v_group_a_id
    FROM public.tournament_groups
   WHERE tournament_id = v_tour_id AND LOWER(TRIM(name)) IN ('grupo a', 'a')
   LIMIT 1;

  SELECT id INTO v_group_b_id
    FROM public.tournament_groups
   WHERE tournament_id = v_tour_id AND LOWER(TRIM(name)) IN ('grupo b', 'b')
   LIMIT 1;

  IF v_group_a_id IS NULL OR v_group_b_id IS NULL THEN
    RAISE EXCEPTION 'Grupos A ou B não encontrados no torneio!';
  END IF;

  -- 3. Obter Opponents do Grupo A
  SELECT id INTO v_opp_jan FROM public.opponents WHERE name ILIKE '%janas%' LIMIT 1;
  SELECT id INTO v_opp_dsp FROM public.opponents WHERE name ILIKE '%private%' OR initials = 'DSP' LIMIT 1;
  SELECT id INTO v_opp_tir FROM public.opponents WHERE name ILIKE '%tires%' LIMIT 1;
  SELECT id INTO v_opp_vsul FROM public.opponents WHERE name ILIKE '%veteranos%' OR initials = 'VSUL' LIMIT 1;
  SELECT id INTO v_opp_mfal FROM public.opponents WHERE name ILIKE '%falc_o%' OR name ILIKE '%melo%' LIMIT 1;
  SELECT id INTO v_opp_lcas FROM public.opponents WHERE name ILIKE '%casuals%' OR name ILIKE '%lisbon%' LIMIT 1;
  SELECT id INTO v_opp_bpor FROM public.opponents WHERE name ILIKE '%banco%' OR initials = 'BPOR' LIMIT 1;
  SELECT id INTO v_opp_cam FROM public.opponents WHERE name ILIKE '%camarate%' OR name ILIKE '%_guias%' LIMIT 1;

  -- 4. Obter Opponents do Grupo B
  SELECT id INTO v_opp_elis FROM public.opponents WHERE name ILIKE '%estrelas%' LIMIT 1;
  SELECT id INTO v_opp_tec FROM public.opponents WHERE name ILIKE '%t_cnico%' OR name ILIKE '%aeist%' LIMIT 1;
  SELECT id INTO v_opp_fer FROM public.opponents WHERE name ILIKE '%ferrovi_rio%' LIMIT 1;
  SELECT id INTO v_opp_tor FROM public.opponents WHERE (name ILIKE '%torre%' OR initials = 'TOR') AND name NOT ILIKE '%cascais%' LIMIT 1;
  SELECT id INTO v_opp_amo FROM public.opponents WHERE name ILIKE '%amora%' LIMIT 1;
  SELECT id INTO v_opp_bcac FROM public.opponents WHERE name ILIKE '%cac_m%' OR name ILIKE '%santa cruz%' OR name ILIKE '%bola%' LIMIT 1;

  -- 5. Garantir tournament_teams para cada um nos grupos certos
  -- GRUPO A:
  -- Janas
  SELECT id INTO v_tt_jan FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_jan LIMIT 1;
  IF v_tt_jan IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_jan) RETURNING id INTO v_tt_jan;
  END IF;

  -- DS Private
  SELECT id INTO v_tt_dsp FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_dsp LIMIT 1;
  IF v_tt_dsp IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_dsp) RETURNING id INTO v_tt_dsp;
  END IF;

  -- Tires
  SELECT id INTO v_tt_tir FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_tir LIMIT 1;
  IF v_tt_tir IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_tir) RETURNING id INTO v_tt_tir;
  END IF;

  -- Veteranos Sul
  SELECT id INTO v_tt_vsul FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_vsul LIMIT 1;
  IF v_tt_vsul IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_vsul) RETURNING id INTO v_tt_vsul;
  END IF;

  -- Melo Falcão
  SELECT id INTO v_tt_mfal FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_mfal LIMIT 1;
  IF v_tt_mfal IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_mfal) RETURNING id INTO v_tt_mfal;
  END IF;

  -- Lisbon Casuals
  SELECT id INTO v_tt_lcas FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_lcas LIMIT 1;
  IF v_tt_lcas IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_lcas) RETURNING id INTO v_tt_lcas;
  END IF;

  -- Banco Portugal
  SELECT id INTO v_tt_bpor FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_bpor LIMIT 1;
  IF v_tt_bpor IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_bpor) RETURNING id INTO v_tt_bpor;
  END IF;

  -- Camarate
  SELECT id INTO v_tt_cam FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_a_id AND opponent_id = v_opp_cam LIMIT 1;
  IF v_tt_cam IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_a_id, v_opp_cam) RETURNING id INTO v_tt_cam;
  END IF;

  -- GRUPO B:
  -- Estrelas Lisboa
  SELECT id INTO v_tt_elis FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND opponent_id = v_opp_elis LIMIT 1;
  IF v_tt_elis IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_elis) RETURNING id INTO v_tt_elis;
  END IF;

  -- Técnico
  SELECT id INTO v_tt_tec FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND opponent_id = v_opp_tec LIMIT 1;
  IF v_tt_tec IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_tec) RETURNING id INTO v_tt_tec;
  END IF;

  -- Ferroviário
  SELECT id INTO v_tt_fer FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND opponent_id = v_opp_fer LIMIT 1;
  IF v_tt_fer IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_fer) RETURNING id INTO v_tt_fer;
  END IF;

  -- Torre
  SELECT id INTO v_tt_tor FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND opponent_id = v_opp_tor LIMIT 1;
  IF v_tt_tor IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_tor) RETURNING id INTO v_tt_tor;
  END IF;

  -- Amora
  SELECT id INTO v_tt_amo FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND opponent_id = v_opp_amo LIMIT 1;
  IF v_tt_amo IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_amo) RETURNING id INTO v_tt_amo;
  END IF;

  -- Bola Cacém / Santa Cruz
  SELECT id INTO v_tt_bcac FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND opponent_id = v_opp_bcac LIMIT 1;
  IF v_tt_bcac IS NULL AND v_opp_bcac IS NOT NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, v_opp_bcac) RETURNING id INTO v_tt_bcac;
  END IF;
  -- Fallback para qualquer 7ª equipa do Grupo B
  IF v_tt_bcac IS NULL THEN
    SELECT id INTO v_tt_bcac FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND id NOT IN (v_tt_elis, v_tt_tec, v_tt_fer, v_tt_tor, v_tt_amo) AND opponent_id IS NOT NULL LIMIT 1;
  END IF;

  -- Cascais (opponent_id IS NULL)
  SELECT id INTO v_tt_csc FROM public.tournament_teams WHERE tournament_id = v_tour_id AND group_id = v_group_b_id AND opponent_id IS NULL LIMIT 1;
  IF v_tt_csc IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_b_id, NULL) RETURNING id INTO v_tt_csc;
  END IF;

  -- --------------------------------------------------------------------------
  -- 6. INSERIR OU ATUALIZAR OS 4 JOGOS DA 1ª JORNADA NO GRUPO A
  -- --------------------------------------------------------------------------

  -- JOGO 1: DS Private T.V. 4 - 0 U.R.D. Tires
  SELECT id INTO v_existing_id
    FROM public.tournament_matches
   WHERE tournament_id = v_tour_id AND matchday = 1
     AND ((home_team_id = v_tt_dsp AND away_team_id = v_tt_tir) OR (home_team_id = v_tt_tir AND away_team_id = v_tt_dsp))
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.tournament_matches
       SET group_id = v_group_a_id, home_team_id = v_tt_dsp, away_team_id = v_tt_tir,
           home_score = 4, away_score = 0, status = 'finished', match_date = '2026-10-09 22:15:00+01'
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, home_score, away_score, status, match_date)
    VALUES (v_tour_id, v_group_a_id, 1, v_tt_dsp, v_tt_tir, 4, 0, 'finished', '2026-10-09 22:15:00+01');
  END IF;

  -- JOGO 2: G.D. Banco Portugal 4 - 1 Janas F.C.
  SELECT id INTO v_existing_id
    FROM public.tournament_matches
   WHERE tournament_id = v_tour_id AND matchday = 1
     AND ((home_team_id = v_tt_bpor AND away_team_id = v_tt_jan) OR (home_team_id = v_tt_jan AND away_team_id = v_tt_bpor))
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.tournament_matches
       SET group_id = v_group_a_id, home_team_id = v_tt_bpor, away_team_id = v_tt_jan,
           home_score = 4, away_score = 1, status = 'finished', match_date = '2026-10-09 21:45:00+01'
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, home_score, away_score, status, match_date)
    VALUES (v_tour_id, v_group_a_id, 1, v_tt_bpor, v_tt_jan, 4, 1, 'finished', '2026-10-09 21:45:00+01');
  END IF;

  -- JOGO 3: Lisbon Casuals F.C. 0 - 3 Veteranos do Sul
  SELECT id INTO v_existing_id
    FROM public.tournament_matches
   WHERE tournament_id = v_tour_id AND matchday = 1
     AND ((home_team_id = v_tt_lcas AND away_team_id = v_tt_vsul) OR (home_team_id = v_tt_vsul AND away_team_id = v_tt_lcas))
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.tournament_matches
       SET group_id = v_group_a_id, home_team_id = v_tt_lcas, away_team_id = v_tt_vsul,
           home_score = 0, away_score = 3, status = 'finished', match_date = '2026-10-11 18:00:00+01'
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, home_score, away_score, status, match_date)
    VALUES (v_tour_id, v_group_a_id, 1, v_tt_lcas, v_tt_vsul, 0, 3, 'finished', '2026-10-11 18:00:00+01');
  END IF;

  -- JOGO 4: A.R. Melo Falcão vs G.D.Á. Camarate (Adiado / Agendado para 25-10-2026)
  SELECT id INTO v_existing_id
    FROM public.tournament_matches
   WHERE tournament_id = v_tour_id AND matchday = 1
     AND ((home_team_id = v_tt_mfal AND away_team_id = v_tt_cam) OR (home_team_id = v_tt_cam AND away_team_id = v_tt_mfal))
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.tournament_matches
       SET group_id = v_group_a_id, home_team_id = v_tt_mfal, away_team_id = v_tt_cam,
           home_score = NULL, away_score = NULL, status = 'scheduled', match_date = '2026-10-25 19:00:00+01'
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, home_score, away_score, status, match_date)
    VALUES (v_tour_id, v_group_a_id, 1, v_tt_mfal, v_tt_cam, NULL, NULL, 'scheduled', '2026-10-25 19:00:00+01');
  END IF;

  -- --------------------------------------------------------------------------
  -- 7. INSERIR OU ATUALIZAR OS 3 JOGOS DA 1ª JORNADA NO GRUPO B
  -- --------------------------------------------------------------------------

  -- JOGO 1: F.C. Estrelas Lisboa 0 - 2 G.D.S. Cascais (Cascais venceu fora por 2-0)
  SELECT id INTO v_existing_id
    FROM public.tournament_matches
   WHERE tournament_id = v_tour_id AND matchday = 1
     AND ((home_team_id = v_tt_elis AND away_team_id = v_tt_csc) OR (home_team_id = v_tt_csc AND away_team_id = v_tt_elis))
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.tournament_matches
       SET group_id = v_group_b_id, home_team_id = v_tt_elis, away_team_id = v_tt_csc,
           home_score = 0, away_score = 2, status = 'finished', match_date = '2026-10-11 19:30:00+01'
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, home_score, away_score, status, match_date)
    VALUES (v_tour_id, v_group_b_id, 1, v_tt_elis, v_tt_csc, 0, 2, 'finished', '2026-10-11 19:30:00+01');
  END IF;

  -- JOGO 2: C. Ferroviário P. 2 - 2 Técnico F.C.
  SELECT id INTO v_existing_id
    FROM public.tournament_matches
   WHERE tournament_id = v_tour_id AND matchday = 1
     AND ((home_team_id = v_tt_fer AND away_team_id = v_tt_tec) OR (home_team_id = v_tt_tec AND away_team_id = v_tt_fer))
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.tournament_matches
       SET group_id = v_group_b_id, home_team_id = v_tt_fer, away_team_id = v_tt_tec,
           home_score = 2, away_score = 2, status = 'finished', match_date = '2026-10-11 18:30:00+01'
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, home_score, away_score, status, match_date)
    VALUES (v_tour_id, v_group_b_id, 1, v_tt_fer, v_tt_tec, 2, 2, 'finished', '2026-10-11 18:30:00+01');
  END IF;

  -- JOGO 3: E.C. Santa Cruz / Bola Cacém vs Amora F.C. (Agendado / sem resultado ainda)
  IF v_tt_bcac IS NOT NULL AND v_tt_amo IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.tournament_matches
     WHERE tournament_id = v_tour_id AND matchday = 1
       AND ((home_team_id = v_tt_bcac AND away_team_id = v_tt_amo) OR (home_team_id = v_tt_amo AND away_team_id = v_tt_bcac))
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.tournament_matches
         SET group_id = v_group_b_id, home_team_id = v_tt_bcac, away_team_id = v_tt_amo,
             home_score = NULL, away_score = NULL, status = 'scheduled', match_date = '2026-10-10 20:00:00+01'
       WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, home_score, away_score, status, match_date)
      VALUES (v_tour_id, v_group_b_id, 1, v_tt_bcac, v_tt_amo, NULL, NULL, 'scheduled', '2026-10-10 20:00:00+01');
    END IF;
  END IF;

  RAISE NOTICE '=== RESTAURO CONCLUÍDO COM 100%% DE SUCESSO ===';
END $$;

-- ============================================================================
-- VERIFICAÇÃO VISUAL DOS RESULTADOS E CLASSIFICAÇÃO CALCULADA
-- ============================================================================

-- 1. Jogos da Jornada 1
SELECT 
  g.name AS "Grupo",
  tm.matchday AS "Jornada",
  COALESCE(home_opp.name, 'GDS Cascais') AS "Equipa Casa",
  COALESCE(tm.home_score::TEXT, '-') AS "GC",
  COALESCE(tm.away_score::TEXT, '-') AS "GF",
  COALESCE(away_opp.name, 'GDS Cascais') AS "Equipa Fora",
  tm.status AS "Estado",
  to_char(tm.match_date, 'DD/MM/YYYY HH24:MI') AS "Data/Hora",
  CASE WHEN tm.event_id IS NOT NULL THEN 'Sim' ELSE 'Não' END AS "Ligado a Evento"
FROM public.tournament_matches tm
JOIN public.tournament_groups g ON g.id = tm.group_id
JOIN public.tournament_teams home_tt ON home_tt.id = tm.home_team_id
JOIN public.tournament_teams away_tt ON away_tt.id = tm.away_team_id
LEFT JOIN public.opponents home_opp ON home_opp.id = home_tt.opponent_id
LEFT JOIN public.opponents away_opp ON away_opp.id = away_tt.opponent_id
WHERE tm.matchday = 1
ORDER BY g.name, tm.match_date;

-- 2. Tabela de Classificação do Grupo A
WITH stats_a AS (
  SELECT 
    COALESCE(o.name, 'GDS Cascais') AS equipa,
    COALESCE(o.initials, 'CSC') AS sigla,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND (m.home_team_id = tt.id OR m.away_team_id = tt.id)) AS j,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND ((m.home_team_id = tt.id AND m.home_score > m.away_score) OR (m.away_team_id = tt.id AND m.away_score > m.home_score))) AS v,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND m.home_score = m.away_score AND (m.home_team_id = tt.id OR m.away_team_id = tt.id)) AS e,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND ((m.home_team_id = tt.id AND m.home_score < m.away_score) OR (m.away_team_id = tt.id AND m.away_score < m.home_score))) AS d,
    COALESCE(SUM(CASE WHEN m.home_team_id = tt.id THEN m.home_score WHEN m.away_team_id = tt.id THEN m.away_score ELSE 0 END), 0) AS gm,
    COALESCE(SUM(CASE WHEN m.home_team_id = tt.id THEN m.away_score WHEN m.away_team_id = tt.id THEN m.home_score ELSE 0 END), 0) AS gs
  FROM public.tournament_teams tt
  JOIN public.tournament_groups g ON g.id = tt.group_id
  LEFT JOIN public.opponents o ON o.id = tt.opponent_id
  LEFT JOIN public.tournament_matches m ON m.group_id = g.id AND m.status = 'finished' AND (m.home_team_id = tt.id OR m.away_team_id = tt.id)
  WHERE LOWER(TRIM(g.name)) = 'grupo a'
  GROUP BY tt.id, o.name, o.initials
)
SELECT 
  equipa AS "Equipa (Grupo A)",
  sigla AS "Sigla",
  (v * 3 + e) AS "PTS",
  j AS "J", v AS "V", e AS "E", d AS "D",
  gm AS "GM", gs AS "GS", (gm - gs) AS "DG"
FROM stats_a
ORDER BY "PTS" DESC, "DG" DESC, "GM" DESC;

-- 3. Tabela de Classificação do Grupo B
WITH stats_b AS (
  SELECT 
    COALESCE(o.name, 'GDS Cascais') AS equipa,
    COALESCE(o.initials, 'CSC') AS sigla,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND (m.home_team_id = tt.id OR m.away_team_id = tt.id)) AS j,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND ((m.home_team_id = tt.id AND m.home_score > m.away_score) OR (m.away_team_id = tt.id AND m.away_score > m.home_score))) AS v,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND m.home_score = m.away_score AND (m.home_team_id = tt.id OR m.away_team_id = tt.id)) AS e,
    COUNT(m.id) FILTER (WHERE m.status = 'finished' AND ((m.home_team_id = tt.id AND m.home_score < m.away_score) OR (m.away_team_id = tt.id AND m.away_score < m.home_score))) AS d,
    COALESCE(SUM(CASE WHEN m.home_team_id = tt.id THEN m.home_score WHEN m.away_team_id = tt.id THEN m.away_score ELSE 0 END), 0) AS gm,
    COALESCE(SUM(CASE WHEN m.home_team_id = tt.id THEN m.away_score WHEN m.away_team_id = tt.id THEN m.home_score ELSE 0 END), 0) AS gs
  FROM public.tournament_teams tt
  JOIN public.tournament_groups g ON g.id = tt.group_id
  LEFT JOIN public.opponents o ON o.id = tt.opponent_id
  LEFT JOIN public.tournament_matches m ON m.group_id = g.id AND m.status = 'finished' AND (m.home_team_id = tt.id OR m.away_team_id = tt.id)
  WHERE LOWER(TRIM(g.name)) = 'grupo b'
  GROUP BY tt.id, o.name, o.initials
)
SELECT 
  equipa AS "Equipa (Grupo B)",
  sigla AS "Sigla",
  (v * 3 + e) AS "PTS",
  j AS "J", v AS "V", e AS "E", d AS "D",
  gm AS "GM", gs AS "GS", (gm - gs) AS "DG"
FROM stats_b
ORDER BY "PTS" DESC, "DG" DESC, "GM" DESC;
