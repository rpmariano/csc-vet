# Módulo Financeiro — Campos disponíveis para reports e dashboards

Inventário de **tudo o que o menu Financeiro (`src/pages/FinancePage.tsx`) lê, escreve e
calcula**, organizado para desenho de relatórios e dashboards: o que serve de *dimensão*
(agrupar/filtrar), o que serve de *métrica* (somar/contar) e o que é apenas operacional.

Fontes: `supabase_schema.sql`, `supabase_finance_module_migration.sql`, `src/lib/finance.ts`,
`src/pages/FinancePage.tsx`.

Legenda da coluna **Uso**: `D` dimensão · `M` métrica · `F` filtro/data · `—` operacional
(sem valor analítico) · `PII` dado pessoal sensível, **não expor em dashboards**.

---

## 1. Tabelas-facto (onde está o dinheiro)

### 1.1 `dues` — quotas mensais pagas

Só existe linha **quando a quota é paga** (o não-pago é ausência de linha, calculada em
`getPlayerQuotaMonths`). Qualquer métrica de dívida tem de ser derivada, não lida daqui.

| Campo | Tipo | Uso | Notas para reporting |
|---|---|---|---|
| `id` | uuid | — | chave |
| `player_id` | uuid → `profiles.id` | D | dimensão Jogador |
| `month_year` | text `YYYY-MM` | D/F | mês de competência (≠ mês de pagamento) |
| `amount` | numeric(10,2) | M | valor recebido; gravado com `financial_settings.quota_amount` do momento |
| `status` | enum `pending\|paid\|late` | D | sempre `paid` (garantido por CHECK) — uma linha em `dues` é uma quota paga |
| `paid_at` | timestamptz | F | data de caixa |
| `created_at` | timestamptz | F | auditoria |

### 1.2 `charges` — encargos ad-hoc (seguro, equipamento, inscrições, viagens)

| Campo | Tipo | Uso | Notas |
|---|---|---|---|
| `id` | uuid | — | |
| `category_id` | uuid → `expense_categories.id` | D | permite cruzar receita e despesa da mesma categoria |
| `title` | text | D | ex.: "Seguro Desportivo 2026/2027" |
| `amount` | numeric(10,2) | M | valor **por jogador** (não é o total) |
| `due_date` | date | F | prazo-limite → base de "encargos vencidos" |
| `created_by` | uuid → `profiles.id` | D | quem lançou |
| `created_at` | timestamptz | F | |

### 1.3 `charge_players` — participantes de cada encargo

| Campo | Tipo | Uso | Notas |
|---|---|---|---|
| `charge_id` | uuid | D | |
| `player_id` | uuid | D | |
| — | — | M | `COUNT(*)` = nº de participantes → `totalExpected = charges.amount × COUNT(*)` |

### 1.4 `charge_payments` — pagamentos de encargos (suporta parciais e múltiplos)

| Campo | Tipo | Uso | Notas |
|---|---|---|---|
| `id` | uuid | — | |
| `charge_id` | uuid | D | |
| `player_id` | uuid | D | |
| `amount` | numeric(10,2) | M | pode ser parcial |
| `paid_at` | date | F | data de caixa |
| `notes` | text | D | texto livre (aparece na descrição do movimento) |
| `created_by` | uuid | D | |
| `created_at` | timestamptz | F | |

### 1.5 `transactions` — despesas e outras receitas (caixa do clube)

| Campo | Tipo | Uso | Notas |
|---|---|---|---|
| `id` | uuid | — | |
| `type` | enum `income\|expense` | D | eixo principal de receita/despesa |
| `amount` | numeric(10,2) | M | sempre positivo; o sinal vem de `type` |
| `description` | text | D | texto livre |
| `date` | date | F | data do movimento |
| `category_id` | uuid → `expense_categories.id` | D | **só preenchido em despesas** (a app força `null` em receitas) |
| `document_url` | text | D | caminho no bucket privado `finance_documents` → métrica de compliance ("% despesas com comprovativo") |
| `tournament_id` | uuid → `tournaments.id` | D | só em tranches de inscrição |
| `installment_index` | int | D | nº da tranche liquidada |
| `created_by` | uuid | D | |
| `created_at` | timestamptz | F | |

### 1.6 `insurance_payments` — **legado, não usar**

`id`, `player_id`, `season`, `amount`, `paid_at`, `notes`, `created_by`, `created_at`.
Substituída por `charges` + `charge_payments`; a app já não lê esta tabela. Excluir dos
dashboards para não duplicar receita.

---

## 2. Tabelas-dimensão

### 2.1 `expense_categories`

| Campo | Tipo | Uso | Notas |
|---|---|---|---|
| `id` | uuid | — | |
| `name` | text (único) | D | Material Desportivo, Material Médico, Inscrições em Torneios, Aluguer de Campo, Arbitragem, Transporte, Seguro Desportivo |
| `allow_income` | boolean | D | categoria que também aceita receita → permite o *saldo por categoria* (recebido − gasto) |
| `created_at` | timestamptz | F | define a ordem de apresentação dos grupos de movimentos |

### 2.2 `profiles` (dimensão Jogador — campos usados pelo Financeiro)

| Campo | Tipo | Uso | Notas |
|---|---|---|---|
| `id` | uuid | D | |
| `name`, `shirt_name` | text | D | rótulo (a app prefere `shirt_name`) |
| `jersey_number` | int | D | ordenação natural das listas |
| `status` | `active\|inactive\|injured` | D | `inactive` deixa de gerar meses de quota a partir de hoje |
| `quota_start_date` / `quota_end_date` | date | F | janela de elegibilidade; sobrepõe-se ao `status` quando preenchida |
| `position`, `birth_date`, `created_at` | — | D | dimensões extra (escalão etário, antiguidade) |
| `nif`, `iban`, `id_number`, `address`, `phone`, `medical_notes` | text | **PII** | nunca em dashboards — ver Riscos P0/P1 no `CLAUDE.md` |

### 2.3 `financial_settings` (linha única, `id = 1`) — parâmetros de cálculo

| Campo | Tipo | Uso | Notas |
|---|---|---|---|
| `season_start_month` / `season_end_month` | int 1-12 | F | definem a época (Set→Jul atravessa o ano civil) |
| `quota_amount` | numeric | M | valor unitário da quota — base de toda a previsão |
| `quota_excluded_months` | int[] | F | meses sem quota (por omissão Agosto) |
| `quota_due_day` | int 1-28 | F | dia a partir do qual a quota entra em incumprimento |
| `insurance_amount` | numeric | M | sugestão de valor ao criar o encargo de seguro |
| `insurance_deadline_month` / `_day` | int | F | prazo-limite do seguro |
| `updated_at` | timestamptz | — | |

### 2.4 `tournaments` — plano de inscrição (dentro de `rules` JSONB)

| Campo | Caminho | Uso | Notas |
|---|---|---|---|
| `name`, `season`, `status` | coluna | D | dimensão Prova |
| Valor total da inscrição | `rules.registration_fee.total` | M | |
| Valor da tranche | `rules.registration_fee.installments[].amount` | M | |
| Prazo da tranche | `rules.registration_fee.installments[].due_date` | F | base de "tranches vencidas por pagar" |
| Tranche liquidada | `rules.registration_fee.installments[].paid` | D | booleano |
| Despesa que a liquidou | `rules.registration_fee.installments[].transaction_id` | D | liga a `transactions` |

---

## 3. Modelo recomendado para dashboards (esquema em estrela)

O ecrã **Movimentos** já constrói, em memória, o facto único que unifica as três fontes de
dinheiro (`allMovements`, `FinancePage.tsx`). É esse o grão a materializar numa vista SQL:

| Campo do facto | Origem |
|---|---|
| `date` | `dues.paid_at` (fallback `month_year-01`) · `charge_payments.paid_at` · `transactions.date` |
| `amount` | `dues.amount` · `charge_payments.amount` · `transactions.amount` |
| `type` | `income` (quotas e encargos, sempre) · `transactions.type` |
| `description` | composta ("Quota de Setembro 2026 — Rui", "Seguro 2026/27 — Rui", ou `transactions.description`) |
| `category_key` / `category_label` | `quotas` · categoria do encargo · `income_other` · categoria da despesa · `no_category` |
| `player_id` | quotas e encargos (nulo nas transações) |
| `document_url` | só `transactions` |

Dimensões a cruzar: **Jogador**, **Categoria**, **Época**, **Mês/Ano**, **Prova**, **Tipo**,
**Origem** (quota/encargo/avulso), **Autor do lançamento**.

### 3.1 `v_financial_movements` — implementada

`supabase_finance_reporting_migration.sql` cria a vista com exatamente este grão:

| Coluna | Notas |
|---|---|
| `movement_id` | `due-<id>` · `charge-<id>` · `tx-<id>` — estável, serve de chave |
| `source_id`, `source` | id na tabela de origem; `quota` · `encargo` · `avulso` |
| `entry_date` | data de **caixa** |
| `accrual_date` | data de **competência** (nas quotas, o 1º dia do `month_year`) |
| `season` | `financial_season(accrual_date)` → `"2026/2027"` |
| `reference_month` | `YYYY-MM` (só quotas) |
| `type` | `income` · `expense` |
| `amount` / `signed_amount` | valor absoluto / com sinal (despesa negativa) — soma `signed_amount` para saldo |
| `category_id`, `category_key`, `category_label` | `key` inclui os baldes virtuais `quotas`, `income_other`, `no_category` |
| `player_id`, `player_label` | nulos nos movimentos avulsos |
| `tournament_id` | tranches de inscrição |
| `document_url`, `created_by`, `created_at` | |

**`security_invoker = true`** — a vista respeita a RLS de cada tabela de origem: um jogador vê
só as suas quotas e os seus pagamentos de encargos, e nenhuma transação; o admin vê tudo.
Sem isto a vista corria como o dono e furava a RLS.

```sql
-- KPIs da Visão Geral, em SQL
SELECT
  sum(signed_amount) FILTER (WHERE source = 'quota')                      AS quotas,
  sum(signed_amount) FILTER (WHERE source = 'encargo')                    AS encargos,
  sum(signed_amount) FILTER (WHERE source = 'avulso' AND type = 'income') AS outras_receitas,
  sum(signed_amount) FILTER (WHERE type = 'expense')                      AS despesas,
  sum(signed_amount)                                                      AS saldo
FROM public.v_financial_movements
WHERE season = public.financial_season(CURRENT_DATE);

-- Saldo por categoria (o "Seguro fecha a zero?")
SELECT category_label, sum(signed_amount) AS saldo
FROM public.v_financial_movements GROUP BY 1 ORDER BY 2;
```

### 3.2 `v_quota_status` — a matriz jogador × mês

Gera a linha que **não existe** em `dues` quando a quota não foi paga. É aqui — e só aqui —
que existe a noção de quota **por pagar**. Duas colunas de estado, para os dois tipos de
relatório: `status` (`paid` · `late` · `pending`, distingue o que já passou do prazo) e
`payment_status` (`paid` · `unpaid`, para quem só quer pago/por pagar). Mais `due_date` e
`owed_amount`. Espelha `getPlayerQuotaMonths` +
`computeQuotaMonthStatus`, incluindo a janela de elegibilidade e o excluir de Agosto.
Limitação: só a época corrente (`CURRENT_DATE`); para histórico, converter em função com
parâmetro de época.

```sql
SELECT player_label,
       count(*) FILTER (WHERE payment_status = 'paid')   AS pagos,
       count(*) FILTER (WHERE payment_status = 'unpaid') AS por_pagar,
       count(*) FILTER (WHERE status = 'late')           AS em_atraso,
       sum(owed_amount)                                  AS em_divida
FROM public.v_quota_status GROUP BY 1 ORDER BY em_divida DESC;
```

---

## 4. Campos calculados (já existem em código — não estão na BD)

### 4.1 Época e calendário (`src/lib/finance.ts`)

| Campo | Função | O que dá |
|---|---|---|
| `seasonLabel` | `getSeasonLabel()` | `"2026/2027"` — dimensão Época |
| meses da época | `getSeasonMonths()` | eixo temporal ordenado pela época, não pelo ano civil |
| meses de quota | `getQuotaMonthsForSeason()` | meses da época menos os excluídos |
| meses devidos por jogador | `getPlayerQuotaMonths()` | recorta pela janela de elegibilidade do jogador |
| prazo da quota | `getQuotaDueDate()` | `quota_due_day + 1` do próprio mês |
| prazo do seguro | `getInsuranceDeadline()` | |
| **estado do mês** | `computeQuotaMonthStatus()` | `paid` · `late` · `pending` — **a fonte de verdade** (em SQL, `v_quota_status`) |

### 4.2 Métricas por jogador (`quotaOverview`)

`paidCount` · `pendingCount` · `lateCount` · `totalPaid` (soma de `dues.amount`) ·
`totalOwed` (meses não pagos × `quota_amount`).

### 4.3 Métricas por encargo (`chargesWithStats`)

`participantIds` · `totalExpected` (`amount` × nº participantes) · `totalPaid` ·
em falta (`totalExpected − totalPaid`) · `categoryName`.

### 4.4 KPIs globais (Visão Geral)

| KPI | Fórmula |
|---|---|
| `totalQuotasReceived` | Σ `dues.amount` |
| `totalChargesReceived` | Σ `charge_payments.amount` |
| `totalIncomeOther` | Σ `transactions.amount` onde `type = income` |
| `totalReceived` | soma das três acima |
| `totalExpenses` | Σ `transactions.amount` onde `type = expense` |
| `netBalance` | `totalReceived − totalExpenses` — **Saldo Disponível** |
| `pendingChargesTotal` | Σ `max(0, totalExpected − totalPaid)` por encargo |
| `projectedQuotasTotal` | Σ (meses elegíveis × `quota_amount`) de todos os jogadores |
| `projectedSeasonTotal` | `projectedQuotasTotal + totalChargesReceived + pendingChargesTotal` |
| `receivedTowardsProjection` | `totalQuotasReceived + totalChargesReceived` |
| `projectionPct` | `receivedTowardsProjection / projectedSeasonTotal` |
| `receitaPorCategoria` | 3 baldes fixos: Quotas · Encargos · Outras Receitas |
| `despesaPorCategoria` | top 5 categorias + "Outras" |
| `filteredIncomeTotal` / `filteredExpenseTotal` | totais dos movimentos filtrados (ano/mês) |
| `groupTotal` | saldo por categoria nos Movimentos (receita − despesa) |

---

## 5. Filtros hoje disponíveis na UI

Ano (`movementYears`, derivado dos dados) · Mês (1-12) · Categoria (agrupamento colapsável) ·
Jogador (expansão de linha) · Época (implícita, sempre a época atual).

---

## 6. Lacunas — estado

| # | Lacuna | Estado |
|---|---|---|
| 1 | Quota não paga **não tem linha** em `dues` | ✅ **resolvido** — vista `v_quota_status` (só época corrente) |
| 2 | Sem **método de pagamento** (MB Way, transferência, numerário) | ⛔ **fora de âmbito por decisão** — o clube não regista como o dinheiro entrou |
| 3 | Sem **época** nos factos | ✅ **resolvido** — função `public.financial_season(date)` + coluna `season` na vista (derivada, não denormalizada) |
| 4 | `dues` sem `created_by` | ✅ **resolvido** — coluna acrescentada e preenchida pela app |
| 5 | Categoria proibida nas receitas | ✅ **resolvido** — restrição era da app; agora oferece as categorias com `allow_income` |
| 6 | `dues.status` fora de sincronia com o estado real | ✅ **resolvido** — em `dues` uma linha é sempre uma quota paga: `DEFAULT 'paid'` + `CHECK (status = 'paid')`. O "por pagar" está em `v_quota_status` |
| 7 | Plano de inscrição em JSONB (`tournaments.rules`) | ⬜ não é agregável em SQL sem *jsonb gymnastics*; tabela `tournament_installments` |
| 8 | Sem soft-delete/histórico | ⬜ apagar um pagamento apaga a história; auditoria ou `deleted_at` |
| 9 | Agregação 100 % client-side | ✅ **resolvido** — a página lê `v_quota_status` e `v_financial_movements`; deixou de carregar `dues` inteira e de somar em JS |
| 10 | `profiles` legível por qualquer autenticado (IBAN/NIF) | ✅ **resolvido** — `v_players_public` + RLS fechada (`supabase_profiles_pii_migration.sql`) |

---

## 7. Dashboards que os campos atuais já suportam sem alterações à BD

1. **Saldo e tesouraria** — `netBalance`, recebido vs. despesas, evolução mensal do saldo acumulado.
2. **Cobrança de quotas** — % de meses pagos por época, matriz jogador × mês, top devedores por `totalOwed`, aging por `getQuotaDueDate`.
3. **Encargos** — taxa de cobrança por encargo (`totalPaid / totalExpected`), encargos vencidos (`due_date < hoje`), pagamentos parciais.
4. **Despesa por categoria** — top 5 + Outras, e saldo por categoria (receita de encargo − despesa da mesma categoria, o caso "Seguro").
5. **Provas** — custo de inscrição por torneio, tranches por pagar e vencidas.
6. **Compliance** — % de despesas com `document_url`, despesas sem categoria.
7. **Previsão da época** — realizado vs. previsto (`projectionPct`) e valor em falta até ao fim da época.


---

## 8. Ficheiros

| Ficheiro | O que traz |
|---|---|
| `supabase_finance_reporting_migration.sql` | `dues.created_by` · `dues.status` coerente · `financial_season()` · `nome_mes_ano()` · `v_financial_movements` · `v_quota_status` · índices |
| `supabase_profiles_pii_migration.sql` | `v_players_public` · RLS de `profiles` fechada · `find_my_profile_match()` · `associate_my_profile()` |
| `src/pages/FinancePage.tsx` | consome as duas vistas em vez de agregar em JS; escreve `created_by` nas quotas; categoria também nas receitas |
| `CalendarPage` · `EventsPage` · `StatsPage` · `AdminDashboard` · `MatchReportModal` · `AutoAssociationModal` · `AuthContext` | passam a ler o plantel por `v_players_public`; a associação de conta usa as duas funções |

A migração é idempotente e foi validada num PostgreSQL 16 local contra `supabase_schema.sql`,
incluindo o teste de RLS com um utilizador `player` e um `admin`.
