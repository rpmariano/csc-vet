-- ============================================================================
-- MIGRAÇÃO / ATUALIZAÇÃO DE DADOS: Equipas, Campos, Moradas, Equipamentos e Grupos
-- ============================================================================
-- Fonte: Tabela Oficial da Competição (Grupo A e Grupo B)
-- Grupo A: Janas, DS Private TV, Tires, Veteranos Sul, Melo Falcão, Lisbon Casuals, Banco Portugal, Camarate
-- Grupo B: Estrelas Lisboa, Técnico, Ferroviário, Torre, Bola Cacém, Amora, Cascais
-- ============================================================================

-- 1. Garantir que as colunas necessárias existem
ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS home_field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL;

ALTER TABLE public.opponents
  ADD COLUMN IF NOT EXISTS home_kit_color_1 TEXT,
  ADD COLUMN IF NOT EXISTS home_kit_color_2 TEXT,
  ADD COLUMN IF NOT EXISTS away_kit_color_1 TEXT,
  ADD COLUMN IF NOT EXISTS away_kit_color_2 TEXT;

COMMENT ON COLUMN public.opponents.home_kit_color_1 IS 'Cor principal da camisola principal (em casa)';
COMMENT ON COLUMN public.opponents.home_kit_color_2 IS 'Segunda cor da camisola principal (em casa)';
COMMENT ON COLUMN public.opponents.away_kit_color_1 IS 'Cor principal da camisola alternativa (fora)';
COMMENT ON COLUMN public.opponents.away_kit_color_2 IS 'Segunda cor da camisola alternativa (fora)';


DO $$
DECLARE
  v_campo_id UUID;
  v_opp_id UUID;
  v_tour RECORD;
  v_group_a_id UUID;
  v_group_b_id UUID;
  v_target_group_id UUID;
  v_cascais_field_id UUID;
  r RECORD;
BEGIN

  -- 2. TABELA TEMPORÁRIA DE CAMPOS E MORADAS
  CREATE TEMP TABLE IF NOT EXISTS tmp_campos_novos (
    nome TEXT PRIMARY KEY,
    morada TEXT
  ) ON COMMIT DROP;

  TRUNCATE tmp_campos_novos;

  INSERT INTO tmp_campos_novos (nome, morada) VALUES
    ('Mucifalense', 'Rua do Complexo Desportivo nº 24, 2705-249 Colares'),
    ('SMD Caneças', 'Rua do Campo da Bola - 1685-571 Caneças'),
    ('URD Tires', 'Rua Campo de Futebol, 2785-609 Tires'),
    ('SC Frielas', 'Rua Dom Dinis nº8, 2660-032 Frielas'),
    ('SL Olivais', 'Rua de Chibuto 1, 1800-012 Lisboa'),
    ('9 Abril Trajouce', 'Rua Sabino Luis Pedroso, 2785-673 São Domingos Rana'),
    ('GD Águias Camarate', 'Rua António Custodio Coelho - 2680 Camarate'),
    ('Clube Ferroviário', 'Azinhaga dos Alfinetes 144A, Lisboa'),
    ('AFD Torre', 'Rua das Caravelas, 2750-615 Cascais'),
    ('CD Agualva', 'Rua Domingos Borges 18, 2735-359 Agualva'),
    ('Amora FC', 'Estádio da Medideira – Campo nº 2'),
    ('GDS Cascais', 'Rua da Torre, 2750-148 Cascais');

  -- Inserir ou atualizar os campos
  FOR r IN SELECT * FROM tmp_campos_novos LOOP
    SELECT id INTO v_campo_id
      FROM public.fields
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(r.nome))
     LIMIT 1;

    IF v_campo_id IS NOT NULL THEN
      UPDATE public.fields
         SET address = r.morada
       WHERE id = v_campo_id;
    ELSE
      INSERT INTO public.fields (id, name, address)
      VALUES (gen_random_uuid(), r.nome, r.morada);
    END IF;
  END LOOP;

  -- Atualizar o campo de casa do próprio clube (GDS Cascais) em club_settings
  SELECT id INTO v_cascais_field_id
    FROM public.fields
   WHERE LOWER(TRIM(name)) = 'gds cascais'
   LIMIT 1;

  IF v_cascais_field_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.club_settings WHERE id = 1) THEN
      UPDATE public.club_settings
         SET home_field_id = v_cascais_field_id
       WHERE id = 1;
    ELSE
      INSERT INTO public.club_settings (id, name, initials, home_field_id)
      VALUES (1, 'Cascais Sport Clube', 'CSC', v_cascais_field_id)
      ON CONFLICT (id) DO UPDATE SET home_field_id = EXCLUDED.home_field_id;
    END IF;
  END IF;

  -- 3. TABELA TEMPORÁRIA DE EQUIPAS, CORES E GRUPOS
  CREATE TEMP TABLE IF NOT EXISTS tmp_equipas_dados (
    nome TEXT,
    sigla TEXT,
    campo_nome TEXT,
    home_c1 TEXT,
    home_c2 TEXT,
    away_c1 TEXT,
    away_c2 TEXT,
    grupo TEXT
  ) ON COMMIT DROP;

  TRUNCATE tmp_equipas_dados;

  INSERT INTO tmp_equipas_dados (nome, sigla, campo_nome, home_c1, home_c2, away_c1, away_c2, grupo) VALUES
    -- Grupo A
    ('Janas', 'JAN', 'Mucifalense', 'Azul', 'Amarelo', 'Cinzento', 'Amarelo', 'Grupo A'),
    ('DS Private TV', 'DSP', 'SMD Caneças', 'Preto', NULL, 'Branco', NULL, 'Grupo A'),
    ('Tires', 'TIR', 'URD Tires', 'Verde', NULL, 'Branco', NULL, 'Grupo A'),
    ('Veteranos Sul', 'VSUL', 'SC Frielas', 'Azul', NULL, 'Vermelho', 'Preto', 'Grupo A'),
    ('Melo Falcão', 'MFAL', 'SL Olivais', 'Verde', NULL, 'Amarelo', NULL, 'Grupo A'),
    ('Lisbon Casuals', 'LCAS', '9 Abril Trajouce', 'Azul', NULL, 'Amarelo', NULL, 'Grupo A'),
    ('Banco Portugal', 'BPOR', 'SMD Caneças', 'Azul', NULL, 'Branco', NULL, 'Grupo A'),
    ('Camarate', 'CAM', 'GD Águias Camarate', 'Verde', 'Branco', 'Preto', NULL, 'Grupo A'),

    -- Grupo B
    ('Estrelas Lisboa', 'ELIS', 'SL Olivais', 'Vermelho', 'Branco', 'Verde', 'Preto', 'Grupo B'),
    ('Técnico', 'TEC', 'SC Frielas', 'Azul Celeste', NULL, 'Azul Escuro', NULL, 'Grupo B'),
    ('Ferroviário', 'FER', 'Clube Ferroviário', 'Amarelo', 'Azul', 'X', NULL, 'Grupo B'),
    ('Torre', 'TOR', 'AFD Torre', 'Vermelho', NULL, 'Azul', NULL, 'Grupo B'),
    ('Bola Cacém', 'BCAC', 'CD Agualva', 'Branco', NULL, 'Azul', NULL, 'Grupo B'),
    ('Amora', 'AMO', 'Amora FC', 'Azul', NULL, 'Branco', 'Cinza', 'Grupo B'),
    ('Cascais', 'CSC', 'GDS Cascais', 'Verde', NULL, 'Branco', NULL, 'Grupo B');

  -- 4. INSERIR OU ATUALIZAR ADVERSÁRIOS
  FOR r IN SELECT * FROM tmp_equipas_dados WHERE nome <> 'Cascais' LOOP
    -- Resolver o id do campo habitual
    SELECT id INTO v_campo_id
      FROM public.fields
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(r.campo_nome))
     LIMIT 1;

    -- Localizar adversário existente por nome ou sigla
    SELECT id INTO v_opp_id
      FROM public.opponents
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(r.nome))
        OR (initials IS NOT NULL AND LOWER(TRIM(initials)) = LOWER(TRIM(r.sigla)))
     LIMIT 1;

    IF v_opp_id IS NOT NULL THEN
      UPDATE public.opponents
         SET name = r.nome,
             initials = COALESCE(r.sigla, opponents.initials),
             home_field_id = COALESCE(v_campo_id, opponents.home_field_id),
             home_kit_color_1 = r.home_c1,
             home_kit_color_2 = r.home_c2,
             away_kit_color_1 = r.away_c1,
             away_kit_color_2 = r.away_c2
       WHERE id = v_opp_id;
    ELSE
      INSERT INTO public.opponents (
        id, name, initials, home_field_id,
        home_kit_color_1, home_kit_color_2,
        away_kit_color_1, away_kit_color_2
      )
      VALUES (
        gen_random_uuid(), r.nome, r.sigla, v_campo_id,
        r.home_c1, r.home_c2,
        r.away_c1, r.away_c2
      );
    END IF;
  END LOOP;

  -- 5. ATRIBUIR AS EQUIPAS AOS GRUPOS DO TORNEIO (LIGA MASTERS +35 OU TORNEIO ATIVO)
  -- Se não existir nenhum torneio, cria o torneio principal
  IF NOT EXISTS (SELECT 1 FROM public.tournaments) THEN
    INSERT INTO public.tournaments (id, name, season, status)
    VALUES (gen_random_uuid(), 'Liga Masters +35', '2026/2027', 'ativo');
  END IF;

  -- Percorrer os torneios (ativo primeiro ou mais recente)
  FOR v_tour IN
    SELECT id, name
      FROM public.tournaments
     ORDER BY (status = 'ativo') DESC, created_at DESC
     LIMIT 1
  LOOP
    -- Garantir Grupo A
    SELECT id INTO v_group_a_id
      FROM public.tournament_groups
     WHERE tournament_id = v_tour.id
       AND (LOWER(TRIM(name)) = 'grupo a' OR LOWER(TRIM(name)) = 'a')
     LIMIT 1;

    IF v_group_a_id IS NULL THEN
      INSERT INTO public.tournament_groups (id, tournament_id, name, phase)
      VALUES (gen_random_uuid(), v_tour.id, 'Grupo A', 1)
      RETURNING id INTO v_group_a_id;
    END IF;

    -- Garantir Grupo B
    SELECT id INTO v_group_b_id
      FROM public.tournament_groups
     WHERE tournament_id = v_tour.id
       AND (LOWER(TRIM(name)) = 'grupo b' OR LOWER(TRIM(name)) = 'b')
     LIMIT 1;

    IF v_group_b_id IS NULL THEN
      INSERT INTO public.tournament_groups (id, tournament_id, name, phase)
      VALUES (gen_random_uuid(), v_tour.id, 'Grupo B', 1)
      RETURNING id INTO v_group_b_id;
    END IF;

    -- Ligar cada equipa ao seu respetivo grupo
    FOR r IN SELECT * FROM tmp_equipas_dados LOOP
      v_target_group_id := CASE WHEN r.grupo = 'Grupo A' THEN v_group_a_id ELSE v_group_b_id END;

      IF r.nome = 'Cascais' THEN
        -- O próprio clube Cascais tem opponent_id = NULL
        IF EXISTS (
          SELECT 1 FROM public.tournament_teams
           WHERE tournament_id = v_tour.id AND opponent_id IS NULL
        ) THEN
          UPDATE public.tournament_teams
             SET group_id = v_target_group_id
           WHERE tournament_id = v_tour.id AND opponent_id IS NULL;
        ELSE
          INSERT INTO public.tournament_teams (id, tournament_id, group_id, opponent_id, points_carryover)
          VALUES (gen_random_uuid(), v_tour.id, v_target_group_id, NULL, 0);
        END IF;
      ELSE
        -- Equipas adversárias
        SELECT id INTO v_opp_id
          FROM public.opponents
         WHERE LOWER(TRIM(name)) = LOWER(TRIM(r.nome))
            OR (initials IS NOT NULL AND LOWER(TRIM(initials)) = LOWER(TRIM(r.sigla)))
         LIMIT 1;

        IF v_opp_id IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM public.tournament_teams
             WHERE tournament_id = v_tour.id AND opponent_id = v_opp_id
          ) THEN
            UPDATE public.tournament_teams
               SET group_id = v_target_group_id
             WHERE tournament_id = v_tour.id AND opponent_id = v_opp_id;
          ELSE
            INSERT INTO public.tournament_teams (id, tournament_id, group_id, opponent_id, points_carryover)
            VALUES (gen_random_uuid(), v_tour.id, v_target_group_id, v_opp_id, 0);
          END IF;
        END IF;
      END IF;
    END LOOP;

  END LOOP;

END $$;
