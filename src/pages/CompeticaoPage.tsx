import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FilaSeparadores, CabecalhoEcra } from '../components/ui'
import { StandingsPage } from './StandingsPage'
import MatchReportsPage from './MatchReportsPage'
import StatsPage from './StatsPage'
import MvpPage from './MvpPage'
import { useAuth } from '../context/AuthContext'
import { temAcessoMVP } from '../lib/mvp'

const SEPARADORES_BASE = ['Classificações', 'Fichas de Jogo', 'Estatísticas'] as const
const CHAVES_BASE = ['classificacoes', 'fichas', 'estatisticas'] as const

const CompeticaoPage: React.FC = () => {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()

  const temAcesso = useMemo(() => temAcessoMVP(profile), [profile])

  const separadores = useMemo(() => {
    return temAcesso ? [...SEPARADORES_BASE, 'MVP'] : [...SEPARADORES_BASE]
  }, [temAcesso])

  const chaves = useMemo(() => {
    return temAcesso ? [...CHAVES_BASE, 'mvp'] : [...CHAVES_BASE]
  }, [temAcesso])

  const ativo = useMemo(() => {
    const chave = params.get('ver') ?? ''
    const i = chaves.indexOf(chave)
    return i >= 0 ? i : 0
  }, [params, chaves])

  const escolher = (indice: number) => {
    const seguintes = new URLSearchParams(params)
    seguintes.set('ver', chaves[indice])
    // `replace`: andar entre separadores não deve encher o histórico — quem
    // carrega em retroceder quer sair da Competição, não desfazer três
    // toques nos separadores.
    setParams(seguintes, { replace: true })
  }

  return (
    <div className="relative">
      <CabecalhoEcra titulo="Competição" sobrancelha="Época em curso" />

      <FilaSeparadores
        itens={separadores}
        ativo={ativo}
        onEscolher={escolher}
        ariaLabel="Secções da competição"
        idPainel="painel-competicao"
        className="mb-4"
      />

      <div id="painel-competicao" role="tabpanel" aria-labelledby={`painel-competicao-sep-${ativo}`}>
        {chaves[ativo] === 'classificacoes' && <StandingsPage />}
        {chaves[ativo] === 'fichas' && <MatchReportsPage />}
        {chaves[ativo] === 'estatisticas' && <StatsPage />}
        {chaves[ativo] === 'mvp' && temAcesso && <MvpPage />}
      </div>
    </div>
  )
}

export default CompeticaoPage
