import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, TriangleAlert } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { COMO_PAGAR } from './SinalPagamentos'
import { useEstadoPagamentos, DIAS_DE_AVISO, type ItemPagamento } from '../hooks/useEstadoPagamentos'
import type { QuotaEligiblePlayer } from '../lib/finance'
import { triggerHaptic } from '../utils/haptics'

/**
 * Os meus pagamentos (ecrã 12c) — o que o jogador deve, o que já pagou, e como
 * se paga.
 *
 * O jogador não tem acesso à página financeira, que é da direção. Aqui vê tudo
 * o que lhe diz respeito **agrupado por categoria** — Quotas, e cada categoria
 * de encargo —, com o grupo a abrir e a fechar: uma época são doze meses de
 * quota, e uma lista corrida de doze linhas escondia os encargos no fim.
 *
 * **Abre o que tem dívida.** Um grupo com alguma coisa por pagar começa
 * aberto; os que estão em dia começam fechados. Quem abre isto está a
 * perguntar "o que é que falta?", e a resposta tem de estar à vista.
 *
 * As contas são as do `useEstadoPagamentos`, as mesmas do sinal de € do
 * cabeçalho — havia dois cálculos e podiam discordar.
 */

const EUROS = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const fmt = (n: number) => EUROS.format(n)

const ESTADO: Record<ItemPagamento['estado'], { texto: string; classe: string; barra: string }> = {
  pago: {
    texto: 'pago',
    classe: 'bg-csc-light/15 border-csc-light/30 text-csc-verde-texto',
    barra: 'bg-csc-light/60',
  },
  atraso: {
    texto: 'em atraso',
    classe: 'bg-csc-red/15 border-csc-red/35 text-csc-vermelho-texto',
    barra: 'bg-csc-red',
  },
  'a-vencer': {
    texto: 'a vencer',
    classe: 'bg-amber-500/15 border-amber-400/35 text-amber-300',
    barra: 'bg-amber-400',
  },
  'por-vencer': {
    texto: 'a haver',
    classe: 'bg-white/6 border-white/12 text-white/62',
    barra: 'bg-white/15',
  },
}

interface Grupo {
  nome: string
  itens: ItemPagamento[]
  pagos: number
  emFalta: number
  temAtraso: boolean
  temAVencer: boolean
}

export const OsMeusPagamentos: React.FC<{
  aberto: boolean
  aoFechar: () => void
  jogador: (QuotaEligiblePlayer & { id: string }) | null | undefined
}> = ({ aberto, aoFechar, jogador }) => {
  const estado = useEstadoPagamentos(jogador, aberto)
  const [fechados, setFechados] = useState<Set<string>>(new Set())

  const grupos = useMemo<Grupo[]>(() => {
    const porCategoria = new Map<string, ItemPagamento[]>()
    for (const item of estado.todos) {
      const lista = porCategoria.get(item.categoria) ?? []
      lista.push(item)
      porCategoria.set(item.categoria, lista)
    }
    return [...porCategoria.entries()].map(([nome, itens]) => ({
      nome,
      itens,
      pagos: itens.filter(i => i.estado === 'pago').length,
      emFalta: itens.filter(i => i.estado !== 'pago').reduce((s, i) => s + i.valor, 0),
      temAtraso: itens.some(i => i.estado === 'atraso'),
      temAVencer: itens.some(i => i.estado === 'a-vencer'),
    }))
  }, [estado.todos])

  /* Fechado só se alguém o fechou à mão, ou se está tudo em dia neste grupo. */
  const estaAberto = (g: Grupo) =>
    fechados.has(g.nome) ? false : g.temAtraso || g.temAVencer || g.emFalta > 0

  const alternar = (nome: string) => {
    triggerHaptic('selection')
    setFechados(atual => {
      const proximo = new Set(atual)
      if (proximo.has(nome)) proximo.delete(nome)
      else proximo.add(nome)
      return proximo
    })
  }

  const emDivida = estado.emAtraso.reduce((s, i) => s + i.valor, 0)

  return (
    <BottomSheet
      isOpen={aberto}
      onClose={aoFechar}
      title="Os meus pagamentos"
      tone="dark"
      icon={
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-display font-black ${
          estado.cor === 'vermelho'
            ? 'bg-csc-red/20 text-csc-vermelho-texto'
            : estado.cor === 'laranja'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-csc-light/18 text-csc-verde-texto'
        }`}>
          €
        </div>
      }
    >
      {estado.loading ? (
        <div className="flex justify-center py-10" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-csc-gold border-t-transparent" />
          <span className="sr-only">A carregar…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* O estado, em grande: a mesma cor do sinal do cabeçalho. */}
          {estado.cor === 'vermelho' ? (
            <div className="cartao-simples bg-csc-red/10 border-csc-red/30 p-4">
              <p className="flex items-center gap-1.5 font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-vermelho-texto">
                <TriangleAlert size={12} />
                Em atraso
              </p>
              <p className="font-display font-black text-[30px] text-white mt-1 tabular-nums leading-none">
                {fmt(emDivida)}
              </p>
              <p className="text-[11px] leading-relaxed text-white/65 mt-2">
                {estado.emAtraso.length === 1
                  ? '1 pagamento passou do prazo.'
                  : `${estado.emAtraso.length} pagamentos passaram do prazo.`}
              </p>
            </div>
          ) : estado.cor === 'laranja' ? (
            <div className="cartao-simples bg-amber-500/10 border-amber-400/30 p-4">
              <p className="flex items-center gap-1.5 font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-amber-300">
                <TriangleAlert size={12} />
                A vencer
              </p>
              <p className="font-display font-black text-[30px] text-white mt-1 tabular-nums leading-none">
                {fmt(estado.totalEmAviso)}
              </p>
              <p className="text-[11px] leading-relaxed text-white/65 mt-2">
                {estado.aVencer.length === 1
                  ? `1 pagamento vence nos próximos ${DIAS_DE_AVISO} dias.`
                  : `${estado.aVencer.length} pagamentos vencem nos próximos ${DIAS_DE_AVISO} dias.`}
              </p>
            </div>
          ) : (
            <div className="cartao-simples bg-csc-light/10 border-csc-light/28 p-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-csc-light/20 text-csc-verde-texto flex items-center justify-center shrink-0">
                <Check size={17} />
              </span>
              <p className="text-[12px] font-display font-bold text-white">
                Não tens nada em atraso.
              </p>
            </div>
          )}

          {grupos.length === 0 && (
            <p className="text-[11px] text-white/62 italic">
              Não há pagamentos para ti nesta época.
            </p>
          )}

          {/*
            Um bloco por categoria, que abre e fecha.

            **O cabeçalho e as linhas têm de se distinguir a olho.** Tinham o
            mesmo peso e o mesmo tamanho, e por isso "Seguro Desportivo"
            (categoria) aparecia colado a "Seguro Desportivo 26/27" (o encargo)
            sem nada a dizer que um era o título do outro. O cabeçalho passa a
            etiqueta — maiúsculas pequenas e espaçadas, sobre uma banda mais
            clara —, que é como a app escreve rótulos em todo o lado; as linhas
            ficam com o corpo do texto, uma barra de cor à esquerda com o seu
            estado, e um recuo que as põe por dentro do grupo.
          */}
          {grupos.map(g => {
            const aberto = estaAberto(g)
            return (
              <div key={g.nome} className="cartao-simples overflow-hidden">
                <button
                  type="button"
                  onClick={() => alternar(g.nome)}
                  aria-expanded={aberto}
                  className={`w-full min-h-11 flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer
                    bg-white/[0.06] transition-colors
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                      aberto ? 'border-b border-white/12' : ''
                    }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-extrabold text-[9.5px] tracking-[0.16em] uppercase text-white/70 truncate">
                      {g.nome}
                    </span>
                    <span className="block text-[10.5px] text-white/50 mt-1">
                      {g.pagos} de {g.itens.length} {g.itens.length === 1 ? 'pago' : 'pagos'}
                      {g.emFalta > 0 && ` · falta ${fmt(g.emFalta)}`}
                    </span>
                  </span>

                  {(g.temAtraso || g.temAVencer) && (
                    <span
                      className={`shrink-0 font-display font-black text-[8.5px] tracking-[0.1em] uppercase px-2 py-1 rounded-full border ${
                        g.temAtraso ? ESTADO.atraso.classe : ESTADO['a-vencer'].classe
                      }`}
                    >
                      {g.temAtraso ? 'em atraso' : 'a vencer'}
                    </span>
                  )}

                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-white/50 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
                  />
                </button>

                {aberto && (
                  <div>
                    {g.itens.map(item => (
                      <div
                        key={item.chave}
                        className="flex items-center gap-3 pl-2.5 pr-3.5 py-3 border-t border-white/7 first:border-t-0"
                      >
                        {/* A barra diz o estado sem se ler nada. */}
                        <span
                          aria-hidden="true"
                          className={`w-[3px] self-stretch rounded-full shrink-0 ${ESTADO[item.estado].barra}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-display font-extrabold text-[13px] text-white capitalize truncate">
                            {item.etiqueta}
                          </span>
                          {item.limite && (
                            <span className="block text-[10.5px] text-white/55 mt-0.5">
                              {item.estado === 'pago' ? 'pago' : 'vence'} a{' '}
                              {/* Dia e mês em números: `month: 'short'` depende dos dados
                                  de localização do browser e nem sempre os há. */}
                              {new Date(item.limite).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`font-display font-black text-[13px] tabular-nums ${
                            item.estado === 'pago' ? 'text-white/40 line-through' : 'text-white'
                          }`}>
                            {fmt(item.valor)}
                          </span>
                          <span
                            className={`font-display font-black text-[8.5px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full border ${ESTADO[item.estado].classe}`}
                          >
                            {ESTADO[item.estado].texto}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Como pagar — o mesmo texto do sinal do cabeçalho. */}
          <div>
            <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-2">
              Como pagar
            </p>
            <div className="cartao-simples p-3.5 space-y-2.5">
              <p className="text-[12px] leading-relaxed text-white/80">{COMO_PAGAR}</p>
              <p className="text-[10.5px] leading-relaxed text-white/62">
                O pagamento só fica em dia depois de o tesoureiro o registar — é ele que marca
                o mês como pago.
              </p>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

export default OsMeusPagamentos
