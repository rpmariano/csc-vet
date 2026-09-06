import React, { Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FilaSeparadores, TituloEcra } from '../components/ui'

/**
 * Competição — o terceiro lugar da barra do jogador.
 *
 * Junta num só ecrã as três páginas que estavam soltas na navegação:
 * classificações, fichas de jogo e estatísticas. Não são três sítios
 * diferentes — são três formas de olhar para a mesma época, e como tal
 * pertencem a separadores e não a entradas de menu.
 *
 * O separador escolhido vai no endereço (`?ver=`), para o retroceder do
 * browser funcionar e para se poder mandar um link direto às classificações.
 *
 * O conteúdo é, para já, o das páginas existentes tal como estão — ainda com
 * o aspeto claro. São redesenhadas na fase 4; o que muda aqui é onde vivem.
 */

const SEPARADORES = ['Classificações', 'Fichas de Jogo', 'Estatísticas'] as const

/** Valor no endereço para cada separador — estável, ao contrário do índice. */
const CHAVES = ['classificacoes', 'fichas', 'estatisticas'] as const

const StandingsPage = React.lazy(() =>
  import('./StandingsPage').then(m => ({ default: m.StandingsPage })),
)
const MatchReportsPage = React.lazy(() => import('./MatchReportsPage'))
const StatsPage = React.lazy(() => import('./StatsPage'))

const ACarregar: React.FC = () => (
  <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
    <div className="animate-spin rounded-full h-9 w-9 border-2 border-csc-gold border-t-transparent" />
    <span className="sr-only">A carregar…</span>
  </div>
)

const CompeticaoPage: React.FC = () => {
  const [params, setParams] = useSearchParams()

  const ativo = useMemo(() => {
    const i = CHAVES.indexOf((params.get('ver') ?? '') as (typeof CHAVES)[number])
    return i >= 0 ? i : 0
  }, [params])

  const escolher = (indice: number) => {
    const seguintes = new URLSearchParams(params)
    seguintes.set('ver', CHAVES[indice])
    // `replace`: andar entre separadores não deve encher o histórico — quem
    // carrega em retroceder quer sair da Competição, não desfazer três
    // toques nos separadores.
    setParams(seguintes, { replace: true })
  }

  return (
    <div className="relative">
      <TituloEcra className="mb-4">Competição</TituloEcra>

      <FilaSeparadores
        itens={SEPARADORES}
        ativo={ativo}
        onEscolher={escolher}
        ariaLabel="Secções da competição"
        idPainel="painel-competicao"
        className="mb-4"
      />

      <div id="painel-competicao" role="tabpanel" aria-labelledby={`painel-competicao-sep-${ativo}`}>
        <Suspense fallback={<ACarregar />}>
          {ativo === 0 && <StandingsPage />}
          {ativo === 1 && <MatchReportsPage />}
          {ativo === 2 && <StatsPage />}
        </Suspense>
      </div>
    </div>
  )
}

export default CompeticaoPage
