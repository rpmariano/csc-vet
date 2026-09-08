import React from 'react'
import { Link } from 'react-router-dom'
import { CartaoSimples, EtiquetaSeccao } from '../ui'
import { CarrosselCartoes } from './CarrosselCartoes'
import { triggerHaptic } from '../../utils/haptics'

/**
 * "Classificação" (bloco 5 da Home): uma página por prova a decorrer.
 *
 * **Hoje mostra o estado vazio, e é a verdade.** O handoff desenha a tabela
 * com a nossa linha em dourado e a posição no canto; para a calcular é
 * preciso `tournament_matches`, que tem **zero linhas** em produção — ninguém
 * lançou jornadas ainda. Uma tabela cheia aqui seria inventada.
 *
 * **E a tabela a sério não se calcula aqui.** O algoritmo com os desempates
 * (confronto direto, diferença de golos) vive na `StandingsPage` e tem mais de
 * cem linhas. Duplicá-lo para a Home criava duas classificações que podiam
 * discordar — que é pior do que não ter nenhuma. O caminho certo é extraí-lo
 * para `src/lib`, e fica proposto em `docs/ecras-por-desenhar.md`; até lá, a
 * Home mostra a prova e leva às classificações, que é onde a conta é feita.
 */

export interface ProvaDaHome {
  id: string
  nome: string
  epoca: string | null
  /** Quantas jornadas já foram lançadas nesta prova. */
  jornadas: number
}

export const ProvasEmCurso: React.FC<{ provas: ProvaDaHome[] }> = ({ provas }) => {
  if (provas.length === 0) return null

  const paginas = provas.map(prova => (
    <CartaoSimples
      key={prova.id}
      como={Link}
      to="/competicao?ver=classificacoes"
      onClick={() => triggerHaptic('light')}
      className="block px-4 py-3.5 cursor-pointer transition-transform duration-150 active:scale-97
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
    >
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 font-display font-extrabold text-[13px] text-white truncate">
          {prova.nome}
        </span>
        {prova.epoca && <span className="text-[10px] text-white/62 flex-none">{prova.epoca}</span>}
      </div>

      {prova.jornadas === 0 ? (
        <div className="flex items-center gap-3 mt-3">
          <span
            className="w-[34px] h-[34px] rounded-xl bg-white/5 border border-dashed border-white/18
              flex items-center justify-center font-display font-extrabold text-sm text-white/35 flex-none"
          >
            —
          </span>
          <span className="flex-1 text-[10.5px] leading-snug text-white/62">
            Sem jornadas lançadas: a classificação aparece assim que houver resultados na prova.
          </span>
        </div>
      ) : (
        <p className="text-[10.5px] text-white/62 mt-2">
          {prova.jornadas} {prova.jornadas === 1 ? 'jornada lançada' : 'jornadas lançadas'} — ver a
          classificação completa
        </p>
      )}
    </CartaoSimples>
  ))

  return (
    <section>
      <EtiquetaSeccao className="mb-2">Classificação</EtiquetaSeccao>
      <CarrosselCartoes paginas={paginas} etiqueta="Provas a decorrer" />
    </section>
  )
}

export default ProvasEmCurso
