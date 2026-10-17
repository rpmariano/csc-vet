-- Tabela para registo de disponibilidade dos atletas para jogos
-- ==============================================================
--
-- Quando sai a convocatória de um treino que antecede um jogo, é feita uma sondagem
-- acoplada ao treino para saber se o atleta está ou não disponível para ser convocado
-- para o jogo (com data, hora e local).
--
-- Esta resposta não substitui a convocatória oficial do treinador: permite ao
-- treinador saber quem está disponível antes de fazer a convocatória para o jogo.

CREATE TABLE IF NOT EXISTS public.match_availabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('available', 'unavailable')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(match_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_availabilities_match_idx ON public.match_availabilities(match_id);
CREATE INDEX IF NOT EXISTS match_availabilities_player_idx ON public.match_availabilities(player_id);

ALTER TABLE public.match_availabilities ENABLE ROW LEVEL SECURITY;

-- 1. Qualquer utilizador autenticado pode consultar as disponibilidades
DROP POLICY IF EXISTS "Disponibilidades legíveis por todos autenticados" ON public.match_availabilities;
CREATE POLICY "Disponibilidades legíveis por todos autenticados"
ON public.match_availabilities FOR SELECT
TO authenticated
USING (true);

-- 2. Jogadores podem registar a sua própria disponibilidade
DROP POLICY IF EXISTS "Jogadores registam a sua própria disponibilidade" ON public.match_availabilities;
CREATE POLICY "Jogadores registam a sua própria disponibilidade"
ON public.match_availabilities FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = player_id);

-- 3. Jogadores podem atualizar a sua própria disponibilidade
DROP POLICY IF EXISTS "Jogadores atualizam a sua própria disponibilidade" ON public.match_availabilities;
CREATE POLICY "Jogadores atualizam a sua própria disponibilidade"
ON public.match_availabilities FOR UPDATE
TO authenticated
USING (auth.uid() = player_id)
WITH CHECK (auth.uid() = player_id);

-- 4. Treinadores e admins têm gestão total
DROP POLICY IF EXISTS "Treinadores e admins gerem disponibilidades" ON public.match_availabilities;
CREATE POLICY "Treinadores e admins gerem disponibilidades"
ON public.match_availabilities FOR ALL
TO authenticated
USING (public.get_user_role() IN ('coach', 'admin'));
