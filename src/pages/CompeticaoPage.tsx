import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FilaSeparadores, CabecalhoEcra } from '../components/ui'
import { StandingsPage } from './StandingsPage'
import MatchReportsPage from './MatchReportsPage'
import StatsPage from './StatsPage'

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
 * **Quem escreve no endereço aqui dentro tem de acrescentar, não substituir** —
 * um `setSearchParams({ x })` numa das três páginas apaga o `?ver=` e faz o
 * ecrã saltar para o primeiro separador.
 *
 * O conteúdo é, para já, o das páginas existentes tal como estão — ainda com
 * o aspeto claro. São redesenhadas na fase 4; o que muda aqui é onde vivem.
 *
 * As três são importadas diretamente e não por `React.lazy`. Não é só por
 * serem o próprio conteúdo deste ecrã (a Competição já vem no seu pedaço de
 * código): com um `<Suspense>` aqui dentro, a atualização de localização do
 * React Router deixava de ser confirmada e o retroceder do browser passava a
 * não fechar a persiana da ficha de jogo — de forma intermitente noutros
 * ecrãs, sempre neste. Ver o risco P2 no CLAUDE.md.
 */

const SEPARADORES = ['Classificações', 'Fichas de Jogo', 'Estatísticas'] as const

/** Valor no endereço para cada separador — estável, ao contrário do índice. */
const CHAVES = ['classificacoes', 'fichas', 'estatisticas'] as const


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
      <CabecalhoEcra titulo="Competição" sobrancelha="Época em curso" className="mb-4" />

      <FilaSeparadores
        itens={SEPARADORES}
        ativo={ativo}
        onEscolher={escolher}
        ariaLabel="Secções da competição"
        idPainel="painel-competicao"
        className="mb-4"
      />

      <div id="painel-competicao" role="tabpanel" aria-labelledby={`painel-competicao-sep-${ativo}`}>
        {ativo === 0 && <StandingsPage />}
        {ativo === 1 && <MatchReportsPage />}
        {ativo === 2 && <StatsPage />}
      </div>
    </div>
  )
}

export default CompeticaoPage
