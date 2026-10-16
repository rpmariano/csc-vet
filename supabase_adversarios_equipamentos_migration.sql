-- Suporte para cores de equipamento nas equipas adversárias (em casa e fora).
-- Cada equipamento (camisola principal e camisola alternativa) pode ter até duas cores.
--
-- Criada a 2026-10-16.

ALTER TABLE public.opponents
  ADD COLUMN IF NOT EXISTS home_kit_color_1 TEXT,
  ADD COLUMN IF NOT EXISTS home_kit_color_2 TEXT,
  ADD COLUMN IF NOT EXISTS away_kit_color_1 TEXT,
  ADD COLUMN IF NOT EXISTS away_kit_color_2 TEXT;

COMMENT ON COLUMN public.opponents.home_kit_color_1 IS 'Cor principal da camisola principal (em casa)';
COMMENT ON COLUMN public.opponents.home_kit_color_2 IS 'Segunda cor da camisola principal (em casa)';
COMMENT ON COLUMN public.opponents.away_kit_color_1 IS 'Cor principal da camisola alternativa (fora)';
COMMENT ON COLUMN public.opponents.away_kit_color_2 IS 'Segunda cor da camisola alternativa (fora)';

-- Garantir também que a tabela club_settings suporta a referência ao campo de casa
ALTER TABLE public.club_settings
  ADD COLUMN IF NOT EXISTS home_field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL;


