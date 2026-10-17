-- ============================================================================
-- INSERÇÃO / RESTAURO DEFINITIVO DOS JOGOS DA 1ª JORNADA (GRUPOS A E B)
-- ============================================================================
-- Como os jogos manuais das outras equipas foram eliminados por efeito de
-- cascata (ON DELETE CASCADE) ao atualizar as equipas anteriores, este script
-- insere os confrontos oficiais da 1ª Jornada diretamente no Grupo A e Grupo B.
--
-- Se tiveres os placares exatos, podes ajustar os números de golos abaixo.
-- ============================================================================

DO $$
DECLARE
  v_tour_id UUID;
  v_group_a_id UUID;
  v_group_b_id UUID;

  -- IDs das equipas do Grupo A
  v_janas UUID;
  v_dsp UUID;
  v_tires UUID;
  v_vsul UUID;
  v_mfal UUID;
  v_lcas UUID;
  v_bpor UUID;
  v_cam UUID;

  -- IDs das equipas do Grupo B
  v_elis UUID;
  v_tec UUID;
  v_fer UUID;
  v_tor UUID;
  v_bcac UUID;
  v_amo UUID;
  v_csc UUID;

BEGIN
  RAISE NOTICE '=== INÍCIO DA INSERÇÃO DOS JOGOS DA 1ª JORNADA ===';

  -- 1. Torneio Ativo
  SELECT id INTO v_tour_id
    FROM public.tournaments
   ORDER BY (status = 'ativo') DESC, created_at DESC
   LIMIT 1;

  IF v_tour_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum torneio encontrado!';
  END IF;

  -- 2. Grupos A e B
  SELECT id INTO v_group_a_id
    FROM public.tournament_groups
   WHERE tournament_id = v_tour_id AND LOWER(TRIM(name)) IN ('grupo a', 'a')
   LIMIT 1;

  SELECT id INTO v_group_b_id
    FROM public.tournament_groups
   WHERE tournament_id = v_tour_id AND LOWER(TRIM(name)) IN ('grupo b', 'b')
   LIMIT 1;

  -- 3. Obter IDs das Equipas do Grupo A
  SELECT tt.id INTO v_janas FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND o.name ILIKE '%janas%' LIMIT 1;
  SELECT tt.id INTO v_dsp   FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND (o.name ILIKE '%private%' OR o.initials = 'DSP') LIMIT 1;
  SELECT tt.id INTO v_tires FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND o.name ILIKE '%tires%' LIMIT 1;
  SELECT tt.id INTO v_vsul  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND (o.name ILIKE '%veteranos%' OR o.initials = 'VSUL') LIMIT 1;
  SELECT tt.id INTO v_mfal  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND (o.name ILIKE '%falc_o%' OR o.name ILIKE '%melo%') LIMIT 1;
  SELECT tt.id INTO v_lcas  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND (o.name ILIKE '%casuals%' OR o.name ILIKE '%lisbon%') LIMIT 1;
  SELECT tt.id INTO v_bpor  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND (o.name ILIKE '%banco%' OR o.initials = 'BPOR') LIMIT 1;
  SELECT tt.id INTO v_cam   FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_a_id AND (o.name ILIKE '%camarate%' OR o.name ILIKE '%_guias%') LIMIT 1;

  -- 4. Obter IDs das Equipas do Grupo B
  SELECT tt.id INTO v_elis FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_b_id AND o.name ILIKE '%estrelas%' LIMIT 1;
  SELECT tt.id INTO v_tec  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_b_id AND (o.name ILIKE '%t_cnico%' OR o.name ILIKE '%aeist%') LIMIT 1;
  SELECT tt.id INTO v_fer  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_b_id AND o.name ILIKE '%ferrovi_rio%' LIMIT 1;
  SELECT tt.id INTO v_tor  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_b_id AND (o.name ILIKE '%torre%' OR o.initials = 'TOR') LIMIT 1;
  SELECT tt.id INTO v_bcac FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_b_id AND (o.name ILIKE '%cac_m%' OR o.name ILIKE '%bola%') LIMIT 1;
  SELECT tt.id INTO v_amo  FROM public.tournament_teams tt JOIN public.opponents o ON o.id = tt.opponent_id WHERE tt.group_id = v_group_b_id AND o.name ILIKE '%amora%' LIMIT 1;
  SELECT tt.id INTO v_csc  FROM public.tournament_teams tt WHERE tt.tournament_id = v_tour_id AND tt.group_id = v_group_b_id AND tt.opponent_id IS NULL LIMIT 1;

  RAISE NOTICE 'Equipas Grupo A: Janas %, DSP %, Tires %, VSul %, MFal %, LCas %, BPor %, Cam %', 
    v_janas, v_dsp, v_tires, v_vsul, v_mfal, v_lcas, v_bpor, v_cam;
  RAISE NOTICE 'Equipas Grupo B: ELis %, Tec %, Fer %, Tor %, BCac %, Amo %, CSC %', 
    v_elis, v_tec, v_fer, v_tor, v_bcac, v_amo, v_csc;

  -- --------------------------------------------------------------------------
  -- 5. ASSEGURAR OU CRIAR JOGOS DA 1ª JORNADA NO GRUPO A
  -- --------------------------------------------------------------------------
  -- NOTA: Podes ajustar quem jogou com quem e o resultado (home_score, away_score)
  
  -- Jogo 1 Grupo A: Janas vs Camarate
  IF v_janas IS NOT NULL AND v_cam IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_tour_id AND matchday = 1 AND group_id = v_group_a_id AND (home_team_id = v_janas OR away_team_id = v_janas)
  ) THEN
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, status)
    VALUES (v_tour_id, v_group_a_id, 1, v_janas, v_cam, 'scheduled');
  END IF;

  -- Jogo 2 Grupo A: Tires vs DS Private TV
  IF v_tires IS NOT NULL AND v_dsp IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_tour_id AND matchday = 1 AND group_id = v_group_a_id AND (home_team_id = v_tires OR away_team_id = v_tires)
  ) THEN
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, status)
    VALUES (v_tour_id, v_group_a_id, 1, v_tires, v_dsp, 'scheduled');
  END IF;

  -- Jogo 3 Grupo A: Veteranos Sul vs Banco Portugal
  IF v_vsul IS NOT NULL AND v_bpor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_tour_id AND matchday = 1 AND group_id = v_group_a_id AND (home_team_id = v_vsul OR away_team_id = v_vsul)
  ) THEN
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, status)
    VALUES (v_tour_id, v_group_a_id, 1, v_vsul, v_bpor, 'scheduled');
  END IF;

  -- Jogo 4 Grupo A: Melo Falcão vs Lisbon Casuals
  IF v_mfal IS NOT NULL AND v_lcas IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_tour_id AND matchday = 1 AND group_id = v_group_a_id AND (home_team_id = v_mfal OR away_team_id = v_mfal)
  ) THEN
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, status)
    VALUES (v_tour_id, v_group_a_id, 1, v_mfal, v_lcas, 'scheduled');
  END IF;

  -- --------------------------------------------------------------------------
  -- 6. ASSEGURAR OU CRIAR JOGOS RESTANTES DA 1ª JORNADA NO GRUPO B
  -- --------------------------------------------------------------------------
  -- O jogo do Cascais já se encontra inserido a partir de public.events.
  -- Criamos os outros 2 confrontos entre as restantes equipas do Grupo B:

  -- Jogo 1 Grupo B (outras equipas): Torre vs Estrelas Lisboa
  IF v_tor IS NOT NULL AND v_elis IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_tour_id AND matchday = 1 AND group_id = v_group_b_id AND (home_team_id = v_tor OR away_team_id = v_tor)
  ) THEN
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, status)
    VALUES (v_tour_id, v_group_b_id, 1, v_tor, v_elis, 'scheduled');
  END IF;

  -- Jogo 2 Grupo B (outras equipas): Técnico vs Ferroviário
  IF v_tec IS NOT NULL AND v_fer IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_tour_id AND matchday = 1 AND group_id = v_group_b_id AND (home_team_id = v_tec OR away_team_id = v_tec)
  ) THEN
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, status)
    VALUES (v_tour_id, v_group_b_id, 1, v_tec, v_fer, 'scheduled');
  END IF;

  RAISE NOTICE '=== JOGOS DA 1ª JORNADA INSERIDOS/ATUALIZADOS COM SUCESSO ===';
END $$;

-- Consulta de verificação de todos os jogos da Jornada 1
SELECT 
  g.name AS "Grupo",
  tm.matchday AS "Jornada",
  COALESCE(home_opp.name, 'GDS Cascais') AS "Equipa Casa",
  COALESCE(tm.home_score::TEXT, '-') AS "GC",
  COALESCE(tm.away_score::TEXT, '-') AS "GF",
  COALESCE(away_opp.name, 'GDS Cascais') AS "Equipa Fora",
  tm.status AS "Estado",
  tm.match_date AS "Data",
  CASE WHEN tm.event_id IS NOT NULL THEN 'Sim (Cascais)' ELSE 'Outras Equipas' END AS "Origem"
FROM public.tournament_matches tm
JOIN public.tournament_groups g ON g.id = tm.group_id
JOIN public.tournament_teams home_tt ON home_tt.id = tm.home_team_id
JOIN public.tournament_teams away_tt ON away_tt.id = tm.away_team_id
LEFT JOIN public.opponents home_opp ON home_opp.id = home_tt.opponent_id
LEFT JOIN public.opponents away_opp ON away_opp.id = away_tt.opponent_id
WHERE tm.matchday = 1
ORDER BY g.name, tm.created_at;
