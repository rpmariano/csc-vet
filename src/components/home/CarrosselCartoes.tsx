import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRealceDeslizante } from '../../hooks/useRealceDeslizante'

/**
 * Carrossel horizontal de páginas, com os traços em baixo.
 *
 * A Home tem três: o próximo jogo, o que está por responder e a
 * classificação. Rola por arrasto, com paragem em cada página
 * (`scroll-snap`), e os traços dizem em qual se está.
 *
 * **Os traços levam o mesmo realce deslizante da barra de navegação** — o
 * bloco que anima as duas arestas com tempos diferentes, do
 * `useRealceDeslizante`. É o gesto da casa, e o handoff pede-o aqui também:
 * sem ele os traços acendiam-se um a um, que é outra coisa.
 *
 * Também se pode tocar num traço para saltar de página, o que os torna alvos
 * de toque — daí terem 44px de altura, com o traço visível de 3px ao meio.
 *
 * Com uma página só, os traços não aparecem: não há para onde ir.
 */

interface CarrosselCartoesProps {
  /** Uma página por elemento. */
  paginas: React.ReactNode[]
  /** Nome do carrossel para quem usa leitor de ecrã. */
  etiqueta: string
  className?: string
}

export const CarrosselCartoes: React.FC<CarrosselCartoesProps> = ({
  paginas,
  etiqueta,
  className = '',
}) => {
  const refTrilho = useRef<HTMLDivElement>(null)
  const [ativa, setAtiva] = useState(0)
  const realce = useRealceDeslizante(ativa, { larguraFixa: 22 })

  /* Qual a página ao centro. Lê-se do scroll e não de um índice guardado,
     porque o arrasto pode parar a meio e o que manda é onde ficou. */
  const aoRolar = useCallback(() => {
    const trilho = refTrilho.current
    if (!trilho) return
    const indice = Math.round(trilho.scrollLeft / trilho.clientWidth)
    setAtiva(a => (a === indice ? a : Math.max(0, Math.min(paginas.length - 1, indice))))
  }, [paginas.length])

  // Se as páginas encolherem (um evento respondido sai da lista), o índice
  // pode ficar fora da conta.
  useEffect(() => {
    setAtiva(a => Math.min(a, Math.max(0, paginas.length - 1)))
  }, [paginas.length])

  const irPara = (indice: number) => {
    const trilho = refTrilho.current
    if (!trilho) return
    trilho.scrollTo({ left: indice * trilho.clientWidth, behavior: 'smooth' })
    setAtiva(indice)
  }

  if (paginas.length === 0) return null

  return (
    <div className={className}>
      <div
        ref={refTrilho}
        onScroll={aoRolar}
        role="group"
        aria-label={etiqueta}
        className="flex overflow-x-auto snap-x snap-mandatory sem-barra-rolagem -mx-[18px] px-[18px] gap-3"
      >
        {paginas.map((pagina, i) => (
          <div
            key={i}
            className="snap-center shrink-0 w-full"
            aria-hidden={i !== ativa}
          >
            {pagina}
          </div>
        ))}
      </div>

      {paginas.length > 1 && (
        <div ref={realce.refFila} className="relative flex items-center justify-center gap-1 mt-1">
          {/* O realce, por trás dos traços. */}
          <span
            aria-hidden="true"
            className="absolute h-[3px] rounded-full bg-csc-gold pointer-events-none"
            style={realce.estiloRealce}
          />
          {paginas.map((_, i) => (
            <button
              key={i}
              type="button"
              ref={realce.refItem(i)}
              onClick={() => irPara(i)}
              aria-label={`Página ${i + 1} de ${paginas.length}`}
              aria-current={i === ativa ? 'true' : undefined}
              className="relative z-1 h-11 w-[26px] flex items-center justify-center cursor-pointer
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-lg"
            >
              <span className="w-[18px] h-[3px] rounded-full bg-white/25" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CarrosselCartoes
