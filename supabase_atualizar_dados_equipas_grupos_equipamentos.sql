-- ============================================================================
-- ATUALIZAÇÃO DEFINITIVA E SEGURA: 15 EQUIPAS, CAMPOS, MORADAS E EQUIPAMENTOS
-- ============================================================================
-- SQL padrão sequencial puro (sem blocos DO $$ de forma a evitar erros de compilação
-- de schema cache do PostgreSQL e garantir execução garantida em qualquer Supabase).
-- ============================================================================

-- 1. Assegurar colunas de equipamentos e campo de casa
ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS home_field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_kit_color_1 TEXT DEFAULT 'Verde',
  ADD COLUMN IF NOT EXISTS home_kit_color_2 TEXT,
  ADD COLUMN IF NOT EXISTS away_kit_color_1 TEXT DEFAULT 'Branco',
  ADD COLUMN IF NOT EXISTS away_kit_color_2 TEXT;

ALTER TABLE public.opponents
  ADD COLUMN IF NOT EXISTS home_kit_color_1 TEXT,
  ADD COLUMN IF NOT EXISTS home_kit_color_2 TEXT,
  ADD COLUMN IF NOT EXISTS away_kit_color_1 TEXT,
  ADD COLUMN IF NOT EXISTS away_kit_color_2 TEXT;

-- ----------------------------------------------------------------------------
-- 2. GARANTIR TODOS OS 12 CAMPOS E RESPETIVAS MORADAS OFICIAIS
-- ----------------------------------------------------------------------------

-- 1. Mucifalense (Janas)
INSERT INTO public.fields (name, address)
SELECT 'Mucifalense', 'Rua do Complexo Desportivo nº 24, 2705-249 Colares'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%mucifal%');

UPDATE public.fields
   SET name = 'Mucifalense',
       address = 'Rua do Complexo Desportivo nº 24, 2705-249 Colares'
 WHERE name ILIKE '%mucifal%';

-- 2. SMD Caneças (DS Private TV e Banco Portugal)
INSERT INTO public.fields (name, address)
SELECT 'SMD Caneças', 'Rua do Campo da Bola - 1685-571 Caneças'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%cane_as%');

UPDATE public.fields
   SET name = 'SMD Caneças',
       address = 'Rua do Campo da Bola - 1685-571 Caneças'
 WHERE name ILIKE '%cane_as%';

-- 3. URD Tires (Tires)
INSERT INTO public.fields (name, address)
SELECT 'URD Tires', 'Rua Campo de Futebol, 2785-609 Tires'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%tires%');

UPDATE public.fields
   SET name = 'URD Tires',
       address = 'Rua Campo de Futebol, 2785-609 Tires'
 WHERE name ILIKE '%tires%';

-- 4. SC Frielas (Veteranos Sul e Técnico)
INSERT INTO public.fields (name, address)
SELECT 'SC Frielas', 'Rua Dom Dinis nº8, 2660-032 Frielas'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%frielas%');

UPDATE public.fields
   SET name = 'SC Frielas',
       address = 'Rua Dom Dinis nº8, 2660-032 Frielas'
 WHERE name ILIKE '%frielas%';

-- 5. SL Olivais (Melo Falcão e Estrelas Lisboa)
INSERT INTO public.fields (name, address)
SELECT 'SL Olivais', 'Rua de Chibuto 1, 1800-012 Lisboa'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%olivais%');

UPDATE public.fields
   SET name = 'SL Olivais',
       address = 'Rua de Chibuto 1, 1800-012 Lisboa'
 WHERE name ILIKE '%olivais%';

-- 6. 9 Abril Trajouce (Lisbon Casuals)
INSERT INTO public.fields (name, address)
SELECT '9 Abril Trajouce', 'Rua Sabino Luis Pedroso, 2785-673 São Domingos Rana'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%trajouce%' OR name ILIKE '%9%abril%');

UPDATE public.fields
   SET name = '9 Abril Trajouce',
       address = 'Rua Sabino Luis Pedroso, 2785-673 São Domingos Rana'
 WHERE name ILIKE '%trajouce%' OR name ILIKE '%9%abril%';

-- 7. GD Águias Camarate (Camarate)
INSERT INTO public.fields (name, address)
SELECT 'GD Águias Camarate', 'Rua António Custodio Coelho - 2680 Camarate'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%camarate%' OR name ILIKE '%_guias%');

UPDATE public.fields
   SET name = 'GD Águias Camarate',
       address = 'Rua António Custodio Coelho - 2680 Camarate'
 WHERE name ILIKE '%camarate%' OR name ILIKE '%_guias%';

-- 8. Clube Ferroviário (Ferroviário)
INSERT INTO public.fields (name, address)
SELECT 'Clube Ferroviário', 'Azinhaga dos Alfinetes 144A, Lisboa'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%ferrovi_rio%');

UPDATE public.fields
   SET name = 'Clube Ferroviário',
       address = 'Azinhaga dos Alfinetes 144A, Lisboa'
 WHERE name ILIKE '%ferrovi_rio%';

-- 9. AFD Torre (Torre)
INSERT INTO public.fields (name, address)
SELECT 'AFD Torre', 'Rua das Caravelas, 2750-615 Cascais'
WHERE NOT EXISTS (
  SELECT 1 FROM public.fields 
  WHERE (name ILIKE '%torre%' OR name ILIKE '%caravelas%' OR name ILIKE '%afd%')
    AND name NOT ILIKE '%gds%' AND name <> 'GDS Cascais'
);

UPDATE public.fields
   SET name = 'AFD Torre',
       address = 'Rua das Caravelas, 2750-615 Cascais'
 WHERE (name ILIKE '%torre%' OR name ILIKE '%caravelas%' OR name ILIKE '%afd%')
   AND name NOT ILIKE '%gds%' AND name <> 'GDS Cascais';

-- 10. CD Agualva (Bola Cacém)
INSERT INTO public.fields (name, address)
SELECT 'CD Agualva', 'Rua Domingos Borges 18, 2735-359 Agualva'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%agualva%');

UPDATE public.fields
   SET name = 'CD Agualva',
       address = 'Rua Domingos Borges 18, 2735-359 Agualva'
 WHERE name ILIKE '%agualva%';

-- 11. Amora FC (Amora)
INSERT INTO public.fields (name, address)
SELECT 'Amora FC', 'Estádio da Medideira – Campo nº 2'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%amora%' OR name ILIKE '%medideira%');

UPDATE public.fields
   SET name = 'Amora FC',
       address = 'Estádio da Medideira – Campo nº 2'
 WHERE name ILIKE '%amora%' OR name ILIKE '%medideira%';

-- 12. GDS Cascais (Cascais)
INSERT INTO public.fields (name, address)
SELECT 'GDS Cascais', 'Rua da Torre, 2750-148 Cascais'
WHERE NOT EXISTS (SELECT 1 FROM public.fields WHERE name ILIKE '%gds%' OR (name ILIKE '%cascais%' AND name NOT ILIKE '%torre%'));

UPDATE public.fields
   SET name = 'GDS Cascais',
       address = 'Rua da Torre, 2750-148 Cascais'
 WHERE name ILIKE '%gds%' OR (name ILIKE '%cascais%' AND name NOT ILIKE '%torre%');

-- Atualizar clube próprio (Cascais) em club_settings
UPDATE public.club_settings
   SET home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%gds%' OR (name ILIKE '%cascais%' AND name NOT ILIKE '%torre%') LIMIT 1),
       home_kit_color_1 = 'Verde',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Branco',
       away_kit_color_2 = NULL
 WHERE id = 1;

-- ----------------------------------------------------------------------------
-- 3. ATUALIZAR OU CRIAR CADA UMA DAS 15 EQUIPAS COM CAMPO E EQUIPAMENTOS
-- ----------------------------------------------------------------------------

-- 1. Janas (Grupo A) - Campo: Mucifalense, Casa: Azul/Amarelo, Fora: Cinzento/Amarelo
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, home_kit_color_2, away_kit_color_1, away_kit_color_2)
SELECT 'Janas', 'JAN', 
       (SELECT id FROM public.fields WHERE name ILIKE '%mucifal%' LIMIT 1),
       'Azul', 'Amarelo', 'Cinzento', 'Amarelo'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%janas%');

UPDATE public.opponents
   SET initials = 'JAN',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%mucifal%' LIMIT 1),
       home_kit_color_1 = 'Azul',
       home_kit_color_2 = 'Amarelo',
       away_kit_color_1 = 'Cinzento',
       away_kit_color_2 = 'Amarelo'
 WHERE name ILIKE '%janas%';

-- 2. DS Private TV (Grupo A) - Campo: SMD Caneças, Casa: Preto, Fora: Branco
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'DS Private TV', 'DSP',
       (SELECT id FROM public.fields WHERE name ILIKE '%cane_as%' LIMIT 1),
       'Preto', 'Branco'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%private%' OR name ILIKE '%dsp%');

UPDATE public.opponents
   SET initials = 'DSP',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%cane_as%' LIMIT 1),
       home_kit_color_1 = 'Preto',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Branco',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%private%' OR name ILIKE '%dsp%';

-- 3. Tires (Grupo A) - Campo: URD Tires, Casa: Verde, Fora: Branco
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'Tires', 'TIR',
       (SELECT id FROM public.fields WHERE name ILIKE '%tires%' LIMIT 1),
       'Verde', 'Branco'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%tires%');

UPDATE public.opponents
   SET initials = 'TIR',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%tires%' LIMIT 1),
       home_kit_color_1 = 'Verde',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Branco',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%tires%';

-- 4. Veteranos Sul (Grupo A) - Campo: SC Frielas, Casa: Azul, Fora: Vermelho/Preto
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1, away_kit_color_2)
SELECT 'Veteranos Sul', 'VSUL',
       (SELECT id FROM public.fields WHERE name ILIKE '%frielas%' LIMIT 1),
       'Azul', 'Vermelho', 'Preto'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%veteranos%' OR initials = 'VSUL');

UPDATE public.opponents
   SET initials = 'VSUL',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%frielas%' LIMIT 1),
       home_kit_color_1 = 'Azul',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Vermelho',
       away_kit_color_2 = 'Preto'
 WHERE name ILIKE '%veteranos%' OR initials = 'VSUL';

-- 5. Melo Falcão (Grupo A) - Campo: SL Olivais, Casa: Verde, Fora: Amarelo
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'Melo Falcão', 'MFAL',
       (SELECT id FROM public.fields WHERE name ILIKE '%olivais%' LIMIT 1),
       'Verde', 'Amarelo'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%falc_o%' OR name ILIKE '%melo%');

UPDATE public.opponents
   SET initials = 'MFAL',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%olivais%' LIMIT 1),
       home_kit_color_1 = 'Verde',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Amarelo',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%falc_o%' OR name ILIKE '%melo%';

-- 6. Lisbon Casuals (Grupo A) - Campo: 9 Abril Trajouce, Casa: Azul, Fora: Amarelo
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'Lisbon Casuals', 'LCAS',
       (SELECT id FROM public.fields WHERE name ILIKE '%trajouce%' OR name ILIKE '%9%abril%' LIMIT 1),
       'Azul', 'Amarelo'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%casuals%' OR name ILIKE '%lisbon%');

UPDATE public.opponents
   SET initials = 'LCAS',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%trajouce%' OR name ILIKE '%9%abril%' LIMIT 1),
       home_kit_color_1 = 'Azul',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Amarelo',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%casuals%' OR name ILIKE '%lisbon%';

-- 7. Banco Portugal (Grupo A) - Campo: SMD Caneças, Casa: Azul, Fora: Branco
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'Banco Portugal', 'BPOR',
       (SELECT id FROM public.fields WHERE name ILIKE '%cane_as%' LIMIT 1),
       'Azul', 'Branco'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%banco%' OR initials = 'BPOR' OR initials = 'GDBP');

UPDATE public.opponents
   SET initials = 'BPOR',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%cane_as%' LIMIT 1),
       home_kit_color_1 = 'Azul',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Branco',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%banco%' OR initials = 'BPOR' OR initials = 'GDBP';

-- 8. Camarate (Grupo A) - Campo: GD Águias Camarate, Casa: Verde/Branco, Fora: Preto
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, home_kit_color_2, away_kit_color_1)
SELECT 'Camarate', 'CAM',
       (SELECT id FROM public.fields WHERE name ILIKE '%camarate%' OR name ILIKE '%_guias%' LIMIT 1),
       'Verde', 'Branco', 'Preto'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%camarate%' OR name ILIKE '%_guias%' OR initials = 'CAM' OR initials = 'GDAC');

UPDATE public.opponents
   SET initials = 'CAM',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%camarate%' OR name ILIKE '%_guias%' LIMIT 1),
       home_kit_color_1 = 'Verde',
       home_kit_color_2 = 'Branco',
       away_kit_color_1 = 'Preto',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%camarate%' OR name ILIKE '%_guias%' OR initials = 'CAM' OR initials = 'GDAC';

-- 9. Estrelas Lisboa (Grupo B) - Campo: SL Olivais, Casa: Vermelho/Branco, Fora: Verde/Preto
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, home_kit_color_2, away_kit_color_1, away_kit_color_2)
SELECT 'Estrelas Lisboa', 'ELIS',
       (SELECT id FROM public.fields WHERE name ILIKE '%olivais%' LIMIT 1),
       'Vermelho', 'Branco', 'Verde', 'Preto'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%estrelas%');

UPDATE public.opponents
   SET initials = 'ELIS',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%olivais%' LIMIT 1),
       home_kit_color_1 = 'Vermelho',
       home_kit_color_2 = 'Branco',
       away_kit_color_1 = 'Verde',
       away_kit_color_2 = 'Preto'
 WHERE name ILIKE '%estrelas%';

-- 10. Técnico (Grupo B) - Campo: SC Frielas, Casa: Azul Celeste, Fora: Azul Escuro
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'Técnico', 'TEC',
       (SELECT id FROM public.fields WHERE name ILIKE '%frielas%' LIMIT 1),
       'Azul Celeste', 'Azul Escuro'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%t_cnico%' OR name ILIKE '%aeist%' OR initials = 'TEC');

UPDATE public.opponents
   SET initials = 'TEC',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%frielas%' LIMIT 1),
       home_kit_color_1 = 'Azul Celeste',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Azul Escuro',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%t_cnico%' OR name ILIKE '%aeist%' OR initials = 'TEC';

-- 11. Ferroviário (Grupo B) - Campo: Clube Ferroviário, Casa: Amarelo/Azul, Fora: X
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, home_kit_color_2, away_kit_color_1, away_kit_color_2)
SELECT 'Ferroviário', 'FER',
       (SELECT id FROM public.fields WHERE name ILIKE '%ferrovi_rio%' LIMIT 1),
       'Amarelo', 'Azul', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%ferrovi_rio%' OR initials = 'FER');

UPDATE public.opponents
   SET initials = 'FER',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%ferrovi_rio%' LIMIT 1),
       home_kit_color_1 = 'Amarelo',
       home_kit_color_2 = 'Azul',
       away_kit_color_1 = NULL,
       away_kit_color_2 = NULL
 WHERE name ILIKE '%ferrovi_rio%' OR initials = 'FER';

-- 12. Torre (Grupo B) - Campo: AFD Torre, Casa: Vermelho, Fora: Azul
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'Torre', 'TOR',
       (SELECT id FROM public.fields WHERE (name ILIKE '%torre%' OR name ILIKE '%caravelas%' OR name ILIKE '%afd%') AND name NOT ILIKE '%gds%' LIMIT 1),
       'Vermelho', 'Azul'
WHERE NOT EXISTS (
  SELECT 1 FROM public.opponents 
  WHERE name ILIKE '%torre%' OR name ILIKE '%afd%' OR initials = 'TOR'
);

UPDATE public.opponents
   SET initials = 'TOR',
       home_field_id = (SELECT id FROM public.fields WHERE (name ILIKE '%torre%' OR name ILIKE '%caravelas%' OR name ILIKE '%afd%') AND name NOT ILIKE '%gds%' LIMIT 1),
       home_kit_color_1 = 'Vermelho',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Azul',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%torre%' OR name ILIKE '%afd%' OR initials = 'TOR';

-- 13. Bola Cacém (Grupo B) - Campo: CD Agualva, Casa: Branco, Fora: Azul
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1)
SELECT 'Bola Cacém', 'BCAC',
       (SELECT id FROM public.fields WHERE name ILIKE '%agualva%' LIMIT 1),
       'Branco', 'Azul'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%cac_m%' OR name ILIKE '%bola%');

UPDATE public.opponents
   SET initials = 'BCAC',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%agualva%' LIMIT 1),
       home_kit_color_1 = 'Branco',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Azul',
       away_kit_color_2 = NULL
 WHERE name ILIKE '%cac_m%' OR name ILIKE '%bola%';

-- 14. Amora (Grupo B) - Campo: Amora FC, Casa: Azul, Fora: Branco/Cinza
INSERT INTO public.opponents (name, initials, home_field_id, home_kit_color_1, away_kit_color_1, away_kit_color_2)
SELECT 'Amora', 'AMO',
       (SELECT id FROM public.fields WHERE name ILIKE '%amora%' OR name ILIKE '%medideira%' LIMIT 1),
       'Azul', 'Branco', 'Cinza'
WHERE NOT EXISTS (SELECT 1 FROM public.opponents WHERE name ILIKE '%amora%');

UPDATE public.opponents
   SET initials = 'AMO',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%amora%' OR name ILIKE '%medideira%' LIMIT 1),
       home_kit_color_1 = 'Azul',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Branco',
       away_kit_color_2 = 'Cinza'
 WHERE name ILIKE '%amora%';

-- 15. Cascais (Grupo B) - Campo: GDS Cascais, Casa: Verde, Fora: Branco
-- Se existir em opponents como adversário registado
UPDATE public.opponents
   SET initials = 'CSC',
       home_field_id = (SELECT id FROM public.fields WHERE name ILIKE '%gds%' OR (name ILIKE '%cascais%' AND name NOT ILIKE '%torre%') LIMIT 1),
       home_kit_color_1 = 'Verde',
       home_kit_color_2 = NULL,
       away_kit_color_1 = 'Branco',
       away_kit_color_2 = NULL
 WHERE (name ILIKE '%cascais%' OR initials = 'CSC') AND name NOT ILIKE '%torre%';

-- ----------------------------------------------------------------------------
-- 4. VERIFICAÇÃO FINAL: LISTA COMPLETA DAS 15 EQUIPAS, CAMPOS, MORADAS E CORES
-- ----------------------------------------------------------------------------
SELECT 
  o.name AS "Equipa",
  COALESCE(o.initials, '-') AS "Sigla",
  COALESCE(f.name, 'SEM CAMPO') AS "Campo Habitual",
  COALESCE(f.address, '-') AS "Morada do Campo",
  COALESCE(NULLIF(TRIM(CONCAT_WS(' / ', o.home_kit_color_1, o.home_kit_color_2)), ''), 'Por definir') AS "Camisola Casa",
  COALESCE(NULLIF(TRIM(CONCAT_WS(' / ', o.away_kit_color_1, o.away_kit_color_2)), ''), 'Por definir') AS "Camisola Fora"
FROM public.opponents o
LEFT JOIN public.fields f ON f.id = o.home_field_id
ORDER BY o.name;
