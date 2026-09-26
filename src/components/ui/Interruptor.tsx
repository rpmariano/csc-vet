import React from 'react'
import { triggerHaptic } from '../../utils/haptics'

/**
 * Um sim/não com o nome à esquerda e o interruptor à direita. A linha inteira
 * é o botão (`role="switch"`), por isso o alvo de toque é a linha e não os
 * 24px do desenho.
 *
 * Havia quatro feitos à mão: o das Preferências de avisos (este, que já era
 * um `switch`), dois nos Comunicados — verde `emerald-600`, sem nome
 * acessível, só o desenho de 24px para tocar — e um nos Eventos, um checkbox
 * escondido por trás de um `div` com pseudo-elementos. Quatro desenhos para a
 * mesma pergunta, e três deles mudos para um leitor de ecrã.
 * (Auditoria de design, vaga 4.)
 */
export interface InterruptorProps {
  ligado: boolean
  aoMudar: (ligado: boolean) => void
  titulo: React.ReactNode
  nota?: React.ReactNode
  disabled?: boolean
  /** Moldura da linha: um cartão (`cartao-simples`), ou o fio entre linhas de uma lista. */
  className?: string
}

export const Interruptor: React.FC<InterruptorProps> = ({
  ligado,
  aoMudar,
  titulo,
  nota,
  disabled = false,
  className = '',
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={ligado}
    disabled={disabled}
    onClick={() => { triggerHaptic('selection'); aoMudar(!ligado) }}
    className={`w-full min-h-14 flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer
      disabled:opacity-50 disabled:cursor-not-allowed
      focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${className}`}
  >
    <span className="min-w-0 flex-1">
      <span className="block font-display font-bold text-[12.5px] text-white">{titulo}</span>
      {nota && <span className="block text-[10.5px] leading-snug text-white/62 mt-0.5">{nota}</span>}
    </span>
    <span
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${
        ligado ? 'bg-csc-light' : 'bg-white/15'
      }`}
      aria-hidden="true"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
          ligado ? 'translate-x-5' : ''
        }`}
      />
    </span>
  </button>
)

export default Interruptor
