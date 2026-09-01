-- ============================================================================
-- Módulo Financeiro: quotas com regras configuráveis, seguro desportivo,
-- categorias de despesas com documento comprovativo, e ligação de despesas a
-- tranches de inscrição de torneios.
-- Idempotente — pode ser corrido várias vezes em segurança.
-- ============================================================================

-- 1. Definições financeiras do clube (linha única, tal como club_settings) ---
-- Regras de quota: quais os meses da época com quota, valor, e a partir de que
-- dia do mês uma quota por pagar entra em incumprimento. Regras de seguro:
-- valor da época e prazo-limite (mês + dia, recalculado a cada época).
CREATE TABLE IF NOT EXISTS public.financial_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    season_start_month INT NOT NULL DEFAULT 9 CHECK (season_start_month BETWEEN 1 AND 12),
    season_end_month INT NOT NULL DEFAULT 7 CHECK (season_end_month BETWEEN 1 AND 12),
    quota_amount NUMERIC(10,2) NOT NULL DEFAULT 15.00,
    quota_excluded_months INT[] NOT NULL DEFAULT '{8}', -- Agosto, por omissão
    quota_due_day INT NOT NULL DEFAULT 8 CHECK (quota_due_day BETWEEN 1 AND 28),
    insurance_amount NUMERIC(10,2) NOT NULL DEFAULT 20.00,
    insurance_deadline_month INT NOT NULL DEFAULT 9 CHECK (insurance_deadline_month BETWEEN 1 AND 12),
    insurance_deadline_day INT NOT NULL DEFAULT 30 CHECK (insurance_deadline_day BETWEEN 1 AND 31),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
INSERT INTO public.financial_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;

-- 2. Janela em que cada jogador deve pagar quota — sobrepõe-se ao estado
-- (ativo/lesionado/inativo) do perfil só quando definida explicitamente; sem
-- data definida, infere-se do estado atual (ver src/lib/finance.ts).
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS quota_start_date DATE,
    ADD COLUMN IF NOT EXISTS quota_end_date DATE;

-- 3. Pagamentos de seguro desportivo — registo em vez de um único booleano,
-- para suportar pagamento parcial (o valor em falta é sempre
-- financial_settings.insurance_amount menos a soma dos pagamentos da época).
CREATE TABLE IF NOT EXISTS public.insurance_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    season TEXT NOT NULL, -- formato AAAA/AAAA, ex: 2026/2027
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.insurance_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_insurance_payments_player ON public.insurance_payments(player_id);

-- 4. Categorias de despesa (Bolas, Coletes, Material Médico, ...) ------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

-- 5. Transações: categoria, documento comprovativo, e ligação opcional a uma
-- tranche de inscrição de torneio (paga-se uma despesa por cada tranche).
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS document_url TEXT,
    ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS installment_index INT;

-- Nota: o plano de inscrição de um torneio (valor total, nº de tranches,
-- valor e prazo de cada uma, e qual a transação que a liquidou) vive dentro
-- de tournaments.rules (JSONB já existente para as regras do torneio), sob a
-- chave "registration_fee" — não precisa de tabela própria. Ver
-- TournamentRules em src/pages/AdminDashboard.tsx.

--------------------------------------------------------------------------------
-- POLÍTICAS DE SEGURANÇA (RLS)
--------------------------------------------------------------------------------

-- financial_settings: configuração, não dados pessoais — leitura aberta,
-- escrita só de admin (mesmo padrão de club_settings / dues / transactions).
DROP POLICY IF EXISTS "Definições financeiras legíveis por todos" ON public.financial_settings;
CREATE POLICY "Definições financeiras legíveis por todos"
ON public.financial_settings FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Apenas admins alteram as definições financeiras" ON public.financial_settings;
CREATE POLICY "Apenas admins alteram as definições financeiras"
ON public.financial_settings FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin');

-- insurance_payments: o próprio jogador vê os seus pagamentos; admin gere tudo.
DROP POLICY IF EXISTS "Utilizador vê os seus próprios pagamentos de seguro" ON public.insurance_payments;
CREATE POLICY "Utilizador vê os seus próprios pagamentos de seguro"
ON public.insurance_payments FOR SELECT
TO authenticated
USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Admins gerem todos os pagamentos de seguro" ON public.insurance_payments;
CREATE POLICY "Admins gerem todos os pagamentos de seguro"
ON public.insurance_payments FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin');

-- expense_categories: nomes, sem dados sensíveis — leitura aberta, escrita admin.
DROP POLICY IF EXISTS "Categorias de despesa legíveis por todos" ON public.expense_categories;
CREATE POLICY "Categorias de despesa legíveis por todos"
ON public.expense_categories FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Apenas admins gerem categorias de despesa" ON public.expense_categories;
CREATE POLICY "Apenas admins gerem categorias de despesa"
ON public.expense_categories FOR ALL
TO authenticated
USING (public.get_user_role() = 'admin');

--------------------------------------------------------------------------------
-- ARMAZENAMENTO: documentos comprovativos de despesa (bucket privado)
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance_documents', 'finance_documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins gerem documentos financeiros" ON storage.objects;
CREATE POLICY "Admins gerem documentos financeiros"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'finance_documents' AND public.get_user_role() = 'admin')
WITH CHECK (bucket_id = 'finance_documents' AND public.get_user_role() = 'admin');

--------------------------------------------------------------------------------
-- CATEGORIAS DE DESPESA INICIAIS (exemplos do pedido original)
--------------------------------------------------------------------------------
INSERT INTO public.expense_categories (name) VALUES
    ('Material Desportivo'),
    ('Material Médico'),
    ('Inscrições em Torneios'),
    ('Aluguer de Campo'),
    ('Arbitragem'),
    ('Transporte')
ON CONFLICT (name) DO NOTHING;
