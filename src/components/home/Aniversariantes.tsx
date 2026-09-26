import React from 'react'
import { CartaoSimples, EtiquetaSeccao } from '../ui'

/**
 * "Aniversários deste mês" (bloco 4 da Home): uma fila de fotografias, uma
 * por pessoa, e não uma frase.
 *
 * Era uma linha de texto a fingir de cartão — "Nuno a 12 · Paulo faz anos
 * hoje" — do mesmo tamanho apagado de uma nota de rodapé, ao lado de blocos
 * como o "Último jogo" que têm o seu próprio `<EtiquetaSeccao>` em maiúsculas
 * pequenas. Segue-se agora a forma dos outros blocos da Home: título de
 * secção por cima, cartão por baixo.
 *
 * **Continua a ser um cartão só** — a fila de fotografias corre por dentro
 * dele, não uma por pessoa: seriam onze cartões irmãos com um sinal do
 * clube já tem regra contra ("uma lista são linhas num cartão, nunca
 * cartões irmãos"). Aqui não há linhas a ler de cima a baixo, é uma galeria
 * que se percorre com o dedo — por isso a fotografia é que carrega a
 * informação, como a bola verde da camisola já fazia.
 *
 * **Quem faz anos hoje tem o aro dourado**, o sinal de destaque da app, em
 * vez da data por baixo — é a pessoa que se quer ver primeiro, e "Hoje" diz
 * isso melhor do que "a 26".
 */

export interface AniversarianteDaHome {
  id: string
  nome: string
  /** Dia do mês, 1–31. */
  dia: number
  /** Mês, 1–12 — todas as pessoas do array são do mesmo mês. */
  mes: number
  foto: string | null
}

const DIA_DA_SEMANA = new Intl.DateTimeFormat('pt-PT', { weekday: 'short' })

function diaDaSemana(dia: number, mes: number): string {
  const texto = DIA_DA_SEMANA.format(new Date(new Date().getFullYear(), mes - 1, dia)).replace('.', '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export const Aniversariantes: React.FC<{ pessoas: AniversarianteDaHome[] }> = ({ pessoas }) => {
  if (pessoas.length === 0) return null

  const hoje = new Date().getDate()

  return (
    <section>
      <EtiquetaSeccao className="mb-2">Aniversários deste mês</EtiquetaSeccao>
      <CartaoSimples className="p-4">
        <div className="flex gap-3.5 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {pessoas.map(p => {
            const eHoje = p.dia === hoje
            return (
              <div key={p.id} className="flex flex-col items-center gap-1.5 w-[58px] shrink-0 text-center">
                <div className="relative">
                  <span
                    className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden
                      font-display font-extrabold text-[15px] text-white/85
                      ${eHoje ? 'ring-2 ring-csc-gold' : 'ring-2 ring-white/15'}`}
                    style={{ background: p.foto ? undefined : 'linear-gradient(140deg,#3a4143,#1b1f20)' }}
                  >
                    {p.foto ? (
                      <img src={p.foto} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{p.nome.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <span
                    className={`absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full
                      flex items-center justify-center font-display font-black text-[9px] tabular-nums
                      ${eHoje ? 'bg-csc-gold text-csc-tinta' : 'bg-csc-blue text-white'}`}
                  >
                    {p.dia}
                  </span>
                </div>
                <span className="block font-display font-bold text-[10px] text-white truncate w-full">
                  {p.nome}
                </span>
                <span className={`block text-[9px] ${eHoje ? 'text-csc-gold font-bold' : 'text-white/55'}`}>
                  {eHoje ? 'Hoje' : diaDaSemana(p.dia, p.mes)}
                </span>
              </div>
            )
          })}
        </div>
      </CartaoSimples>
    </section>
  )
}

export default Aniversariantes
