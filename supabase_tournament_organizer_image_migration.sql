-- Migração: adiciona à tabela `tournaments` o nome da empresa organizadora e uma
-- imagem/símbolo do torneio, para acompanhar os ecrãs relacionados com essa competição
-- (Gestão da Liga, Classificações, badges de jogo no Calendário, etc.).
-- Idempotente — pode ser corrida várias vezes em segurança.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS organizer_name TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;
