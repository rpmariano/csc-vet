/**
 * Os tipos que a página financeira e os seus blocos partilham.
 *
 * Estavam todos dentro de `FinancePage.tsx`. Saíram para aqui quando a Visão
 * Geral passou a ficheiro próprio: um bloco que importe tipos da página que o
 * importa fecha um ciclo, e mesmo sendo só tipos (apagados na compilação) é
 * uma dependência ao contrário — o bloco é que é a folha.
 */
import type { UserRole } from '../../context/AuthContext'

export interface PlayerRow {
  id: string
  name: string
  shirt_name?: string | null
  jersey_number?: number | null
  status?: string | null
  quota_start_date?: string | null
  quota_end_date?: string | null
  role: UserRole
  roles?: UserRole[] | null
}

/**
 * Linhas de `public.v_quota_status` — a matriz jogador × mês da época corrente.
 * É aqui que existe a quota POR PAGAR: na tabela `dues` só há linha para as pagas.
 */
export interface QuotaStatusRow {
  player_id: string
  month_year: string
  expected_amount: number
  due_id: string | null
  paid_amount: number | null
  due_date: string
  status: 'paid' | 'late' | 'pending'
  owed_amount: number
}

/**
 * Linhas de `public.v_financial_movements` — o facto único do módulo: quotas,
 * pagamentos de encargos e despesas/receitas avulsas, já com época, categoria
 * e jogador resolvidos. `signed_amount` é o único campo com sinal: as despesas
 * entram negativas, tudo o resto positivo.
 */
export interface MovementRow {
  movement_id: string
  source: 'quota' | 'encargo' | 'avulso'
  entry_date: string
  season: string | null
  type: 'income' | 'expense'
  amount: number
  signed_amount: number
  description: string
  category_key: string
  category_label: string
  document_url: string | null
}

/**
 * Uma linha de "Pagamentos Programados" — despesa já certa mas ainda por
 * pagar, venha de uma tranche de inscrição em torneio ou do valor a pagar a
 * terceiros de um encargo-intermediário. Guarda dados simples (não uma ação
 * já feita) para o useMemo que a constrói não depender de handlePayInstallment/
 * handlePayChargePayable — funções recriadas a cada render, seriam sempre
 * "dependências desatualizadas" do memo.
 */
export interface ScheduledPayment {
  key: string
  title: string
  categoryLabel: string | null
  amount: number
  due_date: string | null
  source: 'tournament' | 'charge'
  tournamentId?: string
  tournamentName?: string
  installmentIndex?: number
  chargeId?: string
}

/**
 * O que falta receber de um encargo já criado, com o prazo em que se espera.
 * É o mínimo de que a projeção do saldo precisa dos encargos — não o objeto
 * inteiro com participantes e pagamentos.
 */
export interface EncargoPorReceber {
  id: string
  dueDate: string | null
  amount: number
}
