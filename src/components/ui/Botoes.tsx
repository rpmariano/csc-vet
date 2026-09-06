import React from 'react'

/**
 * Botões e pastilhas do redesenho.
 *
 * Todos têm pelo menos 44px de altura — a regra do handoff, sem exceções,
 * incluindo as pastilhas e os botões de linha. É a razão de existirem aqui em
 * vez de serem escritos à mão em cada ecrã: a altura mínima é fácil de perder
 * quando se está a fazer caber uma linha apertada.
 *
 * O `active:scale-97` é o toque do handoff: o botão cede ao dedo. Fica no
 * `:active`, não numa animação, para não haver nada a correr quando ninguém
 * está a carregar.
 */

type Aparencia = 'dourado' | 'vidro' | 'verde' | 'perigo'

const APARENCIAS: Record<Aparencia, string> = {
  /** Ação principal do ecrã. Um por ecrã, idealmente. */
  dourado: 'bg-csc-gold text-csc-tinta border-transparent',
  /** Ação secundária — cancelar, alternativas. */
  vidro: 'bg-white/9 text-white border-white/20',
  /** Confirmação positiva: presente, pago, apto. */
  verde: 'bg-csc-light text-white border-transparent',
  /** Eliminar e afins. */
  perigo: 'bg-csc-red/15 text-csc-vermelho-texto border-csc-red/35',
}

const BASE =
  'inline-flex items-center justify-center gap-2 border cursor-pointer select-none ' +
  'font-display font-extrabold transition-[background-color,color,border-color,transform] duration-150 ' +
  'active:scale-97 disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold'

export interface BotaoProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  aparencia?: Aparencia
  /** Ocupa a largura toda da coluna. */
  largo?: boolean
}

export const Botao: React.FC<BotaoProps> = ({
  aparencia = 'dourado',
  largo = false,
  className = '',
  type = 'button',
  children,
  ...resto
}) => (
  <button
    type={type}
    className={`${BASE} h-12 px-6 rounded-3xl text-[12.5px] ${APARENCIAS[aparencia]} ${
      largo ? 'w-full' : ''
    } ${className}`}
    {...resto}
  >
    {children}
  </button>
)

export interface PastilhaProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Marca a pastilha como escolhida. */
  ativa?: boolean
  aparencia?: Aparencia
}

/**
 * Pastilha — filtro, escolha entre poucas opções, etiqueta clicável.
 * Ao contrário dos separadores, não há realce deslizante: a pastilha ativa
 * muda de fundo no sítio.
 */
export const Pastilha: React.FC<PastilhaProps> = ({
  ativa = false,
  aparencia = 'dourado',
  className = '',
  type = 'button',
  children,
  ...resto
}) => (
  <button
    type={type}
    aria-pressed={ativa}
    className={`${BASE} h-11 px-4 rounded-[22px] text-xs font-bold ${
      ativa ? APARENCIAS[aparencia] : 'bg-white/5 text-white/70 border-white/12'
    } ${className}`}
    {...resto}
  >
    {children}
  </button>
)

export default Botao
