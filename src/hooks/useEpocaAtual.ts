import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { comOmissoes, getSeasonLabel } from '../lib/finance'

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
  const [epoca, setEpoca] = useState(() => getSeasonLabel(comOmissoes(null)))
  useEffect(() => {
    let cancelado = false
    supabase.from('financial_settings').select('*').maybeSingle().then(({ data }) => {
      if (!cancelado && data) setEpoca(getSeasonLabel(comOmissoes(data)))
    })
    return () => { cancelado = true }
  }, [])
  return epoca
}

export default useEpocaAtual
