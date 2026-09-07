import React, { useRef } from 'react'
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
 */

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
    <div
      ref={refFila}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={aoTeclar}
      className={`sem-barra-rolagem relative flex gap-2 overflow-x-auto ${className}`}
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
            className={`relative z-1 flex-none h-11 px-4 rounded-[22px] border whitespace-nowrap font-display font-bold text-xs cursor-pointer
              transition-[background-color,color,border-color] duration-200
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold
              ${
                eAtivo
                  ? 'bg-transparent border-transparent text-white'
                  : 'bg-white/5 border-white/12 text-white/70'
              }`}
          >
            {item}
          </button>
        )
      })}
    </div>
  )
}

export default FilaSeparadores
