import React from 'react'
import { Plus } from 'lucide-react'

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

type Aparencia = 'dourado' | 'vidro' | 'verde' | 'perigo' | 'vermelho'

const APARENCIAS: Record<Aparencia, string> = {
  /** Ação principal do ecrã. Um por ecrã, idealmente. */
  dourado: 'bg-csc-gold text-csc-tinta border-transparent',
  /** Ação secundária — cancelar, alternativas. */
  vidro: 'bg-white/9 text-white border-white/20',
  /** Confirmação positiva: presente, pago, apto. */
  verde: 'bg-csc-light text-white border-transparent',
  /** Eliminar e afins. */
  perigo: 'bg-csc-red/15 text-csc-vermelho-texto border-csc-red/35',
  /** O "sim" de uma confirmação de eliminar — o passo sem volta, a cheio. */
  vermelho: 'bg-csc-red text-white border-transparent',
}

const BASE =
  'inline-flex items-center justify-center gap-2 cursor-pointer select-none ' +
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

export interface BotaoIconeProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** O que o botão faz — é o nome acessível e a dica do rato. */
  rotulo: string
  icone: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>
  /** Eliminar e afins. */
  perigo?: boolean
  /** Sem fundo nem moldura, para as ações dentro de uma linha de lista. */
  discreto?: boolean
  /** A ação principal de um ecrã ou diálogo — dourado, como o `<Botao>` dourado. */
  destaque?: boolean
}

/**
 * O botão só com ícone: editar, eliminar, tirar. Sempre 44 × 44, com o
 * `rotulo` como nome acessível.
 *
 * Eram escritos à mão em cada lista, e havia de tudo: 44px com moldura e
 * `red-400` nas Gestões do Clube, um `p-1` de 22px na Liga, `red-600/40` no
 * dossier dos Eventos, quatro glifos diferentes para "editar" (`Pencil`,
 * `Edit`, `Edit2`, `Edit3`) em quatro tamanhos. Aqui editar é o lápis e
 * eliminar é o caixote, os dois a 15px. (Auditoria de design, vaga 4.)
 *
 * `destaque` é para quando editar é a ação principal do ecrã, e não uma
 * ação neutra ao lado de eliminar — o "Modificar evento" do dossier de
 * convocatória, por exemplo, que era do mesmo cinzento que o resto.
 */
export const BotaoIcone: React.FC<BotaoIconeProps> = ({
  rotulo,
  icone: Icone,
  perigo = false,
  discreto = false,
  destaque = false,
  className = '',
  type = 'button',
  ...resto
}) => {
  const cor = discreto
    ? perigo
      ? 'bg-transparent border-transparent text-csc-vermelho-texto hover:bg-csc-red/15'
      : 'bg-transparent border-transparent text-white/62 hover:text-white hover:bg-white/10'
    : perigo
      ? APARENCIAS.perigo
      : destaque
        ? APARENCIAS.dourado
        : 'bg-white/9 text-white/80 border-white/15 hover:text-white'
  return (
    <button
      type={type}
      aria-label={rotulo}
      title={rotulo}
      className={`${BASE} w-11 h-11 shrink-0 rounded-xl ${cor} ${className}`}
      {...resto}
    >
      <Icone size={15} aria-hidden="true" />
    </button>
  )
}

export interface BotaoCriarProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** O que se cria — é o nome acessível ("Adicionar membro ao plantel"). */
  rotulo: string
  /** Com texto é uma barra da largura da coluna ("Novo evento"); sem ele, o círculo. */
  texto?: string
}

/**
 * O botão de criar de um ecrã: dourado, com o "+" em tinta e a mesma sombra
 * do [+] da barra de baixo (`sombra-fab`), para se ler como da mesma família.
 *
 * O do Plantel era um círculo de vidro cinzento, igual a um botão secundário,
 * e perdia-se ao lado do título; o dos Eventos era dourado com o "+" também
 * dourado, invisível; as Gestões do Clube tinham um terceiro, dourado sem
 * sombra. Criar é a ação principal destes ecrãs e tem de se ver.
 */
export const BotaoCriar: React.FC<BotaoCriarProps> = ({
  rotulo,
  texto,
  className = '',
  type = 'button',
  ...resto
}) => (
  <button
    type={type}
    aria-label={texto ? undefined : rotulo}
    className={`${BASE} ${APARENCIAS.dourado} sombra-fab shrink-0 ${
      texto ? 'w-full h-12 px-5 rounded-3xl text-[12.5px]' : 'w-12 h-12 rounded-full'
    } ${className}`}
    {...resto}
  >
    <Plus size={texto ? 18 : 22} strokeWidth={2.5} aria-hidden="true" />
    {texto && <span>{texto}</span>}
  </button>
)
