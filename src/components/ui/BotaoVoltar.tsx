import React from 'react'
import { ChevronLeft } from 'lucide-react'

/**
 * O "‹ Clube" por cima do cabeçalho de um ecrã que se abriu a partir de outro.
 *
 * Nasceu nas secções do Clube e passou a ser também o voltar das fichas
 * (`<EcraDetalhe>`): o texto é o nome do ecrã para onde se volta, não
 * "Voltar" — diz onde se vai parar, que é o que o toque decide.
 */
export interface BotaoVoltarProps {
  /** Nome do ecrã de onde se veio. */
  para: string
  aoVoltar: () => void
  className?: string
}

export const BotaoVoltar: React.FC<BotaoVoltarProps> = ({ para, aoVoltar, className = '' }) => (
  <button
    type="button"
    onClick={aoVoltar}
    className={`min-h-11 -ml-1 pr-3 flex items-center gap-1 text-csc-gold font-display font-extrabold text-[11px] cursor-pointer
      transition-transform duration-150 active:scale-97
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${className}`}
  >
    <ChevronLeft size={16} aria-hidden="true" />
    <span>{para}</span>
  </button>
)

export default BotaoVoltar
