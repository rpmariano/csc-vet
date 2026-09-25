import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BotaoVoltar } from './ui'
import { haEntradaAnterior } from '../lib/rotas'

/**
 * O "‹" de um ecrã com rota própria aberto a partir de outro — o Plantel, os
 * Eventos e o Financeiro, que se abrem das linhas do Clube.
 *
 * As secções do Clube (`?ver=`) tinham "‹ Clube"; estas três, na mesma lista,
 * não tinham nada, e de lá só se voltava pela barra de baixo. Só aparece
 * quando quem abriu disse de onde (`state.origem`) e há para onde voltar
 * nesta visita: a mesma rota aberta pela barra, ou por um link, fica sem ele.
 *
 * Quem troca parâmetros com `replace` nestes ecrãs (os separadores do
 * Financeiro) tem de passar o `state` adiante, senão o "‹" desaparece.
 */
export const VoltarAOrigem: React.FC = () => {
  const { state } = useLocation()
  const navegar = useNavigate()
  const origem = (state as { origem?: unknown } | null)?.origem
  if (typeof origem !== 'string' || !origem || !haEntradaAnterior()) return null
  return <BotaoVoltar para={origem} aoVoltar={() => navegar(-1)} />
}

export default VoltarAOrigem
