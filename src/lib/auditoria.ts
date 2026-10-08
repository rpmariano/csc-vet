import { supabase } from './supabaseClient'

export type AcaoAuditoria = 'INSERT' | 'UPDATE' | 'DELETE' | string

export interface AuditLog {
  id: string
  created_at: string
  user_id: string | null
  user_name: string | null
  user_email: string | null
  user_role: string | null
  action: AcaoAuditoria
  table_name: string
  record_id: string
  record_title: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changes: Record<string, { antigo?: unknown; novo?: unknown }> | Record<string, unknown> | null
  description: string | null
}

export const MODULOS_AUDITORIA: Record<string, { nome: string; tabelas: string[] }> = {
  todos: {
    nome: 'Todos',
    tabelas: [],
  },
  plantel: {
    nome: 'Plantel',
    tabelas: ['profiles'],
  },
  convocatorias: {
    nome: 'Convocatórias',
    tabelas: ['callups'],
  },
  eventos: {
    nome: 'Eventos e Jogos',
    tabelas: ['events'],
  },
  comunicados: {
    nome: 'Comunicados',
    tabelas: ['announcements'],
  },
  financas: {
    nome: 'Finanças e Quotas',
    tabelas: ['dues', 'transactions', 'charges', 'charge_payments'],
  },
  clube: {
    nome: 'Clube e Competições',
    tabelas: ['club_settings', 'tournaments', 'opponents', 'fields'],
  },
}

export const NOMES_TABELAS: Record<string, string> = {
  profiles: 'Plantel / Membros',
  events: 'Eventos / Jogos',
  callups: 'Convocatórias',
  announcements: 'Comunicados',
  dues: 'Quotas',
  transactions: 'Transações',
  charges: 'Encargos',
  charge_payments: 'Pagamento de encargos',
  club_settings: 'Dados do Clube',
  tournaments: 'Torneios',
  opponents: 'Adversários',
  fields: 'Campos',
}

export const NOMES_CAMPOS: Record<string, string> = {
  name: 'Nome',
  shirt_name: 'Nome na camisola',
  nickname: 'Alcunha',
  email: 'Email',
  phone: 'Telefone',
  role: 'Papel principal',
  roles: 'Papéis',
  status: 'Estado',
  jersey_number: 'N.º da camisola',
  position: 'Posição',
  preferred_foot: 'Pé preferido',
  birth_date: 'Data de nascimento',
  nationality: 'Nacionalidade',
  kit_size: 'Tamanho de equipamento',
  address: 'Morada',
  postal_code: 'Código postal',
  city: 'Localidade',
  nif: 'NIF',
  id_number: 'N.º cartão de cidadão',
  id_card_expiry: 'Validade do CC',
  iban: 'IBAN',
  member_number: 'N.º de sócio',
  quota_start_date: 'Início de quota',
  quota_end_date: 'Fim de quota',
  title: 'Título',
  description: 'Descrição',
  date_time: 'Data e hora',
  type: 'Tipo',
  is_active: 'Ativo',
  home_away: 'Casa / Fora',
  opponent_id: 'Adversário',
  field_id: 'Campo',
  amount: 'Valor (€)',
  month_year: 'Mês/Ano',
  due_date: 'Data limite',
  payable_amount: 'Valor a pagar',
  payable_paid: 'Pago',
  is_intermediary: 'Intermediário',
  category_id: 'Categoria',
  season: 'Época',
  target_audience: 'Público-alvo',
}

export const formatarValorCampo = (campo: string, valor: unknown): string => {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (Array.isArray(valor)) {
    if (valor.length === 0) return '—'
    return valor.join(', ')
  }

  if (campo === 'role' || campo === 'roles') {
    const mapa: Record<string, string> = {
      player: 'Jogador',
      coach: 'Equipa técnica',
      admin: 'Direção',
      supporter: 'Adepto',
    }
    return mapa[String(valor)] || String(valor)
  }

  if (campo === 'status') {
    const mapa: Record<string, string> = {
      active: 'Apto',
      injured: 'Lesionado',
      inactive: 'Inativo',
      called: 'Convocado',
      confirmed: 'Confirmou',
      declined: 'Recusou',
      pending: 'Pendente',
      paid: 'Pago',
      late: 'Em atraso',
    }
    return mapa[String(valor)] || String(valor)
  }

  if (campo === 'target_audience') {
    const mapa: Record<string, string> = {
      all: 'Todos (incluindo adeptos)',
      squad_only: 'Apenas Plantel (sem adeptos)',
      players: 'Apenas Jogadores',
      coaches: 'Apenas Equipa técnica',
      supporters: 'Apenas Adeptos',
    }
    return mapa[String(valor)] || String(valor)
  }

  if (typeof valor === 'object') {
    try {
      return JSON.stringify(valor)
    } catch {
      return String(valor)
    }
  }

  return String(valor)
}

export interface FiltrosAuditoria {
  modulo?: string
  acao?: string
  procura?: string
  limite?: number
}

/**
 * Consulta a lista de logs de auditoria no Supabase com filtros.
 */
export async function obterAuditLogs(filtros: FiltrosAuditoria = {}): Promise<{
  logs: AuditLog[]
  error: Error | null
}> {
  try {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (filtros.limite) {
      query = query.limit(filtros.limite)
    } else {
      query = query.limit(100)
    }

    if (filtros.modulo && filtros.modulo !== 'todos') {
      const tabelas = MODULOS_AUDITORIA[filtros.modulo]?.tabelas ?? []
      if (tabelas.length > 0) {
        query = query.in('table_name', tabelas)
      }
    }

    if (filtros.acao && filtros.acao !== 'todas') {
      query = query.eq('action', filtros.acao.toUpperCase())
    }

    const { data, error } = await query

    if (error) {
      console.error('[auditoria] Erro ao consultar audit_logs:', error)
      return { logs: [], error: new Error(error.message) }
    }

    return { logs: (data as AuditLog[]) || [], error: null }
  } catch (err) {
    console.error('[auditoria] Exceção ao carregar auditoria:', err)
    return { logs: [], error: err instanceof Error ? err : new Error(String(err)) }
  }
}

/**
 * Regista manualmente um evento de auditoria de nível de aplicação.
 */
export async function registarAuditoriaManual(params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | string
  tableName: string
  recordId: string
  recordTitle?: string
  description: string
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabase.rpc('registar_auditoria_app', {
      p_action: params.action,
      p_table_name: params.tableName,
      p_record_id: params.recordId,
      p_record_title: params.recordTitle || params.recordId,
      p_description: params.description,
      p_details: params.details || {},
    })
  } catch {
    // Ignorar erro silenciosamente para não bloquear fluxos de utilizador
  }
}
