-- Dispensas de quota na previsão de receita
-- =========================================
--
-- `quota_exemptions` guarda os meses em que um atleta em concreto está
-- dispensado de pagar quota — diferente de `financial_settings.quota_excluded_months`,
-- que é o mês em que o clube inteiro não paga (Agosto).
--
-- O cliente já as respeitava: `getPlayerQuotaMonths()` em `src/lib/finance.ts`,
-- o `usePlayerQuotaDebt` e "Os meus pagamentos" tiram-nas todas das contas. A
-- vista `v_quota_status` — que é de onde sai a **previsão de receita da época**
-- e a matriz "Situação de Quotas" do Financeiro — não as conhecia: continuava a
-- gerar uma linha por mês dispensado, com `expected_amount` e `owed_amount`
-- cheios. O clube contava com dinheiro que ninguém ia pagar, e a matriz
-- mostrava a dívida de quem estava dispensado.
--
-- A dispensa é normalmente para todos os anos e grava-se com o ano `0000`
-- (ver `guardarMesesDispensados` na TeamManagementPage). A condição aceita as
-- duas formas: o mês de qualquer ano (`0000-MM`) e um mês de um ano em
-- concreto (`AAAA-MM`), que a coluna já permite se um dia fizer falta.
--
-- A vista mantém-se `security_invoker = true`: quem a lê é o admin do
-- Financeiro, e a política "Admins gerem as dispensas de quota" dá-lhe leitura
-- de todas as linhas de `quota_exemptions`.

CREATE OR REPLACE VIEW public.v_quota_status
WITH (security_invoker = true) AS
WITH s AS (
  SELECT *
    FROM public.financial_settings
   WHERE id = 1
), season AS (
  SELECT public.financial_season(CURRENT_DATE) AS label,
         make_date(
           CASE
             WHEN s.season_start_month <= s.season_end_month THEN EXTRACT(year FROM CURRENT_DATE)::integer
             WHEN EXTRACT(month FROM CURRENT_DATE)::integer >= s.season_start_month THEN EXTRACT(year FROM CURRENT_DATE)::integer
             ELSE EXTRACT(year FROM CURRENT_DATE)::integer - 1
           END, s.season_start_month, 1) AS first_month,
         CASE
           WHEN s.season_end_month >= s.season_start_month THEN s.season_end_month - s.season_start_month + 1
           ELSE 12 - s.season_start_month + s.season_end_month + 1
         END AS n_months
    FROM s
), months AS (
  SELECT (season.first_month + ((i.i || ' month')::interval))::date AS month_start
    FROM season, generate_series(0, 11) i(i)
   WHERE i.i < season.n_months
), quota_months AS (
  SELECT m.month_start
    FROM months m, s
   WHERE NOT (EXTRACT(month FROM m.month_start)::integer = ANY (s.quota_excluded_months))
), eligible AS (
  SELECT p.id AS player_id,
         COALESCE(p.shirt_name, p.name) AS player_label,
         p.jersey_number,
         p.status,
         p.quota_start_date,
         COALESCE(p.quota_end_date,
           CASE WHEN p.status = 'inactive' THEN CURRENT_DATE ELSE NULL::date END) AS quota_end_date
    FROM public.profiles p
   WHERE CASE
           WHEN p.roles IS NOT NULL AND COALESCE(array_length(p.roles, 1), 0) > 0
             THEN ('player'::user_role = ANY (p.roles)) OR p.role = 'player'::user_role
           ELSE true
         END
)
SELECT e.player_id,
       e.player_label,
       e.jersey_number,
       e.status AS player_status,
       (SELECT season.label FROM season) AS season,
       to_char(qm.month_start::timestamp with time zone, 'YYYY-MM') AS month_year,
       qm.month_start,
       s.quota_amount AS expected_amount,
       d.id AS due_id,
       d.amount AS paid_amount,
       d.paid_at,
       (qm.month_start + (((s.quota_due_day - 1) || ' day')::interval))::date AS due_date,
       CASE
         WHEN d.id IS NOT NULL THEN 'paid'
         WHEN CURRENT_DATE > (qm.month_start + (((s.quota_due_day - 1) || ' day')::interval))::date THEN 'late'
         ELSE 'pending'
       END AS status,
       CASE WHEN d.id IS NOT NULL THEN 'paid' ELSE 'unpaid' END AS payment_status,
       CASE WHEN d.id IS NULL THEN s.quota_amount ELSE 0::numeric END AS owed_amount
  FROM eligible e
  CROSS JOIN quota_months qm
  CROSS JOIN s
  LEFT JOIN public.dues d
         ON d.player_id = e.player_id
        AND d.month_year = to_char(qm.month_start::timestamp with time zone, 'YYYY-MM')
 WHERE (e.quota_start_date IS NULL OR (qm.month_start + '1 mon -1 days'::interval)::date >= e.quota_start_date)
   AND (e.quota_end_date IS NULL OR qm.month_start <= e.quota_end_date)
   -- Os meses em que este atleta está dispensado saem da conta.
   AND NOT EXISTS (
         SELECT 1
           FROM public.quota_exemptions qe
          WHERE qe.profile_id = e.player_id
            AND right(qe.month_year, 2) = to_char(qm.month_start, 'MM')
            AND (left(qe.month_year, 4) = '0000'
                 OR qe.month_year = to_char(qm.month_start::timestamp with time zone, 'YYYY-MM'))
       );

REVOKE ALL ON public.v_quota_status FROM PUBLIC, anon;
GRANT SELECT ON public.v_quota_status TO authenticated;
