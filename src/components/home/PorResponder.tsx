import React from 'react'
import { useNavigate } from 'react-router-dom'
import { CartaoSimples, EtiquetaSeccao } from '../ui'
import { triggerHaptic } from '../../utils/haptics'
import { CarrosselCartoes } from './CarrosselCartoes'

/**
 * "Por responder" (bloco 3 da Home): os compromissos que ainda esperam a
 * resposta do próprio, um por página do carrossel.
 *
 * **Os treinos entram, mas só dentro da janela deles** — seis dias antes,
 * decidido pelo `convocatoriaFechada`. São semanais e convocam
 * automaticamente todos os aptos: sem janela, esta lista tinha sempre o treino
 * da semana seguinte, e a pergunta perdia o efeito. O que nunca acontece é um
 * treino subir ao cartão de cima — esse é dos jogos.
 *
 * O bloco desaparece quando não há nada por responder, que é o estado normal:
 * de 1200 convocatórias em produção, 9 tiveram resposta.
 */

export interface PendenteDaHome {
  id: string
  titulo: string
  tipo: 'match' | 'practice' | 'gathering'
  date_time: string
  local: string
  prova: string | null
}

const TIPO = { match: 'Jogo', practice: 'Treino', gathering: 'Convívio' } as const

const DIA = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' })
const DIA_SEMANA = new Intl.DateTimeFormat('pt-PT', { weekday: 'long' })

export const PorResponder: React.FC<{
  pendentes: PendenteDaHome[]
  aoResponder: (id: string, status: 'confirmed' | 'declined') => void
}> = ({ pendentes, aoResponder }) => {
  const navegar = useNavigate()
  if (pendentes.length === 0) return null

  const paginas = pendentes.map(p => {
    const quando = new Date(p.date_time)
    const diaSemana = DIA_SEMANA.format(quando)
    const abrir = () => {
      triggerHaptic('light')
      navegar(`/calendar?event=${p.id}`)
    }

    return (
      /* O cartão abre o evento. Tem os dois botões de resposta lá dentro, por
         isso não pode ser um `<button>` — papel e teclas à mão, como no resto
         da app. */
      <CartaoSimples
        key={p.id}
        role="button"
        tabIndex={0}
        onClick={abrir}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            abrir()
          }
        }}
        aria-label={`Ver ${TIPO[p.tipo].toLowerCase()}: ${p.titulo}, ${DIA.format(quando).replace('.', '')}`}
        className="px-4 py-3.5 cursor-pointer transition-transform duration-150 active:scale-97
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-gold">
            {TIPO[p.tipo]}
          </span>
          <span className="flex-1 text-right font-display font-extrabold text-[11px] text-white/80 uppercase">
            {DIA.format(quando).replace('.', '')}
          </span>
        </div>

        <p className="font-display font-extrabold text-[15px] text-white mt-1.5 truncate">{p.titulo}</p>
        <p className="text-[10.5px] text-white/62 mt-0.5 truncate">
          {diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)},{' '}
          {quando.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          {p.local ? ` · ${p.local}` : ''}
          {p.prova ? ` · ${p.prova}` : ''}
        </p>

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); aoResponder(p.id, 'confirmed') }}
            className="flex-1 h-11 rounded-[22px] bg-white/9 border border-white/20 text-white
              font-display font-bold text-[13px] cursor-pointer transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            Vou
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); aoResponder(p.id, 'declined') }}
            className="flex-1 h-11 rounded-[22px] bg-white/9 border border-white/20 text-white
              font-display font-bold text-[13px] cursor-pointer transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            Não
          </button>
        </div>
      </CartaoSimples>
    )
  })

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <EtiquetaSeccao className="flex-1">Por responder</EtiquetaSeccao>
        <span
          className="font-display font-extrabold text-[10px] text-csc-tinta bg-csc-gold rounded-full
            min-w-[20px] h-5 px-1.5 flex items-center justify-center flex-none"
        >
          {pendentes.length}
        </span>
      </div>
      <CarrosselCartoes paginas={paginas} etiqueta="Compromissos por responder" />
    </section>
  )
}

export default PorResponder
