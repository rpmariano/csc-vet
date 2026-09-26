import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRealceDeslizante } from '../../hooks/useRealceDeslizante'
import { triggerHaptic } from '../../utils/haptics'

/**
 * A fila de separadores de uma página — Visão Geral · Quotas · Encargos…
 *
 * O realce verde escuro por trás do ativo é o mesmo mecanismo da barra de
 * navegação (ver `useRealceDeslizante`), só muda a cor: dourado em baixo,
 * verde aqui. Quando os separadores não cabem, a fila rola sozinha para
 * deixar o ativo ao meio.
 *
 * É um `tablist` a sério: setas esquerda/direita andam entre separadores,
 * Home e End saltam para as pontas, e só o ativo entra na ordem de tabulação
 * — é o que o leitor de ecrã espera de um grupo de separadores, e evita que
 * uma fila de seis obrigue a seis tabulações para passar à frente.
 *
 * Quem usa isto trata do painel: dá `idPainel` para o `aria-controls` apontar
 * a algum lado.
 *
 * **Quando não cabem, vê-se que há mais.** A fila do Financeiro cortava no
 * fim de um separador e não deixava nada a espreitar: quem lá chegava via
 * quatro e não sabia que havia sete. Do lado onde há separadores escondidos,
 * a fila desvanece-se e aparece uma seta que rola para lá. O desvanecer é uma
 * máscara sobre a própria fila, e não um degradê pintado por cima: a fila
 * assenta na faixa verde do topo, e um degradê da cor do fundo via-se ali
 * como uma mancha cinzenta.
 *
 * As setas são só para o dedo e o rato — o teclado tem as setas do próprio
 * `tablist`, e o leitor de ecrã lê os separadores todos —, por isso ficam
 * fora da ordem de tabulação e escondidas da árvore de acessibilidade.
 */

/** Quantos pixels desvanecem na ponta onde a fila continua. */
const DESVANECER = 40

export interface FilaSeparadoresProps {
  itens: readonly string[]
  /** Índice do separador ativo. */
  ativo: number
  onEscolher: (indice: number) => void
  /** Nome do grupo, para o leitor de ecrã. Ex.: "Secções do financeiro". */
  ariaLabel: string
  /** `id` do painel que os separadores controlam, se existir. */
  idPainel?: string
  className?: string
}

export const FilaSeparadores: React.FC<FilaSeparadoresProps> = ({
  itens,
  ativo,
  onEscolher,
  ariaLabel,
  idPainel,
  className = '',
}) => {
  const { refFila, refItem, estiloRealce } = useRealceDeslizante(ativo)
  const refsBotoes = useRef<(HTMLButtonElement | null)[]>([])
  const [mais, setMais] = useState({ esquerda: false, direita: false })

  /* De que lados há separadores escondidos. Mede-se ao rolar — pelo dedo ou
     pelo realce, que centra o ativo — e quando a fila muda de largura. */
  useEffect(() => {
    const fila = refFila.current
    if (!fila) return
    const medir = () => {
      const esquerda = fila.scrollLeft > 2
      const direita = fila.scrollLeft + fila.clientWidth < fila.scrollWidth - 2
      setMais(atual => (atual.esquerda === esquerda && atual.direita === direita ? atual : { esquerda, direita }))
    }
    medir()
    fila.addEventListener('scroll', medir, { passive: true })
    const observador = new ResizeObserver(medir)
    observador.observe(fila)
    for (const botao of refsBotoes.current) if (botao) observador.observe(botao)
    let vivo = true
    document.fonts?.ready.then(() => { if (vivo) medir() }).catch(() => {})
    return () => {
      vivo = false
      fila.removeEventListener('scroll', medir)
      observador.disconnect()
    }
  }, [refFila, itens.length])

  const rolar = (sentido: 1 | -1) => {
    const fila = refFila.current
    if (!fila) return
    triggerHaptic('light')
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    fila.scrollBy({ left: sentido * fila.clientWidth * 0.7, behavior: reduzido ? 'auto' : 'smooth' })
  }

  const mascara = mais.esquerda && mais.direita
    ? `linear-gradient(to right, transparent 0, #000 ${DESVANECER}px, #000 calc(100% - ${DESVANECER}px), transparent 100%)`
    : mais.direita
      ? `linear-gradient(to right, #000 calc(100% - ${DESVANECER}px), transparent 100%)`
      : mais.esquerda
        ? `linear-gradient(to right, transparent 0, #000 ${DESVANECER}px)`
        : undefined

  const escolher = (indice: number) => {
    triggerHaptic('selection')
    onEscolher(indice)
  }

  const aoTeclar = (e: React.KeyboardEvent) => {
    const ultimo = itens.length - 1
    let destino: number | null = null

    if (e.key === 'ArrowRight') destino = ativo === ultimo ? 0 : ativo + 1
    else if (e.key === 'ArrowLeft') destino = ativo === 0 ? ultimo : ativo - 1
    else if (e.key === 'Home') destino = 0
    else if (e.key === 'End') destino = ultimo

    if (destino === null) return
    e.preventDefault()
    escolher(destino)
    refsBotoes.current[destino]?.focus()
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={refFila}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={aoTeclar}
        className="sem-barra-rolagem relative flex gap-2 overflow-x-auto"
        style={mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
      >
        {/* O realce vai por baixo dos separadores (`z-0`); o texto do ativo
            passa a branco e o fundo próprio desaparece para o deixar ver. */}
        <div
          aria-hidden="true"
          className="absolute top-0 h-11 rounded-[22px] bg-csc-dark z-0"
          style={{ boxShadow: '0 6px 16px -6px rgba(22,79,22,.6)', ...estiloRealce }}
        />

        {itens.map((item, i) => {
          const eAtivo = i === ativo
          return (
            <button
              key={item}
              type="button"
              role="tab"
              id={idPainel ? `${idPainel}-sep-${i}` : undefined}
              aria-selected={eAtivo}
              aria-controls={idPainel}
              tabIndex={eAtivo ? 0 : -1}
              onClick={() => escolher(i)}
              ref={el => {
                refsBotoes.current[i] = el
                refItem(i)(el)
              }}
              className={`relative z-1 flex-none h-11 px-4 rounded-[22px] whitespace-nowrap font-display font-bold text-xs cursor-pointer
                transition-[background-color,color,border-color] duration-200
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold
                ${
                  eAtivo
                    ? 'bg-transparent border-transparent text-white'
                    : 'bg-white/5 text-white/70'
                }`}
            >
              {item}
            </button>
          )
        })}
      </div>

      {mais.esquerda && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => rolar(-1)}
          className="absolute left-0 top-0 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer
            bg-csc-superficie/90 text-white shadow-[0_4px_12px_rgba(0,0,0,.35)]
            transition-transform duration-150 active:scale-97"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {mais.direita && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => rolar(1)}
          className="absolute right-0 top-0 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer
            bg-csc-superficie/90 text-white shadow-[0_4px_12px_rgba(0,0,0,.35)]
            transition-transform duration-150 active:scale-97"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}

export default FilaSeparadores
