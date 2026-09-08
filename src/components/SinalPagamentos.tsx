import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { BottomSheet } from './BottomSheet'
import { triggerHaptic } from '../utils/haptics'
import { useEstadoPagamentos, DIAS_DE_AVISO, type ItemPagamento } from '../hooks/useEstadoPagamentos'

/**
 * O sinal de € do cabeçalho — à esquerda da pastilha do estado clínico.
 *
 * É o mesmo gesto do sino dos comunicados: um crachá com a contagem, e uma
 * persiana que abre o detalhe. Substituiu a faixa vermelha que ocupava uma
 * linha inteira no topo de todos os ecrãs e que só falava de quotas.
 *
 * **A cor é a do pior caso**: laranja a menos de oito dias de um prazo,
 * vermelho quando já passou. Com um vencido e outro a aproximar-se manda o
 * vermelho — é o que precisa de ser tratado primeiro. O símbolo pulsa nos dois
 * casos; a cor é que diz a gravidade. Quem tiver `prefers-reduced-motion`
 * ligado não vê pulsar nada (ver `index.css`).
 *
 * **Sem nada a assinalar não aparece.** Um sinal permanentemente apagado
 * ensina a não olhar para ele.
 */

const EUROS = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const fmt = (n: number) => EUROS.format(n)

/**
 * Como se paga. Está aqui e no "Os meus pagamentos" do Perfil — os dois sítios
 * onde alguém pergunta "e agora?".
 */
export const COMO_PAGAR =
  'Efetua transferência bancária ou MBWay para o Rui Mariano — 913663956. ' +
  'Em caso de dificuldade contacta o Rui ou o João Matuto.'

const prazoPorExtenso = (item: ItemPagamento): string => {
  if (item.diasAteLimite === null) return 'sem prazo marcado'
  if (item.diasAteLimite < 0) {
    const dias = Math.abs(item.diasAteLimite)
    return dias === 1 ? 'venceu ontem' : `venceu há ${dias} dias`
  }
  if (item.diasAteLimite === 0) return 'vence hoje'
  if (item.diasAteLimite === 1) return 'vence amanhã'
  return `vence em ${item.diasAteLimite} dias`
}

export const SinalPagamentos: React.FC = () => {
  const { profile, assignedRoles } = useAuth()
  const [aberto, setAberto] = useState(false)

  /* As quotas e os encargos são de quem joga, seja qual for o outro chapéu. */
  const temPapelDeJogador = assignedRoles.includes('player')
  const estado = useEstadoPagamentos(profile, temPapelDeJogador)

  if (!temPapelDeJogador || estado.cor === null) return null

  const vermelho = estado.cor === 'vermelho'
  const classes = vermelho
    ? 'bg-csc-red/20 border-csc-red/45 text-csc-vermelho-texto'
    : 'bg-amber-500/20 border-amber-400/50 text-amber-300'
  const corDoCracha = vermelho ? 'bg-csc-red text-white' : 'bg-amber-400 text-csc-tinta'

  const lista = [...estado.emAtraso, ...estado.aVencer]

  return (
    <>
      <button
        type="button"
        onClick={() => { triggerHaptic('medium'); setAberto(true) }}
        aria-label={
          `${estado.contador} ${estado.contador === 1 ? 'pagamento' : 'pagamentos'} ` +
          `${vermelho ? 'em atraso' : 'a vencer'} — ${fmt(estado.totalEmAviso)}`
        }
        className={`relative flex-none w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer
          transition-transform duration-150 active:scale-97
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${classes}`}
      >
        <span className="font-display font-black text-[15px] leading-none animate-pulse">€</span>
        <span
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full font-display text-[10px]
            font-extrabold flex items-center justify-center border-2 border-[#101314] ${corDoCracha}`}
        >
          {estado.contador > 9 ? '9+' : estado.contador}
        </span>
      </button>

      <BottomSheet
        isOpen={aberto}
        onClose={() => setAberto(false)}
        title={vermelho ? 'Pagamentos em atraso' : 'Pagamentos a vencer'}
        description={`${estado.contador} ${estado.contador === 1 ? 'pagamento' : 'pagamentos'} · ${fmt(estado.totalEmAviso)}`}
        tone="dark"
        size="md"
        icon={
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-display font-black text-[16px] ${
            vermelho ? 'bg-csc-red/20 text-csc-vermelho-texto' : 'bg-amber-500/20 text-amber-300'
          }`}>
            €
          </div>
        }
      >
        <div className="space-y-1.5">
          {lista.map(item => {
            const atrasado = item.estado === 'atraso'
            return (
              <div
                key={item.chave}
                className={`flex items-center gap-3 pl-2.5 pr-4 py-3 rounded-2xl border ${
                  atrasado
                    ? 'bg-csc-red/12 border-csc-red/25'
                    : 'bg-amber-500/10 border-amber-400/25'
                }`}
              >
                {/* A mesma barra de estado de "Os meus pagamentos": a cor diz
                    o que é antes de se ler a linha. */}
                <span
                  aria-hidden="true"
                  className={`w-[3px] self-stretch rounded-full shrink-0 ${atrasado ? 'bg-csc-red' : 'bg-amber-400'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-extrabold text-[13px] text-white capitalize truncate">
                    {item.etiqueta}
                  </span>
                  <span className="block text-[10px] tracking-[0.1em] uppercase text-white/45 mt-0.5">
                    {item.categoria}
                  </span>
                  <span className="block text-[10.5px] text-white/62 mt-0.5">
                    {prazoPorExtenso(item)}
                  </span>
                </span>
                <span className={`font-display text-[15px] font-black tabular-nums shrink-0 ${
                  atrasado ? 'text-csc-vermelho-texto' : 'text-amber-300'
                }`}>
                  {fmt(item.valor)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
          <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62">
            Como pagar
          </p>
          <p className="text-[12px] leading-relaxed text-white/80">{COMO_PAGAR}</p>
          <p className="text-[10.5px] leading-relaxed text-white/55">
            O pagamento só fica em dia depois de o tesoureiro o registar — é ele que marca o mês
            como pago. Um pagamento entra aqui a {DIAS_DE_AVISO} dias do prazo.
          </p>
        </div>
      </BottomSheet>
    </>
  )
}

export default SinalPagamentos
