import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * O realce que corre por trás dos itens — a "minhoca" do redesenho.
 *
 * O truque é não animar um bloco de largura fixa a deslizar: é animar as duas
 * arestas com tempos diferentes. A aresta da frente parte logo e chega
 * depressa; a de trás sai `.18s` mais tarde e demora mais. No meio do
 * percurso o bloco está esticado, e é isso que dá a sensação de a marca ser
 * puxada em vez de arrastada. Ao recuar, as propriedades trocam de papel.
 *
 * Por isso o realce é posicionado por `left` **e** `right`, e nunca por
 * `width` ou `transform` — só com as duas arestas separadas é que cada uma
 * pode ter a sua duração.
 *
 * Serve os dois sítios onde o gesto aparece: a barra de navegação inferior
 * (realce dourado) e as filas de separadores das páginas (verde escuro). A
 * diferença de cor é intencional, e fica a cargo de quem usa o hook.
 *
 * Quando a fila é mais larga do que o ecrã, rola sozinha para deixar o item
 * ativo ao meio — com `scrollLeft`, não com `scrollIntoView`, que também mexe
 * no scroll vertical da página e faz o ecrã saltar.
 */

const AVANCO = '.5s cubic-bezier(.3,.85,.25,1)'
const ATRASO = '.68s cubic-bezier(.45,0,.2,1) .18s'

/**
 * A transição vai em `style`, e o `prefers-reduced-motion` do `index.css` só
 * apanha classes — daí a verificação ter de ser feita aqui em JS.
 */
function movimentoReduzido(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

interface Geometria {
  /** Distância da aresta esquerda do item ativo ao início da fila. */
  esquerda: number
  /** Largura do item ativo. */
  largura: number
  /** Largura total do conteúdo da fila (inclui o que está fora do ecrã). */
  total: number
  /** Sentido do movimento que trouxe o realce aqui — decide que aresta lidera. */
  avanca: boolean
}

export interface RealceDeslizante {
  /** Ref para o contentor da fila (tem de ser `position: relative`). */
  refFila: React.RefObject<HTMLDivElement | null>
  /** Devolve a ref a pôr em cada item, pela ordem em que aparecem. */
  refItem: (indice: number) => (el: HTMLElement | null) => void
  /** Estilo do bloco de realce. `undefined` antes da primeira medição. */
  estiloRealce: React.CSSProperties
}

export interface OpcoesRealce {
  /**
   * Largura fixa do realce, em pixels, centrada no item ativo.
   *
   * É o que distingue as duas utilizações: nos separadores o realce toma a
   * largura do separador (sem esta opção), na barra de navegação é uma
   * pastilha estreita à volta do ícone, igual em todos os lugares — se
   * acompanhasse a largura do item, "Competição" teria uma pastilha do dobro
   * de "Hoje".
   */
  larguraFixa?: number
}

export function useRealceDeslizante(
  indiceAtivo: number,
  { larguraFixa }: OpcoesRealce = {},
): RealceDeslizante {
  const refFila = useRef<HTMLDivElement | null>(null)
  const refsItens = useRef<(HTMLElement | null)[]>([])
  const [geo, setGeo] = useState<Geometria | null>(null)

  // Onde o realce estava antes desta mudança. Só é lido dentro da medição,
  // que corre depois da renderização — daí ainda ter o índice de onde
  // viemos, que é o que diz se o realce avança ou recua.
  const refAnterior = useRef(indiceAtivo)

  const medir = useCallback(() => {
    const fila = refFila.current
    const item = refsItens.current[indiceAtivo]
    if (!fila || !item) return

    const avanca = indiceAtivo >= refAnterior.current
    const largura = larguraFixa ?? item.offsetWidth
    const esquerda = larguraFixa
      ? item.offsetLeft + item.offsetWidth / 2 - larguraFixa / 2
      : item.offsetLeft
    // `scrollWidth` e `offsetLeft` contam ambos a partir da caixa de
    // preenchimento da fila, por isso são comparáveis mesmo quando a fila
    // rola. Com `offsetWidth` — que inclui as bordas — a aresta direita
    // ficaria uns pixels ao lado.
    const total = fila.scrollWidth

    // Centrar o item — não o realce, que pode ser mais estreito do que ele.
    const querido = Math.max(
      0,
      Math.min(
        item.offsetLeft + item.offsetWidth / 2 - fila.clientWidth / 2,
        fila.scrollWidth - fila.clientWidth,
      ),
    )
    if (Math.abs(fila.scrollLeft - querido) > 2) fila.scrollLeft = querido

    setGeo(atual =>
      atual &&
      atual.esquerda === esquerda &&
      atual.largura === largura &&
      atual.total === total &&
      atual.avanca === avanca
        ? atual
        : { esquerda, largura, total, avanca },
    )
  }, [indiceAtivo, larguraFixa])

  useLayoutEffect(() => {
    medir()
    refAnterior.current = indiceAtivo
  }, [medir, indiceAtivo])

  useEffect(() => {
    const fila = refFila.current
    if (!fila) return

    // A fila muda de tamanho por mais razões do que o ecrã rodar: o Archivo
    // chega depois do primeiro render e alarga as etiquetas, e um separador
    // pode aparecer ou desaparecer com o papel de quem está a ver.
    const observador = new ResizeObserver(medir)
    observador.observe(fila)
    for (const item of refsItens.current) if (item) observador.observe(item)

    window.addEventListener('resize', medir)
    document.fonts?.ready.then(medir).catch(() => {})

    return () => {
      observador.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [medir])

  const refItem = useCallback(
    (indice: number) => (el: HTMLElement | null) => {
      refsItens.current[indice] = el
    },
    [],
  )

  // Índice negativo = nenhum item ativo (estamos numa rota que não tem lugar
  // na barra, como o Perfil). O realce esconde-se em vez de ficar parado no
  // último sítio onde esteve, o que leria como se essa secção continuasse
  // selecionada.
  const estiloRealce: React.CSSProperties = geo && indiceAtivo >= 0
    ? {
        left: `${geo.esquerda}px`,
        right: `${Math.max(0, geo.total - geo.esquerda - geo.largura)}px`,
        transition: movimentoReduzido()
          ? 'none'
          : geo.avanca
            ? `right ${AVANCO}, left ${ATRASO}`
            : `left ${AVANCO}, right ${ATRASO}`,
      }
    : { opacity: 0 }

  return { refFila, refItem, estiloRealce }
}

export default useRealceDeslizante
