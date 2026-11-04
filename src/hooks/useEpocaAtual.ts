import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { comOmissoes, getSeasonLabel } from '../lib/finance'
import type { FinancialSettings } from '../lib/finance'

const CACHE_TTL_MS = 30_000
let cacheDefinicoes: { timestamp: number; data: Partial<FinancialSettings> | null } | null = null
let pedidoDefinicoesEmCurso: Promise<{ data: Partial<FinancialSettings> | null }> | null = null

/**
 * Obtém as definições financeiras com deduplicação de pedidos concorrentes e cache curta,
 * evitando que o cabeçalho (useEpocaAtual + SinalPagamentos) dispare queries duplicadas.
 */
export async function obterDefinicoesFinanceiras(): Promise<{ data: Partial<FinancialSettings> | null }> {
  const agora = Date.now()
  if (cacheDefinicoes && agora - cacheDefinicoes.timestamp < CACHE_TTL_MS) {
    return { data: cacheDefinicoes.data }
  }
  if (pedidoDefinicoesEmCurso) {
    return pedidoDefinicoesEmCurso
  }

  pedidoDefinicoesEmCurso = Promise.resolve(
    supabase
      .from('financial_settings')
      .select('*')
      .maybeSingle(),
  )
    .then(({ data }) => {
      const resultado = (data as Partial<FinancialSettings> | null) ?? null
      cacheDefinicoes = { timestamp: Date.now(), data: resultado }
      return { data: resultado }
    })
    .catch(() => ({ data: null }))
    .finally(() => {
      pedidoDefinicoesEmCurso = null
    })

  return pedidoDefinicoesEmCurso
}

/**
 * A época em curso ("2026/2027") — a do Financeiro, com a regra de
 * `getSeasonLabel()`, que é a mesma do `financial_season()` da base.
 *
 * Vem logo com a regra por omissão, para quem a mostra não ficar com uma linha
 * vazia, e acerta-se quando chegam as definições financeiras
 * (`season_start_month`). É a época do cabeçalho da app, e a dos documentos
 * que se renovam todas as épocas — a apólice do seguro e o atestado médico.
 */
export function useEpocaAtual(): string {
  const [epoca, setEpoca] = useState(() => getSeasonLabel(comOmissoes(cacheDefinicoes?.data ?? null)))
  useEffect(() => {
    let cancelado = false
    obterDefinicoesFinanceiras().then(({ data }) => {
      if (!cancelado && data) setEpoca(getSeasonLabel(comOmissoes(data)))
    })
    return () => { cancelado = true }
  }, [])
  return epoca
}

export default useEpocaAtual
