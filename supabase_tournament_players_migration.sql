-- ============================================================================
-- Migração: Criação da tabela tournament_players e respetivas políticas RLS
-- ============================================================================

-- 1. Criação da tabela de jogadores inscritos em torneios
CREATE TABLE IF NOT EXISTS public.tournament_players (
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (tournament_id, player_id)
);

-- 2. Ativação de RLS
ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Acesso
DROP POLICY IF EXISTS "Plantel de torneios legível por todos" ON public.tournament_players;
CREATE POLICY "Plantel de torneios legível por todos"
ON public.tournament_players FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Apenas treinadores e admins gerem plantel de torneios" ON public.tournament_players;
CREATE POLICY "Apenas treinadores e admins gerem plantel de torneios"
ON public.tournament_players FOR ALL
TO authenticated
USING (
  public.get_user_role() IN ('coach', 'admin')
  OR 'coach' = ANY(public.get_user_roles())
  OR 'admin' = ANY(public.get_user_roles())
)
WITH CHECK (
  public.get_user_role() IN ('coach', 'admin')
  OR 'coach' = ANY(public.get_user_roles())
  OR 'admin' = ANY(public.get_user_roles())
);

-- 4. Permissões para utilizadores autenticados e service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_players TO authenticated;
GRANT ALL ON public.tournament_players TO service_role;

-- 5. Atualização de _merge_profile_references para gerir transferências de fichas
CREATE OR REPLACE FUNCTION public._merge_profile_references(id_antigo UUID, id_novo UUID)
RETURNS void AS $$
BEGIN
    -- callups: uma linha por (evento, jogador)
    DELETE FROM public.callups c WHERE c.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.callups x WHERE x.player_id = id_novo AND x.event_id = c.event_id);
    UPDATE public.callups SET player_id = id_novo WHERE player_id = id_antigo;

    -- tournament_players: uma linha por (torneio, jogador)
    DELETE FROM public.tournament_players tp WHERE tp.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.tournament_players x WHERE x.player_id = id_novo AND x.tournament_id = tp.tournament_id);
    UPDATE public.tournament_players SET player_id = id_novo WHERE player_id = id_antigo;

    -- attendances: uma linha por (evento, jogador)
    DELETE FROM public.attendances a WHERE a.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.attendances x WHERE x.player_id = id_novo AND x.event_id = a.event_id);
    UPDATE public.attendances SET player_id = id_novo WHERE player_id = id_antigo;

    -- stats: uma linha por (evento, jogador)
    DELETE FROM public.stats s WHERE s.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.stats x WHERE x.player_id = id_novo AND x.event_id = s.event_id);
    UPDATE public.stats SET player_id = id_novo WHERE player_id = id_antigo;

    -- dues: uma linha por (jogador, mês)
    DELETE FROM public.dues d WHERE d.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.dues x WHERE x.player_id = id_novo AND x.month_year = d.month_year);
    UPDATE public.dues SET player_id = id_novo WHERE player_id = id_antigo;

    -- charge_players: uma linha por (encargo, jogador)
    DELETE FROM public.charge_players cp WHERE cp.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.charge_players x WHERE x.player_id = id_novo AND x.charge_id = cp.charge_id);
    UPDATE public.charge_players SET player_id = id_novo WHERE player_id = id_antigo;

    -- announcement_reads: chave primária (comunicado, jogador)
    DELETE FROM public.announcement_reads ar WHERE ar.player_id = id_antigo
        AND EXISTS (SELECT 1 FROM public.announcement_reads x WHERE x.player_id = id_novo AND x.announcement_id = ar.announcement_id);
    UPDATE public.announcement_reads SET player_id = id_novo WHERE player_id = id_antigo;

    -- Sem restrição de unicidade: transferência direta
    UPDATE public.charge_payments SET player_id = id_novo WHERE player_id = id_antigo;
    UPDATE public.insurance_payments SET player_id = id_novo WHERE player_id = id_antigo;
    UPDATE public.tournament_suspensions SET player_id = id_novo WHERE player_id = id_antigo;

    -- Autoria (quem criou o registo, tipicamente equipa técnica)
    UPDATE public.announcements SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.charges SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.dues SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.events SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.charge_payments SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.insurance_payments SET created_by = id_novo WHERE created_by = id_antigo;
    UPDATE public.transactions SET created_by = id_novo WHERE created_by = id_antigo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
