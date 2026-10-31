-- =============================================================================
-- MIGRAÇÃO: 3ª Taça de Veteranos - Futebol de 11 (UCFFCC - Cascais 2026)
-- =============================================================================
-- Regista a competição no formato "Taça de Portugal" (knockout), campos,
-- equipas participantes, quadro competitivo completo (Jogos 1 a 8) e o jogo
-- do Cascais nos Quartos de Final (06/12/2026 às 15h00 vs Tires).
-- =============================================================================

DO $$
DECLARE
  v_tour_id UUID;
  v_group_id UUID;
  v_field_cascais UUID;
  v_field_carcavelos UUID;
  v_field_malveira UUID;
  v_field_torre UUID;
  v_opp_carcavelos UUID;
  v_opp_central32 UUID;
  v_opp_tires UUID;
  v_opp_malveira UUID;
  v_opp_estoril UUID;
  v_opp_torre UUID;
  v_opp_zambujeiro UUID;
  v_opp_casuals UUID;
  v_team_csc UUID;
  v_team_carcavelos UUID;
  v_team_central32 UUID;
  v_team_tires UUID;
  v_team_malveira UUID;
  v_team_estoril UUID;
  v_team_torre UUID;
  v_team_zambujeiro UUID;
  v_team_casuals UUID;
  v_event_j2 UUID;
  v_m1 UUID;
  v_m2 UUID;
  v_m3 UUID;
  v_m4 UUID;
  v_m5 UUID;
  v_m6 UUID;
  v_m7 UUID;
  v_m8 UUID;
BEGIN
  -- 1. Campos oficiais da prova
  SELECT id INTO v_field_cascais FROM public.fields WHERE name ILIKE '%Cascais%' OR name ILIKE '%Dramático%' LIMIT 1;
  IF v_field_cascais IS NULL THEN
    INSERT INTO public.fields (name, address) VALUES ('Campo do Dramático de Cascais', 'Cascais') RETURNING id INTO v_field_cascais;
  END IF;

  SELECT id INTO v_field_carcavelos FROM public.fields WHERE name ILIKE '%Carcavelos%' LIMIT 1;
  IF v_field_carcavelos IS NULL THEN
    INSERT INTO public.fields (name, address) VALUES ('Campo do Carcavelos', 'Carcavelos') RETURNING id INTO v_field_carcavelos;
  END IF;

  SELECT id INTO v_field_malveira FROM public.fields WHERE name ILIKE '%Malveira%' LIMIT 1;
  IF v_field_malveira IS NULL THEN
    INSERT INTO public.fields (name, address) VALUES ('Campo da Malveira da Serra', 'Malveira da Serra, Alcabideche') RETURNING id INTO v_field_malveira;
  END IF;

  SELECT id INTO v_field_torre FROM public.fields WHERE name ILIKE '%Torre%' LIMIT 1;
  IF v_field_torre IS NULL THEN
    INSERT INTO public.fields (name, address) VALUES ('Campo da Torre', 'Torre, Cascais') RETURNING id INTO v_field_torre;
  END IF;

  -- 2. Adversários participantes na 3ª Taça de Veteranos
  SELECT id INTO v_opp_carcavelos FROM public.opponents WHERE name ILIKE '%Carcavelos%' LIMIT 1;
  IF v_opp_carcavelos IS NULL THEN
    INSERT INTO public.opponents (name, initials, home_field_id) VALUES ('Carcavelos', 'CAR', v_field_carcavelos) RETURNING id INTO v_opp_carcavelos;
  END IF;

  SELECT id INTO v_opp_central32 FROM public.opponents WHERE name ILIKE '%Central 32%' LIMIT 1;
  IF v_opp_central32 IS NULL THEN
    INSERT INTO public.opponents (name, initials) VALUES ('Central 32', 'C32') RETURNING id INTO v_opp_central32;
  END IF;

  SELECT id INTO v_opp_tires FROM public.opponents WHERE name ILIKE '%Tires%' LIMIT 1;
  IF v_opp_tires IS NULL THEN
    INSERT INTO public.opponents (name, initials) VALUES ('UDR Tires', 'TIR') RETURNING id INTO v_opp_tires;
  END IF;

  SELECT id INTO v_opp_malveira FROM public.opponents WHERE name ILIKE '%Malveira%' LIMIT 1;
  IF v_opp_malveira IS NULL THEN
    INSERT INTO public.opponents (name, initials, home_field_id) VALUES ('Malveira da Serra', 'MDS', v_field_malveira) RETURNING id INTO v_opp_malveira;
  END IF;

  SELECT id INTO v_opp_estoril FROM public.opponents WHERE name ILIKE '%Estoril%' LIMIT 1;
  IF v_opp_estoril IS NULL THEN
    INSERT INTO public.opponents (name, initials) VALUES ('Estoril Praia', 'EST') RETURNING id INTO v_opp_estoril;
  END IF;

  SELECT id INTO v_opp_torre FROM public.opponents WHERE name ILIKE '%Torre%' LIMIT 1;
  IF v_opp_torre IS NULL THEN
    INSERT INTO public.opponents (name, initials, home_field_id) VALUES ('CCDR Torre', 'TOR', v_field_torre) RETURNING id INTO v_opp_torre;
  END IF;

  SELECT id INTO v_opp_zambujeiro FROM public.opponents WHERE name ILIKE '%Zambujeiro%' LIMIT 1;
  IF v_opp_zambujeiro IS NULL THEN
    INSERT INTO public.opponents (name, initials, home_field_id) VALUES ('Zambujeiro', 'ZAM', v_field_malveira) RETURNING id INTO v_opp_zambujeiro;
  END IF;

  SELECT id INTO v_opp_casuals FROM public.opponents WHERE name ILIKE '%Casuals%' LIMIT 1;
  IF v_opp_casuals IS NULL THEN
    INSERT INTO public.opponents (name, initials) VALUES ('Lisbon Casuals', 'LCFC') RETURNING id INTO v_opp_casuals;
  END IF;

  -- 3. Torneio: 3ª Taça de Veteranos - Cascais 2026
  SELECT id INTO v_tour_id FROM public.tournaments WHERE name ILIKE '%Taça de Veteranos%' LIMIT 1;
  IF v_tour_id IS NULL THEN
    INSERT INTO public.tournaments (name, season, status, organizer_name, image_url, rules)
    VALUES (
      '3ª Taça de Veteranos - Cascais 2026',
      '2026',
      'agendado',
      'UCFFCC - União de Clubes de Futebol e Futsal do Concelho de Cascais',
      '/csc-vet/emblemas/ucffcc.jpg',
      '{
        "format": "knockout",
        "knockout_tiebreaker": "penalties",
        "knockout_starting_round": "round_of_16",
        "min_age": 36,
        "max_birth_year": 1990,
        "exceptions_allowed": true,
        "exceptions_count": 1,
        "exceptions_min_age": 35,
        "exceptions_max_birth_year": 1991,
        "unlimited_squad": true,
        "max_squad_size": 999,
        "max_match_players": 20,
        "min_match_players": 7,
        "forbid_fpf_federated": true,
        "require_id_document": true,
        "require_medical_exam": true,
        "medical_exam_valid_until": "2026-12-21",
        "require_insurance": true,
        "exclusive_club_representation": true,
        "roster_update_deadline": "Até às 17h00 da 5ª feira anterior ao jogo",
        "match_duration_mins": 70,
        "half_duration_mins": 35,
        "halftime_duration_mins": 10,
        "rolling_subs": true,
        "kit_conflict_rule": "home_changes",
        "yellow_cards_to_suspension": 2,
        "yellow_cards_suspension_enabled": true,
        "red_card_suspension": true,
        "double_yellow_suspension": true,
        "violent_conduct_expulsion": true,
        "suspensions_carry_over": true,
        "walkover_score": "3-0",
        "max_walkovers_allowed": 1,
        "delay_tolerance_mins": 15,
        "referee_entity": "NAFLS (Associação de Futebol de Lisboa)",
        "referee_fee_per_match": 50
      }'::jsonb
    )
    RETURNING id INTO v_tour_id;
  END IF;

  -- 4. Grupo ("Quadro Competitivo") e Equipas
  SELECT id INTO v_group_id FROM public.tournament_groups WHERE tournament_id = v_tour_id LIMIT 1;
  IF v_group_id IS NULL THEN
    INSERT INTO public.tournament_groups (tournament_id, name, phase) VALUES (v_tour_id, 'Quadro Competitivo', 1) RETURNING id INTO v_group_id;
  END IF;

  SELECT id INTO v_team_csc FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id IS NULL LIMIT 1;
  IF v_team_csc IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, NULL) RETURNING id INTO v_team_csc;
  END IF;

  SELECT id INTO v_team_carcavelos FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_carcavelos LIMIT 1;
  IF v_team_carcavelos IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_carcavelos) RETURNING id INTO v_team_carcavelos;
  END IF;

  SELECT id INTO v_team_central32 FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_central32 LIMIT 1;
  IF v_team_central32 IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_central32) RETURNING id INTO v_team_central32;
  END IF;

  SELECT id INTO v_team_tires FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_tires LIMIT 1;
  IF v_team_tires IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_tires) RETURNING id INTO v_team_tires;
  END IF;

  SELECT id INTO v_team_malveira FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_malveira LIMIT 1;
  IF v_team_malveira IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_malveira) RETURNING id INTO v_team_malveira;
  END IF;

  SELECT id INTO v_team_estoril FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_estoril LIMIT 1;
  IF v_team_estoril IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_estoril) RETURNING id INTO v_team_estoril;
  END IF;

  SELECT id INTO v_team_torre FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_torre LIMIT 1;
  IF v_team_torre IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_torre) RETURNING id INTO v_team_torre;
  END IF;

  SELECT id INTO v_team_zambujeiro FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_zambujeiro LIMIT 1;
  IF v_team_zambujeiro IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_zambujeiro) RETURNING id INTO v_team_zambujeiro;
  END IF;

  SELECT id INTO v_team_casuals FROM public.tournament_teams WHERE tournament_id = v_tour_id AND opponent_id = v_opp_casuals LIMIT 1;
  IF v_team_casuals IS NULL THEN
    INSERT INTO public.tournament_teams (tournament_id, group_id, opponent_id) VALUES (v_tour_id, v_group_id, v_opp_casuals) RETURNING id INTO v_team_casuals;
  END IF;

  -- 5. Evento na Agenda para o Jogo 2 do Cascais (Quartos de Final: 06/12/2026 às 15h00 vs Tires)
  SELECT id INTO v_event_j2 FROM public.events WHERE tournament_id = v_tour_id AND matchday = 2 LIMIT 1;
  IF v_event_j2 IS NULL THEN
    INSERT INTO public.events (
      title, type, date_time, meeting_time, field_id, location, description,
      is_friendly, is_active, tournament_id, matchday, opponent_id, home_away
    ) VALUES (
      'Jogo vs UDR Tires', 'match', '2026-12-06T15:00:00Z', '14:00:00',
      v_field_cascais, 'Campo do Dramático de Cascais',
      'Quartos de Final (Jogo 2) — 3ª Taça de Veteranos UCFFCC 2026',
      false, true, v_tour_id, 2, v_opp_tires, 'home'
    ) RETURNING id INTO v_event_j2;
  END IF;

  -- 6. Quadro de Jogos (Jogos 1 a 8) se ainda não existirem
  IF NOT EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = v_tour_id) THEN
    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status)
    VALUES (v_tour_id, v_group_id, 1, v_team_carcavelos, v_team_central32, '2026-11-29', 'scheduled') RETURNING id INTO v_m1;

    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status, event_id)
    VALUES (v_tour_id, v_group_id, 2, v_team_csc, v_team_tires, '2026-12-06', 'scheduled', v_event_j2) RETURNING id INTO v_m2;

    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status)
    VALUES (v_tour_id, v_group_id, 2, v_team_malveira, v_team_estoril, '2026-12-06', 'scheduled') RETURNING id INTO v_m3;

    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status)
    VALUES (v_tour_id, v_group_id, 2, v_team_torre, NULL, '2026-12-06', 'scheduled') RETURNING id INTO v_m4;

    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status)
    VALUES (v_tour_id, v_group_id, 2, v_team_zambujeiro, v_team_casuals, '2026-12-06', 'scheduled') RETURNING id INTO v_m5;

    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status)
    VALUES (v_tour_id, v_group_id, 3, NULL, NULL, '2026-12-13', 'scheduled') RETURNING id INTO v_m6;

    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status)
    VALUES (v_tour_id, v_group_id, 3, NULL, NULL, '2026-12-13', 'scheduled') RETURNING id INTO v_m7;

    INSERT INTO public.tournament_matches (tournament_id, group_id, matchday, home_team_id, away_team_id, match_date, status)
    VALUES (v_tour_id, v_group_id, 4, NULL, NULL, '2026-12-20', 'scheduled') RETURNING id INTO v_m8;

    UPDATE public.tournaments
    SET rules = jsonb_set(
      rules,
      '{knockout_matches}',
      jsonb_build_array(
        jsonb_build_object('match_id', v_m1, 'match_number', 1, 'round', 1, 'home_placeholder', null, 'away_placeholder', null, 'location', 'Carcavelos', 'match_time', '15H00'),
        jsonb_build_object('match_id', v_m2, 'match_number', 2, 'round', 2, 'home_placeholder', null, 'away_placeholder', null, 'location', 'Cascais', 'match_time', '15H00'),
        jsonb_build_object('match_id', v_m3, 'match_number', 3, 'round', 2, 'home_placeholder', null, 'away_placeholder', null, 'location', 'Malveira da Serra', 'match_time', '15H00'),
        jsonb_build_object('match_id', v_m4, 'match_number', 4, 'round', 2, 'home_placeholder', null, 'away_placeholder', 'VENCEDOR JOGO 1', 'location', 'Torre', 'match_time', '15H00'),
        jsonb_build_object('match_id', v_m5, 'match_number', 5, 'round', 2, 'home_placeholder', null, 'away_placeholder', null, 'location', 'Malveira da Serra', 'match_time', '17H00'),
        jsonb_build_object('match_id', v_m6, 'match_number', 6, 'round', 3, 'home_placeholder', 'VENCEDOR JOGO 2', 'away_placeholder', 'VENCEDOR JOGO 3', 'location', null, 'match_time', null),
        jsonb_build_object('match_id', v_m7, 'match_number', 7, 'round', 3, 'home_placeholder', 'VENCEDOR JOGO 5', 'away_placeholder', 'VENCEDOR JOGO 4', 'location', null, 'match_time', null),
        jsonb_build_object('match_id', v_m8, 'match_number', 8, 'round', 4, 'home_placeholder', 'VENCEDOR JOGO 6', 'away_placeholder', 'VENCEDOR JOGO 7', 'location', null, 'match_time', null)
      )
    )
    WHERE id = v_tour_id;
  END IF;
END $$;
