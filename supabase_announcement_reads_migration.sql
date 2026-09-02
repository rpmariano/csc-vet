-- ============================================================================
-- Comunicados lidos: passam a viver na base de dados, não no dispositivo.
--
-- O estado de "lido" estava em localStorage, com uma chave por utilizador
-- (`csc_read_announcements_<id>`). O localStorage é do browser, não da conta:
-- o telemóvel e o desktop têm cada um o seu e nunca se falam, por isso o badge
-- de comunicados por ler nunca batia certo entre os dois. Perdia-se também ao
-- limpar os dados do browser — e no Safari do iOS apaga-se sozinho ao fim de
-- alguns dias sem uso.
--
-- Idempotente — pode ser corrido várias vezes em segurança.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.announcement_reads (
    announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE NOT NULL,
    player_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    read_at         TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (announcement_id, player_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- O contexto carrega sempre as leituras do utilizador com sessão iniciada.
CREATE INDEX IF NOT EXISTS idx_announcement_reads_player
    ON public.announcement_reads(player_id);

COMMENT ON TABLE public.announcement_reads IS
'Que comunicados cada pessoa já leu. Substitui o localStorage, que era por dispositivo e não sincronizava entre o telemóvel e o desktop.';

--------------------------------------------------------------------------------
-- POLÍTICAS DE SEGURANÇA (RLS)
--------------------------------------------------------------------------------
-- Ao contrário do resto do esquema, aqui nem a equipa técnica tem nada que ver:
-- quem leu o quê é do próprio. Sem UPDATE de propósito — marcar como lido é um
-- INSERT (o cliente usa ignoreDuplicates, que dá ON CONFLICT DO NOTHING) e
-- desmarcar é um DELETE; não há nada numa linha destas para alterar.

DROP POLICY IF EXISTS "Cada um vê as suas leituras" ON public.announcement_reads;
CREATE POLICY "Cada um vê as suas leituras"
ON public.announcement_reads FOR SELECT
TO authenticated
USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Cada um marca as suas leituras" ON public.announcement_reads;
CREATE POLICY "Cada um marca as suas leituras"
ON public.announcement_reads FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = player_id);

DROP POLICY IF EXISTS "Cada um desmarca as suas leituras" ON public.announcement_reads;
CREATE POLICY "Cada um desmarca as suas leituras"
ON public.announcement_reads FOR DELETE
TO authenticated
USING (auth.uid() = player_id);
