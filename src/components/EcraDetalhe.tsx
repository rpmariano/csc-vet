import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { BotaoVoltar, CabecalhoEcra } from './ui'

/**
 * O ecrã de uma entidade — um jogo, um atleta, um evento, um adversário.
 *
 * **Uma ficha com nome próprio não é persiana, é ecrã.** Até 2026-09-25 as
 * seis fichas da app abriam numa `VistaDetalhe`, que era um `BottomSheet`: um
 * diálogo modal a 90% da altura, com scroll próprio. Para uma ficha que se lê
 * de cima a baixo isso custava três coisas — quem usa leitor de ecrã lia-a
 * dentro de uma caixa sem título principal nem regiões para onde saltar; com o
 * texto a 200% sobrava uma fresta; e o que se abria dentro dela (a ficha do
 * convocado, o Editar da ficha de jogo) empilhava diálogo sobre diálogo. A
 * persiana ficou para o que é um olhar rápido por cima do que se está a fazer:
 * filtros, escolher, confirmar, o que um atleta deve.
 *
 * **Continua a ir no endereço** (`?atleta=`, `?jogo=`…), e por isso os links
 * partilhados continuam a abrir e o retroceder do browser continua a voltar.
 *
 * **A lista não é desmontada, é escondida.** A página que abre a ficha fica
 * montada por baixo — com o estado, os dados carregados e o elemento que foi
 * tocado —, e a moldura (`<AreaDoEcra>`, no `Layout`) esconde-a enquanto a
 * ficha estiver aberta. A ficha é desenhada ao lado, por portal. Ao voltar, a
 * lista reaparece no sítio onde estava e o foco regressa a quem abriu.
 *
 * Esconder a página esconderia também os diálogos que ela abre por cima da
 * ficha (o formulário de edição, uma confirmação), que são `fixed` e vivem na
 * árvore da página. Ver `.pagina-por-baixo` em `index.css`.
 */

interface ContextoArea {
  alvo: HTMLElement | null
  /** Quem está no topo: só esse se vê. */
  topo: object | null
  abrir: (quem: object) => void
  fechar: (quem: object) => void
}

const ContextoAreaDoEcra = createContext<ContextoArea | null>(null)

/**
 * A área do ecrã: o conteúdo da rota e, ao lado, o sítio onde uma ficha se
 * desenha. Vive no `Layout`, à volta do `<Outlet>`.
 *
 * **As fichas empilham-se como páginas.** Da ficha de um evento abre-se a
 * ficha de jogo; só a de cima se vê, e voltar dela devolve a de baixo tal como
 * estava — no mesmo sítio do scroll, como a lista quando se volta ao início.
 */
export const AreaDoEcra: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alvo, setAlvo] = useState<HTMLElement | null>(null)
  const [pilha, setPilha] = useState<object[]>([])
  const { pathname } = useLocation()

  /* Onde estava o ecrã de baixo quando cada ficha abriu, e em que caminho. O
     caminho conta: sair da ficha pela barra de baixo também a fecha, e aí
     quem manda no scroll é o `SubirAoTopo`, não a posição antiga de outro
     ecrã. */
  const lugares = useRef(new Map<object, { y: number; pathname: string }>())
  const aRepor = useRef<{ y: number; pathname: string } | null>(null)
  const caminhoAtual = useRef(pathname)
  caminhoAtual.current = pathname

  const abrir = useCallback((quem: object) => {
    // Chamado no efeito de layout da ficha, antes de o ecrã de baixo se
    // esconder: o scroll ainda é o dele.
    lugares.current.set(quem, { y: window.scrollY, pathname: caminhoAtual.current })
    aRepor.current = null
    setPilha(p => [...p, quem])
  }, [])

  const fechar = useCallback((quem: object) => {
    aRepor.current = lugares.current.get(quem) ?? null
    lugares.current.delete(quem)
    setPilha(p => p.filter(q => q !== quem))
  }, [])

  const topo = pilha.length > 0 ? pilha[pilha.length - 1] : null

  useLayoutEffect(() => {
    const antes = aRepor.current
    aRepor.current = null
    if (antes) {
      if (antes.pathname === caminhoAtual.current) window.scrollTo(0, antes.y)
    } else if (topo) {
      window.scrollTo(0, 0)
    }
  }, [topo])

  return (
    <ContextoAreaDoEcra.Provider value={{ alvo, topo, abrir, fechar }}>
      {/* Sem `aria-hidden`: esconderia também os diálogos abertos por cima da
          ficha, que vivem aqui dentro. O `visibility: hidden` da classe já tira
          a lista da árvore de acessibilidade e da ordem do Tab. */}
      <div className={topo ? 'pagina-por-baixo' : undefined}>
        {children}
      </div>
      <div ref={setAlvo} />
    </ContextoAreaDoEcra.Provider>
  )
}

export interface EcraDetalheProps {
  aberto: boolean
  /** Nome do ecrã para onde o "‹" volta — "Plantel", "Agenda". */
  voltarPara: string
  aoVoltar: () => void
  titulo: string
  /** Linha pequena e dourada no canto — o que isto é ("Ficha de jogo"). */
  sobrancelha?: string
  legenda?: string
  /** Ações no canto do cabeçalho, antes da fotografia. */
  acoes?: React.ReactNode
  children?: React.ReactNode
}

export const EcraDetalhe: React.FC<EcraDetalheProps> = ({
  aberto,
  voltarPara,
  aoVoltar,
  titulo,
  sobrancelha,
  legenda,
  acoes,
  children,
}) => {
  const area = useContext(ContextoAreaDoEcra)
  const raiz = useRef<HTMLElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)
  const [eu] = useState(() => ({}))
  const idTitulo = useId()

  const registar = area?.abrir
  const desregistar = area?.fechar

  useLayoutEffect(() => {
    if (!aberto || !registar || !desregistar) return
    focoAnterior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    registar(eu)
    return () => {
      desregistar(eu)
      /* O foco volta a quem abriu a ficha, que continua montado por baixo.
         Só depois de a lista reaparecer — escondida, não aceita foco. */
      const quem = focoAnterior.current
      focoAnterior.current = null
      requestAnimationFrame(() => {
        if (quem && quem.isConnected && document.activeElement === document.body) {
          quem.focus({ preventScroll: true })
        }
      })
    }
  }, [aberto, registar, desregistar, eu])

  /* O foco entra pelo título, como numa página nova: um leitor de ecrã
     anuncia o nome, e o Tab seguinte é o primeiro controlo da ficha. */
  /* Só da primeira vez que fica no topo: enquanto não está, está escondida e
     não aceita foco; e quando volta ao topo, ao fechar-se a de cima, o foco
     é devolvido a quem a abriu, não ao título. */
  const noTopo = area?.topo === eu
  const jaFocou = useRef(false)
  useLayoutEffect(() => {
    if (!aberto) {
      jaFocou.current = false
      return
    }
    if (!noTopo || jaFocou.current) return
    jaFocou.current = true
    const h1 = raiz.current?.querySelector('h1')
    if (h1) {
      h1.setAttribute('tabindex', '-1')
      h1.focus({ preventScroll: true })
    }
  }, [aberto, noTopo])

  if (!aberto || !area?.alvo) return null

  return createPortal(
    /* Uma região com o nome do título: é por ela que um leitor de ecrã (e um
       teste) encontra a ficha. Uma ficha tapada por outra fica montada, como
       a lista por baixo. */
    <section
      ref={raiz}
      aria-labelledby={idTitulo}
      className={noTopo ? undefined : 'pagina-por-baixo'}
    >
      <BotaoVoltar para={voltarPara} aoVoltar={aoVoltar} />
      <CabecalhoEcra
        titulo={titulo}
        idTitulo={idTitulo}
        sobrancelha={sobrancelha}
        legenda={legenda}
        acoes={acoes}
        className="mb-4"
      />
      {children}
    </section>,
    area.alvo,
  )
}

export default EcraDetalhe
