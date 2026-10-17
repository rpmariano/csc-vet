-- ============================================================================
-- RECUPERAÇÃO E REALINHAMENTO TOTAL DOS JOGOS DA 1ª JORNADA E DEMAIS JORNADAS
-- ============================================================================
-- Este script localiza todos os jogos em public.tournament_matches (mesmo os que
-- ficaram associados a equipas antigas ou ao grupo antigo antes da divisão
-- em Grupo A e Grupo B) e religa-os às equipas oficiais do Grupo A e Grupo B.
-- ============================================================================

DO $$
DECLARE
  v_tour_id UUID;
  v_group_a_id UUID;
  v_group_b_id UUID;
  r RECORD;
  v_new_home_id UUID;
  v_new_away_id UUID;
  v_new_group_id UUID;
  v_relinked_matches INT := 0;
  v_teams_merged INT := 0;
BEGIN
  RAISE NOTICE '=== INÍCIO DA RECUPERAÇÃO DOS RESULTADOS ===';

  -- 1. Obter o Torneio Principal (Sideline / Liga Masters +35)
  SELECT id INTO v_tour_id
    FROM public.tournaments
   ORDER BY (status = 'ativo') DESC, created_at DESC
   LIMIT 1;

  IF v_tour_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum torneio encontrado!';
  END IF;

  -- 2. Obter IDs dos Grupos Atuais (Grupo A e Grupo B)
  SELECT id INTO v_group_a_id
    FROM public.tournament_groups
   WHERE tournament_id = v_tour_id AND LOWER(TRIM(name)) IN ('grupo a', 'a')
   LIMIT 1;

  SELECT id INTO v_group_b_id
    FROM public.tournament_groups
   WHERE tournament_id = v_tour_id AND LOWER(TRIM(name)) IN ('grupo b', 'b')
   LIMIT 1;

  RAISE NOTICE 'Torneio ID: % | Grupo A: % | Grupo B: %', v_tour_id, v_group_a_id, v_group_b_id;

  -- 3. PERCORRER TODOS OS JOGOS REGISTADOS EM tournament_matches
  -- E RELIGÁ-LOS ÀS EQUIPAS CANÓNICAS DO GRUPO A E GRUPO B
  FOR r IN
    SELECT 
      tm.id AS match_id,
      tm.matchday,
      tm.home_score,
      tm.away_score,
      tm.status,
      tm.group_id AS old_group_id,
      tm.home_team_id AS old_home_tt_id,
      tm.away_team_id AS old_away_tt_id,
      -- Informação do adversário da casa original
      tt_h.opponent_id AS h_opp_id,
      opp_h.name AS h_opp_name,
      opp_h.initials AS h_opp_sigla,
      -- Informação do adversário visitante original
      tt_a.opponent_id AS a_opp_id,
      opp_a.name AS a_opp_name,
      opp_a.initials AS a_opp_sigla
    FROM public.tournament_matches tm
    LEFT JOIN public.tournament_teams tt_h ON tt_h.id = tm.home_team_id
    LEFT JOIN public.opponents opp_h ON opp_h.id = tt_h.opponent_id
    LEFT JOIN public.tournament_teams tt_a ON tt_a.id = tm.away_team_id
    LEFT JOIN public.opponents opp_a ON opp_a.id = tt_a.opponent_id
    WHERE tm.tournament_id = v_tour_id
  LOOP
    v_new_home_id := NULL;
    v_new_away_id := NULL;
    v_new_group_id := NULL;

    -- A. Identificar a equipa canónica da CASA no Grupo A ou Grupo B
    IF r.h_opp_id IS NULL AND (r.h_opp_name IS NULL OR r.h_opp_name ILIKE '%cascais%') THEN
      SELECT id, group_id INTO v_new_home_id, v_new_group_id
        FROM public.tournament_teams
       WHERE tournament_id = v_tour_id AND opponent_id IS NULL
       LIMIT 1;
    ELSE
      SELECT tt.id, tt.group_id INTO v_new_home_id, v_new_group_id
        FROM public.tournament_teams tt
        JOIN public.opponents o ON o.id = tt.opponent_id
       WHERE tt.tournament_id = v_tour_id
         AND tt.group_id IN (v_group_a_id, v_group_b_id)
         AND (
           o.id = r.h_opp_id
           OR LOWER(TRIM(o.name)) = LOWER(TRIM(r.h_opp_name))
           OR (r.h_opp_sigla IS NOT NULL AND o.initials = r.h_opp_sigla)
           OR (r.h_opp_name ILIKE '%' || o.name || '%')
           OR (o.name ILIKE '%' || r.h_opp_name || '%')
           -- Casos específicos de nomes
           OR (r.h_opp_name ILIKE '%janas%' AND o.name ILIKE '%janas%')
           OR (r.h_opp_name ILIKE '%private%' AND o.name ILIKE '%private%')
           OR (r.h_opp_name ILIKE '%tires%' AND o.name ILIKE '%tires%')
           OR (r.h_opp_name ILIKE '%frielas%' AND o.name ILIKE '%veteranos%')
           OR (r.h_opp_name ILIKE '%veteranos%' AND o.name ILIKE '%veteranos%')
           OR (r.h_opp_name ILIKE '%falc_o%' AND o.name ILIKE '%falc_o%')
           OR (r.h_opp_name ILIKE '%melo%' AND o.name ILIKE '%falc_o%')
           OR (r.h_opp_name ILIKE '%casuals%' AND o.name ILIKE '%casuals%')
           OR (r.h_opp_name ILIKE '%trajouce%' AND o.name ILIKE '%casuals%')
           OR (r.h_opp_name ILIKE '%banco%' AND o.name ILIKE '%banco%')
           OR (r.h_opp_name ILIKE '%camarate%' AND o.name ILIKE '%camarate%')
           OR (r.h_opp_name ILIKE '%_guias%' AND o.name ILIKE '%camarate%')
           OR (r.h_opp_name ILIKE '%estrelas%' AND o.name ILIKE '%estrelas%')
           OR (r.h_opp_name ILIKE '%t_cnico%' AND o.name ILIKE '%t_cnico%')
           OR (r.h_opp_name ILIKE '%aeist%' AND o.name ILIKE '%t_cnico%')
           OR (r.h_opp_name ILIKE '%ferrovi_rio%' AND o.name ILIKE '%ferrovi_rio%')
           OR (r.h_opp_name ILIKE '%torre%' AND o.name ILIKE '%torre%')
           OR (r.h_opp_name ILIKE '%cac_m%' AND o.name ILIKE '%cac_m%')
           OR (r.h_opp_name ILIKE '%agualva%' AND o.name ILIKE '%cac_m%')
           OR (r.h_opp_name ILIKE '%amora%' AND o.name ILIKE '%amora%')
         )
       LIMIT 1;
    END IF;

    -- B. Identificar a equipa canónica VISITANTE no Grupo A ou Grupo B
    IF r.a_opp_id IS NULL AND (r.a_opp_name IS NULL OR r.a_opp_name ILIKE '%cascais%') THEN
      SELECT id, group_id INTO v_new_away_id, v_new_group_id
        FROM public.tournament_teams
       WHERE tournament_id = v_tour_id AND opponent_id IS NULL
       LIMIT 1;
    ELSE
      SELECT tt.id, tt.group_id INTO v_new_away_id, v_new_group_id
        FROM public.tournament_teams tt
        JOIN public.opponents o ON o.id = tt.opponent_id
       WHERE tt.tournament_id = v_tour_id
         AND tt.group_id IN (v_group_a_id, v_group_b_id)
         AND (
           o.id = r.a_opp_id
           OR LOWER(TRIM(o.name)) = LOWER(TRIM(r.a_opp_name))
           OR (r.a_opp_sigla IS NOT NULL AND o.initials = r.a_opp_sigla)
           OR (r.a_opp_name ILIKE '%' || o.name || '%')
           OR (o.name ILIKE '%' || r.a_opp_name || '%')
           -- Casos específicos de nomes
           OR (r.a_opp_name ILIKE '%janas%' AND o.name ILIKE '%janas%')
           OR (r.a_opp_name ILIKE '%private%' AND o.name ILIKE '%private%')
           OR (r.a_opp_name ILIKE '%tires%' AND o.name ILIKE '%tires%')
           OR (r.a_opp_name ILIKE '%frielas%' AND o.name ILIKE '%veteranos%')
           OR (r.a_opp_name ILIKE '%veteranos%' AND o.name ILIKE '%veteranos%')
           OR (r.a_opp_name ILIKE '%falc_o%' AND o.name ILIKE '%falc_o%')
           OR (r.a_opp_name ILIKE '%melo%' AND o.name ILIKE '%falc_o%')
           OR (r.a_opp_name ILIKE '%casuals%' AND o.name ILIKE '%casuals%')
           OR (r.a_opp_name ILIKE '%trajouce%' AND o.name ILIKE '%casuals%')
           OR (r.a_opp_name ILIKE '%banco%' AND o.name ILIKE '%banco%')
           OR (r.a_opp_name ILIKE '%camarate%' AND o.name ILIKE '%camarate%')
           OR (r.a_opp_name ILIKE '%_guias%' AND o.name ILIKE '%camarate%')
           OR (r.a_opp_name ILIKE '%estrelas%' AND o.name ILIKE '%estrelas%')
           OR (r.a_opp_name ILIKE '%t_cnico%' AND o.name ILIKE '%t_cnico%')
           OR (r.a_opp_name ILIKE '%aeist%' AND o.name ILIKE '%t_cnico%')
           OR (r.a_opp_name ILIKE '%ferrovi_rio%' AND o.name ILIKE '%ferrovi_rio%')
           OR (r.a_opp_name ILIKE '%torre%' AND o.name ILIKE '%torre%')
           OR (r.a_opp_name ILIKE '%cac_m%' AND o.name ILIKE '%cac_m%')
           OR (r.a_opp_name ILIKE '%agualva%' AND o.name ILIKE '%cac_m%')
           OR (r.a_opp_name ILIKE '%amora%' AND o.name ILIKE '%amora%')
         )
       LIMIT 1;
    END IF;

    -- Se encontrámos ambas as equipas canónicas:
    IF v_new_home_id IS NOT NULL AND v_new_away_id IS NOT NULL THEN
      -- Determinar o grupo correto
      SELECT group_id INTO v_new_group_id FROM public.tournament_teams WHERE id = v_new_home_id;
      IF v_new_group_id IS NULL THEN
        SELECT group_id INTO v_new_group_id FROM public.tournament_teams WHERE id = v_new_away_id;
      END IF;

      UPDATE public.tournament_matches
         SET home_team_id = v_new_home_id,
             away_team_id = v_new_away_id,
             group_id = v_new_group_id,
             status = CASE 
               WHEN (home_score IS NOT NULL AND away_score IS NOT NULL) THEN 'finished'
               ELSE status
             END
       WHERE id = r.match_id;

      v_relinked_matches := v_relinked_matches + 1;
    ELSE
      -- Caso não tenha encontrado equipa canónica, mas o jogo tem equipas no tournament_teams
      -- Tentar pelo menos atribuir o group_id da equipa da casa
      IF r.old_home_tt_id IS NOT NULL THEN
        SELECT group_id INTO v_new_group_id FROM public.tournament_teams WHERE id = r.old_home_tt_id;
        IF v_new_group_id IS NOT NULL AND v_new_group_id <> r.old_group_id THEN
          UPDATE public.tournament_matches
             SET group_id = v_new_group_id,
                 status = CASE 
                   WHEN (home_score IS NOT NULL AND away_score IS NOT NULL) THEN 'finished'
                   ELSE status
                 END
           WHERE id = r.match_id;
          v_relinked_matches := v_relinked_matches + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Total de jogos religados e atualizados: %', v_relinked_matches;

  -- 4. LIMPAR EQUIPAS DUPLICADAS RESIDUAIS QUE NÃO TENHAM JOGOS
  DELETE FROM public.tournament_teams tt
   WHERE tt.tournament_id = v_tour_id
     AND tt.group_id NOT IN (v_group_a_id, v_group_b_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.tournament_matches tm 
        WHERE tm.home_team_id = tt.id OR tm.away_team_id = tt.id
     );

  GET DIAGNOSTICS v_teams_merged = ROW_COUNT;
  RAISE NOTICE 'Equipas antigas duplicadas limpas: %', v_teams_merged;

  -- 5. ASSEGURAR QUE TODOS OS JOGOS COM PLACAR TÊM STATUS = 'finished'
  UPDATE public.tournament_matches
     SET status = 'finished'
   WHERE home_score IS NOT NULL 
     AND away_score IS NOT NULL 
     AND status <> 'finished';

  RAISE NOTICE '=== RECUPERAÇÃO CONCLUÍDA COM SUCESSO ===';
END $$;

-- ============================================================================
-- VERIFICAÇÃO VISUAL DOS RESULTADOS POR JORNADA E GRUPO
-- ============================================================================

-- 1. TODOS OS JOGOS DA JORNADA 1 (GRUPO A E GRUPO B)
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
ORDER BY g.name, tm.matchday, tm.created_at;

-- 2. CLASSIFICAÇÃO CALCULADA DO GRUPO A
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
  (v * 3 + e) AS "Pontos",
  j AS "J", v AS "V", e AS "E", d AS "D",
  gm AS "GM", gs AS "GS", (gm - gs) AS "DG"
FROM stats_a
ORDER BY "Pontos" DESC, "DG" DESC, "GM" DESC;

-- 3. CLASSIFICAÇÃO CALCULADA DO GRUPO B
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
  (v * 3 + e) AS "Pontos",
  j AS "J", v AS "V", e AS "E", d AS "D",
  gm AS "GM", gs AS "GS", (gm - gs) AS "DG"
FROM stats_b
ORDER BY "Pontos" DESC, "DG" DESC, "GM" DESC;
