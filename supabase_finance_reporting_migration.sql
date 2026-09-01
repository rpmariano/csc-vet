-- ============================================================================
-- Módulo Financeiro — camada de reporting.
--
-- 1. Método de pagamento em todas as entradas de dinheiro (lacuna 2)
-- 2. Época derivada em SQL, sem denormalizar (lacuna 3)
-- 3. created_by nas quotas (lacuna 4)
-- 4. Categoria nas receitas — sem mudança de esquema, ver nota (lacuna 5)
-- 5. Vista v_financial_movements: o facto único de movimentos, o mesmo grão
--    que a página Financeira já constrói em memória (allMovements).
--
-- Idempotente — pode ser corrido várias vezes em segurança.
-- ============================================================================

--------------------------------------------------------------------------------
-- 1. MÉTODO DE PAGAMENTO
--------------------------------------------------------------------------------
-- TEXT + CHECK (e não ENUM) para se poder acrescentar um método com um simples
-- ALTER ... DROP/ADD CONSTRAINT, sem mexer num tipo de que dependem 3 tabelas.
-- Nulo = método não registado (todo o histórico anterior a esta migração).

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['dues', 'charge_payments', 'transactions'] LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS payment_method TEXT', t);
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_payment_method_check');
        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (payment_method IS NULL OR payment_method IN '
            || '(''numerario'', ''mbway'', ''transferencia'', ''multibanco'', ''cheque'', ''outro''))',
            t, t || '_payment_method_check'
        );
    END LOOP;
END $$;

COMMENT ON COLUMN public.dues.payment_method IS 'Como foi pago: numerario|mbway|transferencia|multibanco|cheque|outro. NULL = não registado.';
COMMENT ON COLUMN public.charge_payments.payment_method IS 'Como foi pago: numerario|mbway|transferencia|multibanco|cheque|outro. NULL = não registado.';
COMMENT ON COLUMN public.transactions.payment_method IS 'Como foi pago/recebido: numerario|mbway|transferencia|multibanco|cheque|outro. NULL = não registado.';

--------------------------------------------------------------------------------
-- 2. RASTO DE QUEM REGISTOU A QUOTA
--------------------------------------------------------------------------------
ALTER TABLE public.dues
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

--------------------------------------------------------------------------------
-- 3. ÉPOCA EM SQL
--------------------------------------------------------------------------------
-- Espelha getSeasonLabel() de src/lib/finance.ts: uma época que começa depois do
-- mês em que acaba (o caso normal, Set→Jul) atravessa o ano civil, e Setembro de
-- 2026 pertence a "2026/2027". Lê as regras de financial_settings, por isso é
-- STABLE e não IMMUTABLE — não pode ser usada em índices.
CREATE OR REPLACE FUNCTION public.financial_season(d DATE)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN d IS NULL THEN NULL
        WHEN s.season_start_month <= s.season_end_month
            THEN EXTRACT(YEAR FROM d)::INT::TEXT
        WHEN EXTRACT(MONTH FROM d)::INT >= s.season_start_month
            THEN EXTRACT(YEAR FROM d)::INT || '/' || (EXTRACT(YEAR FROM d)::INT + 1)
        ELSE (EXTRACT(YEAR FROM d)::INT - 1) || '/' || EXTRACT(YEAR FROM d)::INT
    END
    FROM public.financial_settings s
    WHERE s.id = 1;
$$;

COMMENT ON FUNCTION public.financial_season(DATE) IS 'Época financeira ("AAAA/AAAA") em que uma data cai, segundo financial_settings. Espelha getSeasonLabel() em src/lib/finance.ts.';

--------------------------------------------------------------------------------
-- 4. CATEGORIA NAS RECEITAS (lacuna 5) — sem alteração de esquema
--------------------------------------------------------------------------------
-- transactions.category_id já é nullable e sem restrição de tipo: era a app que
-- forçava NULL nas receitas. A regra "só categorias com allow_income podem ser
-- usadas em receitas" não é exprimível num CHECK (precisa de subconsulta); fica
-- do lado da aplicação, para não introduzir um trigger só por isto.

--------------------------------------------------------------------------------
-- 5. ÍNDICES PARA A VISTA
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dues_paid_at ON public.dues(paid_at);
CREATE INDEX IF NOT EXISTS idx_dues_player ON public.dues(player_id);
CREATE INDEX IF NOT EXISTS idx_charge_payments_paid_at ON public.charge_payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id);

--------------------------------------------------------------------------------
-- 6. VISTA v_financial_movements — o facto único
--------------------------------------------------------------------------------
-- Junta as três fontes de dinheiro (quotas, encargos, despesas/receitas avulsas)
-- no grão de um movimento, com as dimensões todas resolvidas. É o mesmo grão que
-- FinancePage.allMovements constrói em memória.
--
-- security_invoker = true é OBRIGATÓRIO: sem isso a vista corria com os
-- privilégios do dono e furava a RLS das tabelas (transactions é só de admin,
-- dues e charge_payments limitam o jogador ao que é seu). Com invoker, cada
-- utilizador vê pela vista exatamente o que veria pelas tabelas.

DROP VIEW IF EXISTS public.v_financial_movements;

CREATE VIEW public.v_financial_movements
WITH (security_invoker = true) AS

-- Quotas -------------------------------------------------------------------
SELECT
    'due-' || d.id::TEXT                                    AS movement_id,
    d.id                                                    AS source_id,
    'quota'::TEXT                                           AS source,
    COALESCE(d.paid_at::DATE, (d.month_year || '-01')::DATE) AS entry_date,
    (d.month_year || '-01')::DATE                           AS accrual_date,
    public.financial_season((d.month_year || '-01')::DATE)   AS season,
    d.month_year                                            AS reference_month,
    'income'::TEXT                                          AS type,
    d.amount                                                AS amount,
    d.amount                                                AS signed_amount,
    'Quota de ' || d.month_year || ' — ' || COALESCE(p.shirt_name, p.name, 'Jogador') AS description,
    'quotas'::TEXT                                          AS category_key,
    'Quotas'::TEXT                                          AS category_label,
    NULL::UUID                                              AS category_id,
    d.player_id                                             AS player_id,
    COALESCE(p.shirt_name, p.name)                          AS player_label,
    NULL::UUID                                              AS tournament_id,
    d.payment_method                                        AS payment_method,
    NULL::TEXT                                              AS document_url,
    d.created_by                                            AS created_by,
    d.created_at                                            AS created_at
FROM public.dues d
LEFT JOIN public.profiles p ON p.id = d.player_id

UNION ALL

-- Encargos (pagamentos) ----------------------------------------------------
-- Usam a categoria do próprio encargo, para caírem no mesmo grupo da despesa
-- correspondente (ex.: o que se recebeu de Seguro e o que se pagou à seguradora).
SELECT
    'charge-' || cp.id::TEXT,
    cp.id,
    'encargo'::TEXT,
    cp.paid_at,
    cp.paid_at,
    public.financial_season(cp.paid_at),
    NULL::TEXT,
    'income'::TEXT,
    cp.amount,
    cp.amount,
    COALESCE(c.title, 'Encargo') || ' — ' || COALESCE(p.shirt_name, p.name, 'Jogador')
        || COALESCE(' (' || cp.notes || ')', ''),
    COALESCE(cat.id::TEXT, 'no_category'),
    COALESCE(cat.name, 'Encargos'),
    cat.id,
    cp.player_id,
    COALESCE(p.shirt_name, p.name),
    NULL::UUID,
    cp.payment_method,
    NULL::TEXT,
    cp.created_by,
    cp.created_at
FROM public.charge_payments cp
LEFT JOIN public.charges c ON c.id = cp.charge_id
LEFT JOIN public.expense_categories cat ON cat.id = c.category_id
LEFT JOIN public.profiles p ON p.id = cp.player_id

UNION ALL

-- Despesas e receitas avulsas ----------------------------------------------
SELECT
    'tx-' || t.id::TEXT,
    t.id,
    'avulso'::TEXT,
    t.date,
    t.date,
    public.financial_season(t.date),
    NULL::TEXT,
    t.type::TEXT,
    t.amount,
    CASE WHEN t.type = 'expense' THEN -t.amount ELSE t.amount END,
    t.description,
    CASE
        WHEN t.category_id IS NOT NULL THEN t.category_id::TEXT
        WHEN t.type = 'income' THEN 'income_other'
        ELSE 'no_category'
    END,
    COALESCE(cat.name, CASE WHEN t.type = 'income' THEN 'Outras Receitas' ELSE 'Sem Categoria' END),
    t.category_id,
    NULL::UUID,
    NULL::TEXT,
    t.tournament_id,
    t.payment_method,
    t.document_url,
    t.created_by,
    t.created_at
FROM public.transactions t
LEFT JOIN public.expense_categories cat ON cat.id = t.category_id;

COMMENT ON VIEW public.v_financial_movements IS
'Facto único do módulo financeiro: quotas + pagamentos de encargos + despesas/receitas avulsas, com época, categoria e jogador resolvidos. security_invoker — respeita a RLS de cada tabela de origem.';

GRANT SELECT ON public.v_financial_movements TO authenticated;

--------------------------------------------------------------------------------
-- 7. VISTA v_quota_status — a matriz jogador × mês da época
--------------------------------------------------------------------------------
-- Resolve a lacuna 1: uma quota por pagar não tem linha em `dues`, por isso a
-- dívida não existe em SQL. Aqui geram-se todos os meses de quota da época
-- corrente, cruzados com os jogadores elegíveis, e marca-se cada célula como
-- paid | late | pending — a mesma regra de computeQuotaMonthStatus().
--
-- Nota: só a época corrente (a que a data de hoje determina). Para histórico,
-- parametrizar como função em vez de vista.

DROP VIEW IF EXISTS public.v_quota_status;

CREATE VIEW public.v_quota_status
WITH (security_invoker = true) AS
WITH s AS (
    SELECT * FROM public.financial_settings WHERE id = 1
),
season AS (
    SELECT
        public.financial_season(CURRENT_DATE) AS label,
        -- Primeiro dia do mês de início da época corrente.
        MAKE_DATE(
            CASE
                WHEN s.season_start_month <= s.season_end_month THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
                WHEN EXTRACT(MONTH FROM CURRENT_DATE)::INT >= s.season_start_month THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
                ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT - 1
            END,
            s.season_start_month, 1
        ) AS first_month,
        -- Duração da época em meses, inclusive.
        CASE
            WHEN s.season_end_month >= s.season_start_month THEN s.season_end_month - s.season_start_month + 1
            ELSE 12 - s.season_start_month + s.season_end_month + 1
        END AS n_months
    FROM s
),
months AS (
    SELECT (season.first_month + (i || ' month')::INTERVAL)::DATE AS month_start
    FROM season, generate_series(0, 11) AS i
    WHERE i < season.n_months
),
quota_months AS (
    SELECT m.month_start
    FROM months m, s
    WHERE NOT (EXTRACT(MONTH FROM m.month_start)::INT = ANY (s.quota_excluded_months))
),
eligible AS (
    SELECT
        p.id AS player_id,
        COALESCE(p.shirt_name, p.name) AS player_label,
        p.jersey_number,
        p.status,
        p.quota_start_date,
        -- Sem data de fim explícita, um jogador inativo deixa de gerar meses a
        -- partir de hoje; ativo/lesionado continua elegível até ao fim da época.
        COALESCE(p.quota_end_date, CASE WHEN p.status = 'inactive' THEN CURRENT_DATE END) AS quota_end_date
    FROM public.profiles p
)
SELECT
    e.player_id,
    e.player_label,
    e.jersey_number,
    e.status AS player_status,
    (SELECT label FROM season)                              AS season,
    TO_CHAR(qm.month_start, 'YYYY-MM')                      AS month_year,
    qm.month_start,
    s.quota_amount                                          AS expected_amount,
    d.id                                                    AS due_id,
    d.amount                                                AS paid_amount,
    d.paid_at,
    d.payment_method,
    -- Último dia em que a quota ainda está em dia: o próprio quota_due_day
    -- (o dia 8, por omissão). O incumprimento começa no dia seguinte — mesma
    -- regra de getQuotaDueDate/computeQuotaMonthStatus em src/lib/finance.ts.
    (qm.month_start + ((s.quota_due_day - 1) || ' day')::INTERVAL)::DATE AS due_date,
    CASE
        WHEN d.id IS NOT NULL THEN 'paid'
        WHEN CURRENT_DATE > (qm.month_start + ((s.quota_due_day - 1) || ' day')::INTERVAL)::DATE THEN 'late'
        ELSE 'pending'
    END                                                     AS status,
    CASE WHEN d.id IS NULL THEN s.quota_amount ELSE 0 END   AS owed_amount
FROM eligible e
CROSS JOIN quota_months qm
CROSS JOIN s
LEFT JOIN public.dues d
       ON d.player_id = e.player_id
      AND d.month_year = TO_CHAR(qm.month_start, 'YYYY-MM')
-- Recorta pela janela de elegibilidade do jogador (mesma regra de getPlayerQuotaMonths).
WHERE (e.quota_start_date IS NULL OR (qm.month_start + INTERVAL '1 month - 1 day')::DATE >= e.quota_start_date)
  AND (e.quota_end_date IS NULL OR qm.month_start <= e.quota_end_date);

COMMENT ON VIEW public.v_quota_status IS
'Matriz jogador × mês da época corrente com o estado calculado da quota (paid|late|pending) e o valor em dívida. Espelha getPlayerQuotaMonths + computeQuotaMonthStatus de src/lib/finance.ts.';

GRANT SELECT ON public.v_quota_status TO authenticated;
