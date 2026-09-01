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
| `status` | enum `pending\|paid\|late` | D | na prática sempre `paid` — o estado real é calculado (ver §4) |
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

> Sugestão: criar uma vista `public.v_financial_movements` com este grão. Hoje a agregação é
> toda client-side (a página carrega 9 tabelas inteiras e soma em JS); uma vista torna os KPIs
> reutilizáveis pelo `AdminDashboard` e pelo `Home` sem duplicar lógica.

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
| **estado do mês** | `computeQuotaMonthStatus()` | `paid` · `late` · `pending` — **a fonte de verdade**, não `dues.status` |

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

## 6. Lacunas — o que falta para reporting sério

| # | Lacuna | Impacto | Correção sugerida |
|---|---|---|---|
| 1 | Quota não paga **não tem linha** em `dues` | dívida e aging só existem em JS; impossível em SQL puro | vista que gera a matriz jogador × mês da época |
| 2 | Sem **método de pagamento** (MB Way, transferência, numerário) | não dá para reconciliar com o banco | `payment_method` em `dues`, `charge_payments`, `transactions` |
| 3 | Sem **época** materializada nos factos | agrupar por época obriga a recalcular do lado do cliente | coluna `season` (ou vista com `getSeasonLabel` em SQL) |
| 4 | `dues` sem `created_by` | sem rasto de quem registou a quota | acrescentar coluna |
| 5 | `transactions.category_id` forçado a `null` nas receitas | receita avulsa cai toda em "Outras Receitas" | permitir categoria nas receitas com `allow_income` |
| 6 | `dues.status` fora de sincronia com o estado real | dashboards que leiam a coluna dão números errados | usar sempre `computeQuotaMonthStatus`; ou coluna gerada |
| 7 | Plano de inscrição em JSONB (`tournaments.rules`) | não é agregável em SQL sem `jsonb` gymnastics | tabela `tournament_installments` |
| 8 | Sem soft-delete/histórico | apagar um pagamento apaga a história | tabela de auditoria ou `deleted_at` |
| 9 | Agregação 100 % client-side (9 tabelas completas por render) | não escala e duplica lógica entre páginas | vistas + RPC |
| 10 | `profiles` legível por qualquer autenticado (IBAN/NIF) | um dashboard que junte `profiles` expõe PII | vista `v_players_public` só com campos de reporting |

---

## 7. Dashboards que os campos atuais já suportam sem alterações à BD

1. **Saldo e tesouraria** — `netBalance`, recebido vs. despesas, evolução mensal do saldo acumulado.
2. **Cobrança de quotas** — % de meses pagos por época, matriz jogador × mês, top devedores por `totalOwed`, aging por `getQuotaDueDate`.
3. **Encargos** — taxa de cobrança por encargo (`totalPaid / totalExpected`), encargos vencidos (`due_date < hoje`), pagamentos parciais.
4. **Despesa por categoria** — top 5 + Outras, e saldo por categoria (receita de encargo − despesa da mesma categoria, o caso "Seguro").
5. **Provas** — custo de inscrição por torneio, tranches por pagar e vencidas.
6. **Compliance** — % de despesas com `document_url`, despesas sem categoria.
7. **Previsão da época** — realizado vs. previsto (`projectionPct`) e valor em falta até ao fim da época.
