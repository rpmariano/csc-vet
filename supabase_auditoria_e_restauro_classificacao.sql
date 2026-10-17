-- ============================================================================
-- AUDITORIA PROFUNDA E RESTAURO COMPLETO DA CLASSIFICAÇÃO / TORNEIO SIDELINE
-- ============================================================================
-- Executar este script no SQL Editor do Supabase.
--
-- O QUE ESTE SCRIPT FAZ:
-- 1. Audita detalhadamente o estado das tabelas: tournaments, tournament_groups,
--    tournament_teams, tournament_matches e events.
-- 2. Realinha imediatamente todos os jogos de tournament_matches para o group_id
--    correto onde as equipas realmente se encontram (Grupo A ou Grupo B).
-- 3. Restaura e espelha quaisquer jogos realizados pelo Cascais a partir de public.events
--    que tenham sido dessincronizados ou apagados da tabela tournament_matches.
-- 4. Remove grupos vazios orfãos (sem equipas nem jogos) para não poluir a interface.
-- 5. Garante que todos os grupos da fase de grupos têm phase = 1 e estado 'ativo'.
-- 6. Apresenta o relatório final com a classificação e jogos restaurados.
-- ============================================================================

DO $$
DECLARE
  v_tour RECORD;
  v_group RECORD;
  v_ev RECORD;
  v_csc_team_id UUID;
  v_opp_team_id UUID;
  v_target_group_id UUID;
  v_home_id UUID;
  v_away_id UUID;
  v_existing_match_id UUID;
  v_matches_realigned INT := 0;
  v_events_restored INT := 0;
  v_orphan_groups_deleted INT := 0;
BEGIN
  RAISE NOTICE '=== INÍCIO DA AUDITORIA E RESTAURO ===';

  -- --------------------------------------------------------------------------
  -- 1. REALINHAR JOGOS EXISTENTES PARA OS RESPETIVOS GRUPOS DAS EQUIPAS
  -- --------------------------------------------------------------------------
  -- Quando as equipas foram distribuídas para o Grupo A e Grupo B,
  -- os jogos em tournament_matches tinham ficado associados ao grupo antigo.
  -- Esta atualização move cada jogo para o grupo onde ambas as equipas pertencem.
  WITH matches_to_update AS (
    SELECT 
      tm.id AS match_id,
      tt_home.group_id AS target_group_id
    FROM public.tournament_matches tm
    JOIN public.tournament_teams tt_home ON tt_home.id = tm.home_team_id
    JOIN public.tournament_teams tt_away ON tt_away.id = tm.away_team_id
    WHERE tt_home.group_id = tt_away.group_id
      AND tm.group_id <> tt_home.group_id
  )
  UPDATE public.tournament_matches tm
     SET group_id = mtu.target_group_id
    FROM matches_to_update mtu
   WHERE tm.id = mtu.match_id;

  GET DIAGNOSTICS v_matches_realigned = ROW_COUNT;
  RAISE NOTICE '1. Jogos realinhados para os novos grupos (Grupo A / Grupo B): %', v_matches_realigned;

  -- Para jogos entre equipas de grupos diferentes (se existirem), garantir grupo válido
  UPDATE public.tournament_matches tm
     SET group_id = tt_home.group_id
    FROM public.tournament_teams tt_home
   WHERE tm.home_team_id = tt_home.id
     AND tm.group_id NOT IN (SELECT id FROM public.tournament_groups);

  -- --------------------------------------------------------------------------
  -- 2. RESTAURAR E ESPELHAR JOGOS DO CASCAIS A PARTIR DE public.events
  -- --------------------------------------------------------------------------
  -- Todos os jogos do clube realizados vivem em public.events com home_score e away_score.
  -- Caso algum jogo tenha sido removido de tournament_matches, recuperamo-lo aqui.
  FOR v_ev IN
    SELECT 
      e.id,
      e.tournament_id,
      COALESCE(e.matchday, 1) AS matchday,
      e.opponent_id,
      e.home_away,
      e.home_score,
      e.away_score,
      e.date_time
    FROM public.events e
    WHERE e.type = 'match'
      AND e.tournament_id IS NOT NULL
      AND e.home_score IS NOT NULL
      AND e.away_score IS NOT NULL
  LOOP
    -- Localizar equipa do Cascais neste torneio (opponent_id IS NULL)
    SELECT id, group_id INTO v_csc_team_id, v_target_group_id
      FROM public.tournament_teams
     WHERE tournament_id = v_ev.tournament_id
       AND opponent_id IS NULL
     LIMIT 1;

    -- Localizar equipa adversária neste torneio
    SELECT id INTO v_opp_team_id
      FROM public.tournament_teams
     WHERE tournament_id = v_ev.tournament_id
       AND opponent_id = v_ev.opponent_id
     LIMIT 1;

    IF v_csc_team_id IS NOT NULL AND v_opp_team_id IS NOT NULL AND v_target_group_id IS NOT NULL THEN
      IF v_ev.home_away = 'away' THEN
        v_home_id := v_opp_team_id;
        v_away_id := v_csc_team_id;
      ELSE
        v_home_id := v_csc_team_id;
        v_away_id := v_opp_team_id;
      END IF;

      -- Verificar se já existe espelho deste evento
      SELECT id INTO v_existing_match_id
        FROM public.tournament_matches
       WHERE event_id = v_ev.id
       LIMIT 1;

      IF v_existing_match_id IS NOT NULL THEN
        -- Atualizar dados do espelho existente
        UPDATE public.tournament_matches
           SET group_id = v_target_group_id,
               matchday = v_ev.matchday,
               home_team_id = v_home_id,
               away_team_id = v_away_id,
               home_score = v_ev.home_score,
               away_score = v_ev.away_score,
               status = 'finished',
               match_date = v_ev.date_time
         WHERE id = v_existing_match_id;
      ELSE
        -- Verificar se existe jogo manual sem event_id associado para esta jornada e equipas
        SELECT id INTO v_existing_match_id
          FROM public.tournament_matches
         WHERE tournament_id = v_ev.tournament_id
           AND matchday = v_ev.matchday
           AND home_team_id = v_home_id
           AND away_team_id = v_away_id
         LIMIT 1;

        IF v_existing_match_id IS NOT NULL THEN
          UPDATE public.tournament_matches
             SET event_id = v_ev.id,
                 group_id = v_target_group_id,
                 home_score = v_ev.home_score,
                 away_score = v_ev.away_score,
                 status = 'finished',
                 match_date = v_ev.date_time
           WHERE id = v_existing_match_id;
        ELSE
          -- Inserir novo jogo espelhado restaurado
          INSERT INTO public.tournament_matches (
            id,
            tournament_id,
            group_id,
            matchday,
            home_team_id,
            away_team_id,
            home_score,
            away_score,
            status,
            match_date,
            event_id
          ) VALUES (
            gen_random_uuid(),
            v_ev.tournament_id,
            v_target_group_id,
            v_ev.matchday,
            v_home_id,
            v_away_id,
            v_ev.home_score,
            v_ev.away_score,
            'finished',
            v_ev.date_time,
            v_ev.id
          );
          v_events_restored := v_events_restored + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE '2. Jogos do clube repostos a partir de eventos: %', v_events_restored;

  -- --------------------------------------------------------------------------
  -- 3. LIMPEZA DE GRUPOS ORFÃOS VAZIOS (SEM EQUIPAS NEM JOGOS)
  -- --------------------------------------------------------------------------
  -- Grupos antigos que ficaram com 0 equipas e 0 jogos devem ser removidos
  -- para que a app não apresente "Nenhuma equipa neste grupo" nem pastilhas vazias.
  WITH empty_groups AS (
    SELECT g.id
    FROM public.tournament_groups g
    WHERE NOT EXISTS (SELECT 1 FROM public.tournament_teams tt WHERE tt.group_id = g.id)
      AND NOT EXISTS (SELECT 1 FROM public.tournament_matches tm WHERE tm.group_id = g.id)
      AND LOWER(TRIM(g.name)) NOT IN ('grupo a', 'grupo b')
  )
  DELETE FROM public.tournament_groups
   WHERE id IN (SELECT id FROM empty_groups);

  GET DIAGNOSTICS v_orphan_groups_deleted = ROW_COUNT;
  RAISE NOTICE '3. Grupos orfãos vazios removidos: %', v_orphan_groups_deleted;

  -- --------------------------------------------------------------------------
  -- 4. GARANTIR QUE OS GRUPOS TÊM FASE 1 E QUE O TORNEIO ESTÁ ATIVO
  -- --------------------------------------------------------------------------
  UPDATE public.tournament_groups
     SET phase = 1
   WHERE (LOWER(TRIM(name)) = 'grupo a' OR LOWER(TRIM(name)) = 'grupo b')
     AND (phase IS NULL OR phase <> 1);

  UPDATE public.tournaments
     SET status = 'ativo',
         season = COALESCE(season, '2026/2027'),
         organizer_name = COALESCE(organizer_name, 'Sideline')
   WHERE status = 'agendado' OR status IS NULL;

  RAISE NOTICE '=== RESTAURO CONCLUÍDO COM SUCESSO ===';
END $$;

-- ============================================================================
-- 5. RELATÓRIO DE AUDITORIA: VERIFICAÇÃO VISUAL DOS DADOS ATUAIS
-- ============================================================================

-- Torneios registados
SELECT 
  id,
  name AS "Nome Torneio",
  season AS "Época",
  status AS "Estado",
  organizer_name AS "Organização"
FROM public.tournaments
ORDER BY created_at DESC;

-- Grupos e contagem de equipas e jogos
SELECT 
  t.name AS "Torneio",
  g.name AS "Grupo",
  g.phase AS "Fase",
  COUNT(DISTINCT tt.id) AS "Total Equipas",
  COUNT(DISTINCT tm.id) AS "Total Jogos",
  COUNT(DISTINCT tm.id) FILTER (WHERE tm.status = 'finished') AS "Jogos Realizados"
FROM public.tournament_groups g
JOIN public.tournaments t ON t.id = g.tournament_id
LEFT JOIN public.tournament_teams tt ON tt.group_id = g.id
LEFT JOIN public.tournament_matches tm ON tm.group_id = g.id
GROUP BY t.name, g.id, g.name, g.phase
ORDER BY t.name, g.name;

-- Lista de equipas por grupo
SELECT 
  g.name AS "Grupo",
  COALESCE(o.name, 'GDS Cascais') AS "Equipa",
  COALESCE(o.initials, 'CSC') AS "Sigla",
  tt.points_carryover AS "Pontos Extra"
FROM public.tournament_teams tt
JOIN public.tournament_groups g ON g.id = tt.group_id
LEFT JOIN public.opponents o ON o.id = tt.opponent_id
ORDER BY g.name, "Equipa";

-- Jogos do Cascais registados
SELECT 
  tm.matchday AS "Jornada",
  g.name AS "Grupo",
  COALESCE(home_opp.name, 'GDS Cascais') AS "Equipa Casa",
  tm.home_score AS "Golos Casa",
  tm.away_score AS "Golos Fora",
  COALESCE(away_opp.name, 'GDS Cascais') AS "Equipa Fora",
  tm.status AS "Estado",
  tm.match_date AS "Data",
  CASE WHEN tm.event_id IS NOT NULL THEN 'Sim' ELSE 'Não' END AS "Ligado a Evento"
FROM public.tournament_matches tm
JOIN public.tournament_groups g ON g.id = tm.group_id
JOIN public.tournament_teams home_tt ON home_tt.id = tm.home_team_id
JOIN public.tournament_teams away_tt ON away_tt.id = tm.away_team_id
LEFT JOIN public.opponents home_opp ON home_opp.id = home_tt.opponent_id
LEFT JOIN public.opponents away_opp ON away_opp.id = away_tt.opponent_id
WHERE home_tt.opponent_id IS NULL OR away_tt.opponent_id IS NULL
ORDER BY g.name, tm.matchday;
