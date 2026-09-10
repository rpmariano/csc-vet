import React from 'react'

/**
 * A linha de um atleta, igual nos três ecrãs que listam o plantel inteiro:
 * Plantel, Quotas e Encargos.
 *
 * **A bola verde com o número é de todos.** Andavam três desenhos diferentes
 * para a mesma pessoa — no Plantel a bola, nas Quotas um número apagado à
 * direita da barra, nos Encargos nada —, e quem passa de um ecrã para o outro
 * tinha de reaprender a lista de cada vez.
 *
 * **A fotografia e a posição são só do Plantel.** Ali a pergunta é quem é a
 * pessoa; nas Quotas e nos Encargos é quanto deve, e a cara não ajuda a
 * responder — só faz a linha crescer.
 *
 * Cada ecrã embrulha isto no seu alvo: o Plantel num `<button>` que abre a
 * ficha, as Quotas noutro que abre os meses, os Encargos numa linha com o
 * botão de pagar ao lado. O que se partilha é o conteúdo, não a interação.
 */

/** A bola verde com o número de camisola. Sem número, um traço. */
export const NumeroCamisola: React.FC<{ numero?: number | null; className?: string }> = ({
  numero,
  className = '',
}) => (
  <span
    aria-hidden="true"
    className={`w-8 h-8 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 text-csc-gold
      font-display font-extrabold text-[11px] flex items-center justify-center shrink-0 tabular-nums ${className}`}
  >
    {numero ?? '–'}
  </span>
)

export interface LinhaAtletaProps {
  numero?: number | null
  nome: string
  /** Segunda linha — as posições, e por isso só no Plantel. */
  detalhe?: React.ReactNode
  /** A fotografia, também só no Plantel. `undefined` não desenha lugar nenhum. */
  foto?: string | null
  /** O que fica à direita: o valor em dívida, os meses pagos, o J · G · A. */
  direita?: React.ReactNode
}

export const LinhaAtleta: React.FC<LinhaAtletaProps> = ({
  numero,
  nome,
  detalhe,
  foto,
  direita,
}) => (
  <>
    <NumeroCamisola numero={numero} />

    {foto !== undefined && (
      foto ? (
        <img src={foto} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
      ) : (
        <span className="w-9 h-9 rounded-xl bg-white/10 text-white/60 flex items-center justify-center font-display font-black text-[13px] shrink-0">
          {(nome || '?').charAt(0).toUpperCase()}
        </span>
      )
    )}

    <span className="flex-1 min-w-0">
      <span className="block font-display font-black text-[13px] text-white truncate">{nome}</span>
      {detalhe && <span className="block text-[10px] text-white/62 truncate mt-0.5">{detalhe}</span>}
    </span>

    {direita}
  </>
)

export default LinhaAtleta
