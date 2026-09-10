import React from 'react'
import { ChevronRight } from 'lucide-react'
import type { ScheduledPayment } from './tipos'
import { ETIQUETA_GRUPO, BARRA_ATRASO, BARRA_AVISO, BARRA_NEUTRA, fmtEuro, fmtData } from './estilos'

/**
 * A lista de Pagamentos Programados, agrupada por categoria.
 *
 * **O cabeçalho do grupo e a linha têm de se distinguir a olho.** Eram caixas
 * arredondadas do mesmo cinzento, encostadas umas às outras: a banda
 * "Seguro Desportivo" e a linha "Seguro desportivo 26/27" liam-se como dois
 * itens irmãos, e nada dizia que um era o título do outro. Agora cada
 * categoria é **uma caixa só** — a banda mais clara em cima, as linhas por
 * dentro separadas por um fio —, que é o desenho de "Os meus pagamentos".
 *
 * **E a linha não repete o que o cabeçalho já diz:** dentro de "Inscrição —
 * Liga Masters +35", "Liga Masters +35 — Tranche 1" fica "Tranche 1". O que
 * distingue as três linhas é o número da tranche, e era a única parte que se
 * lia igual em todas.
 *
 * Existia duas vezes, com dois aspetos: cinzenta na Visão Geral e em caixas
 * âmbar com um botão em Despesas/Receitas. É a mesma lista, e passa a ser o
 * mesmo bloco — o que muda é o que a linha faz: ali leva às Despesas, aqui
 * abre o registo do pagamento.
 */

/**
 * Dias a que um prazo destes já se assinala a âmbar. São 30, e não os 8 do
 * `useEstadoPagamentos`: aquilo é a quota de uma pessoa, que se paga no
 * próprio dia; isto é uma tranche de mil euros a terceiros, que a direção tem
 * de ver a chegar com um mês de antecedência.
 */
const DIAS_DE_AVISO = 30

/* O intervalo dos combinantes vai em escapes e nao em caracteres: um
   acento solto no meio de uma classe de caracteres nao se le. */
const semAcentos = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Tira do título o que o cabeçalho do grupo já diz, quando o título vem em
 * partes separadas por travessão. Um título de uma parte só fica intacto: sem
 * ele a linha ficaria sem nome nenhum.
 */
const semRepetirGrupo = (titulo: string, grupo: string): string => {
  const partes = titulo.split('—').map(p => p.trim()).filter(Boolean)
  if (partes.length < 2) return titulo
  const cabecalho = semAcentos(grupo)
  const restantes = partes.filter(p => !cabecalho.includes(semAcentos(p)))
  return restantes.length > 0 ? restantes.join(' — ') : titulo
}

export interface PagamentosProgramadosProps {
  /** `[categoria, linhas]`, como sai do `scheduledPaymentsByCategory`. */
  grupos: [string, ScheduledPayment[]][]
  /** O que fazer ao tocar numa linha. */
  aoTocar: (pagamento: ScheduledPayment) => void
  /**
   * `'pagar'` põe a pastilha dourada de registar o pagamento; `'ver'` põe a
   * seta de quem só vai ver o assunto noutro sítio.
   */
  accao?: 'ver' | 'pagar'
}

export const PagamentosProgramados: React.FC<PagamentosProgramadosProps> = ({
  grupos,
  aoTocar,
  accao = 'ver',
}) => {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  return (
    <div className="space-y-2.5">
      {grupos.map(([categoria, linhas]) => {
        const total = linhas.reduce((soma, p) => soma + p.amount, 0)
        return (
          <div key={categoria} className="rounded-2xl border border-white/12 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.09] border-b border-white/12">
              <span className={`${ETIQUETA_GRUPO} flex-1 min-w-0 truncate`}>{categoria}</span>
              {/* O total só se escreve quando resume mais do que uma linha —
                  com uma só, repetia o valor que está logo por baixo. */}
              {linhas.length > 1 && (
                <span className="shrink-0 font-display font-black text-[10px] tabular-nums text-white/55">
                  {linhas.length} × · {fmtEuro(total)}
                </span>
              )}
            </div>

            {linhas.map((p, i) => {
              const prazo = p.due_date ? new Date(p.due_date) : null
              const emAtraso = prazo ? prazo < hoje : false
              const aVencer = prazo !== null && !emAtraso
                && (prazo.getTime() - hoje.getTime()) / 86400000 <= DIAS_DE_AVISO
              const barra = emAtraso ? BARRA_ATRASO : aVencer ? BARRA_AVISO : BARRA_NEUTRA
              const corPrazo = emAtraso ? 'text-csc-vermelho-texto' : aVencer ? 'text-amber-300' : 'text-white/50'
              const nome = semRepetirGrupo(p.title, categoria)
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => aoTocar(p)}
                  aria-label={
                    accao === 'pagar'
                      ? `Registar o pagamento de ${nome}, ${fmtEuro(p.amount)}.`
                      : `${nome}, ${fmtEuro(p.amount)}. Ver e registar pagamento.`
                  }
                  className={`w-full min-h-11 flex items-stretch gap-2.5 text-left cursor-pointer
                    bg-white/[0.02] hover:bg-white/[0.07] transition-colors
                    focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold
                    ${i > 0 ? 'border-t border-white/8' : ''}`}
                >
                  <span className={`w-[3px] shrink-0 ${barra}`} aria-hidden="true" />
                  <span className="flex-1 min-w-0 py-2.5">
                    <span className="block font-display font-extrabold text-[13px] text-white truncate">
                      {nome}
                    </span>
                    <span className={`block text-[10px] font-bold mt-0.5 ${corPrazo}`}>
                      {p.due_date
                        ? `${emAtraso ? 'Em atraso desde' : 'Vence'} ${fmtData(p.due_date)}`
                        : 'Sem prazo definido'}
                    </span>
                  </span>
                  <span className="shrink-0 self-center font-display font-black text-[13px] tabular-nums text-white">
                    {fmtEuro(p.amount)}
                  </span>
                  {accao === 'pagar' ? (
                    <span
                      className="shrink-0 self-center mr-2 ml-0.5 px-2 py-1 rounded-full bg-csc-gold text-csc-tinta
                        font-display font-black text-[9px] tracking-[0.1em] uppercase whitespace-nowrap"
                      aria-hidden="true"
                    >
                      Pagar
                    </span>
                  ) : (
                    <ChevronRight size={16} className="shrink-0 self-center mr-2 text-white/35" aria-hidden="true" />
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export default PagamentosProgramados
