import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { CartaoSimples, EtiquetaSeccao } from '../ui'
import { triggerHaptic } from '../../utils/haptics'

/**
 * "Último jogo" (bloco 4 da Home): o resultado e quem marcou.
 *
 * **Sem cronologia.** O cartão 4a do handoff desenha os golos ao minuto e com
 * a assistência de cada um — "12' Nuno Aleixo, as. Paulo". A tabela `stats`
 * guarda **contagens por jogador e por jogo** (`goals`, `assists`), não golos
 * como acontecimentos: não há minuto, e não há forma de dizer quem assistiu
 * qual golo. Mostrar minutos inventados num placar oficial seria pior do que
 * não os mostrar.
 *
 * Fica o que a base sabe: o resultado e a lista de quem marcou e de quem
 * assistiu, com as contagens. Uma cronologia a sério pede uma tabela de golos
 * — ver a proposta em `docs/ecras-por-desenhar.md`.
 */

export interface MarcadorDaHome {
  playerId: string
  nome: string
  golos: number
  assistencias: number
}

export interface UltimoJogoDaHome {
  id: string
  date_time: string
  home_score: number
  away_score: number
  home_away?: 'home' | 'away' | 'neutral' | null
  adversario: string
  prova: string | null
  marcadores: MarcadorDaHome[]
}

const DIA = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' })

export const UltimoJogo: React.FC<{ jogo: UltimoJogoDaHome; siglaClube: string }> = ({
  jogo,
  siglaClube,
}) => {
  const fora = jogo.home_away === 'away'
  const nos = fora ? jogo.away_score : jogo.home_score
  const eles = fora ? jogo.home_score : jogo.away_score
  const resultado = nos > eles ? 'vitoria' : nos === eles ? 'empate' : 'derrota'

  const cor = {
    vitoria: 'bg-csc-light/30 text-csc-verde-texto',
    empate: 'bg-white/12 text-white/80',
    derrota: 'bg-csc-red/25 text-csc-vermelho-texto',
  }[resultado]

  return (
    <section>
      <EtiquetaSeccao className="mb-2">Último jogo</EtiquetaSeccao>
      <CartaoSimples
        como={Link}
        to={`/competicao?ver=fichas&jogo=${jogo.id}`}
        onClick={() => triggerHaptic('light')}
        className="block px-4 py-3.5 cursor-pointer transition-transform duration-150 active:scale-97
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        <div className="flex items-center gap-3">
          <span
            className={`min-w-[52px] h-9 px-2 rounded-xl flex items-center justify-center flex-none
              font-display font-extrabold text-[14px] tabular-nums ${cor}`}
          >
            {nos}–{eles}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-extrabold text-[13px] text-white truncate">
              {siglaClube} com {jogo.adversario}
            </span>
            <span className="block text-[10.5px] text-white/62 mt-0.5 truncate">
              {DIA.format(new Date(jogo.date_time)).replace('.', '')}
              {jogo.prova ? ` · ${jogo.prova}` : ''}
            </span>
          </span>
          <ChevronRight size={16} className="text-white/35 flex-none" />
        </div>

        {jogo.marcadores.length > 0 && (
          <ul className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
            {jogo.marcadores.map(m => (
              <li key={m.playerId} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1 min-w-0 text-white truncate">{m.nome}</span>
                <span className="flex-none text-white/62">
                  {m.golos > 0 && (
                    <>
                      {m.golos} {m.golos === 1 ? 'golo' : 'golos'}
                    </>
                  )}
                  {m.golos > 0 && m.assistencias > 0 && ' · '}
                  {m.assistencias > 0 && (
                    <>
                      {m.assistencias} {m.assistencias === 1 ? 'assistência' : 'assistências'}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CartaoSimples>
    </section>
  )
}

export default UltimoJogo
