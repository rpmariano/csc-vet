import React from 'react'
import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { CartaoSimples, EtiquetaSeccao } from '../ui'
import { CarrosselCartoes } from './CarrosselCartoes'
import { useClub } from '../../context/ClubContext'
import { equipaDoTorneio } from '../../lib/classificacao'
import { triggerHaptic } from '../../utils/haptics'

/**
 * "Classificação" (bloco 5 da Home): uma página por prova a decorrer, e em
 * cada uma o pedaço da tabela onde estamos.
 *
 * **São cinco linhas em torno da nossa**, e não a tabela toda: numa Home não
 * cabem doze equipas, e a que se procura é sempre a do clube. Quem lidera vê o
 * topo, quem vai em último vê o fim — a `janelaDoClube` trata disso, e o
 * número da posição é o real.
 *
 * A conta é a mesma da Classificação: vive em `src/lib/classificacao.ts` desde
 * que este cartão precisou dela. Duplicar aqui os desempates dava duas tabelas
 * que podiam discordar — que é pior do que não ter nenhuma, e foi por isso que
 * durante meses este cartão só soube dizer quantas jornadas havia.
 *
 * **Só entram provas ativas.** Uma prova agendada não tem tabela nenhuma para
 * mostrar, e o cartão levaria a um ecrã vazio.
 *
 * Escolhe-se a prova arrastando o carrossel, como no próximo jogo; tocar leva
 * à classificação **dessa** prova (`?torneio=`), e não à primeira da lista.
 */

export interface LinhaDaHome {
  id: string
  posicao: number
  /*
    A equipa em bruto, e não a sigla já feita: o emblema e a sigla do próprio
    clube vêm de `club_settings`, que chega por contexto e pode chegar **depois**
    desta consulta. Resolvidos aqui, no render, a linha do clube nunca fica com
    o escudo genérico à espera da segunda volta.
  */
  equipa: { opponent_id: string | null; opponent?: { name?: string; initials?: string | null; logo_url?: string | null } | null }
  /** Jogos, diferença de golos e pontos. */
  j: number
  dg: number
  p: number
}

export interface ProvaDaHome {
  id: string
  nome: string
  epoca: string | null
  /** Quantas jornadas já foram lançadas nesta prova. */
  jornadas: number
  /** Nome do grupo a que a tabela diz respeito ("Grupo A"). */
  grupo: string | null
  /** A janela da classificação: nós e os vizinhos. Vazia enquanto não houver. */
  linhas: LinhaDaHome[]
}

const CABECALHO = 'font-display font-extrabold text-[8.5px] tracking-[0.12em] uppercase text-white/45'

export const ProvasEmCurso: React.FC<{ provas: ProvaDaHome[] }> = ({ provas }) => {
  const { clubSettings } = useClub()
  if (provas.length === 0) return null

  const paginas = provas.map(prova => (
    <CartaoSimples
      key={prova.id}
      como={Link}
      to={`/competicao?ver=classificacoes&torneio=${prova.id}`}
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

      {prova.linhas.length === 0 ? (
        <div className="flex items-center gap-3 mt-3">
          <span
            className="w-[34px] h-[34px] rounded-xl bg-white/5 border border-dashed border-white/18
              flex items-center justify-center font-display font-extrabold text-sm text-white/35 flex-none"
          >
            —
          </span>
          <span className="flex-1 text-[10.5px] leading-snug text-white/62">
            {prova.jornadas === 0
              ? 'Sem jornadas lançadas: a classificação aparece assim que houver resultados na prova.'
              : 'Ainda sem equipas na tabela desta prova.'}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mt-2.5 mb-1">
            {prova.grupo && (
              <span className={`${CABECALHO} flex-1 truncate`}>{prova.grupo}</span>
            )}
            <span className={`${CABECALHO} w-6 text-center`}>J</span>
            <span className={`${CABECALHO} w-7 text-center`}>DG</span>
            <span className={`${CABECALHO} w-6 text-center`}>P</span>
          </div>

          <div className="space-y-0.5">
            {prova.linhas.map(linha => {
              const { sigla, logo, eOClube } = equipaDoTorneio(linha.equipa, clubSettings)
              return (
                <div
                  key={linha.id}
                  className={`flex items-center gap-2 h-[30px] px-1.5 rounded-lg ${
                    eOClube ? 'bg-csc-gold/14' : ''
                  }`}
                >
                  <span
                    className={`w-3.5 text-center font-display font-black text-[10px] tabular-nums flex-none ${
                      eOClube ? 'text-csc-gold' : 'text-white/45'
                    }`}
                  >
                    {linha.posicao}
                  </span>
                  <span className="w-[18px] h-[18px] rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-none">
                    {logo ? (
                      <img src={logo} alt="" className="w-full h-full object-contain bg-white" />
                    ) : (
                      /* Sem emblema desenha-se um escudo e nunca as iniciais — a
                         sigla está já ao lado. */
                      <Shield size={10} className={eOClube ? 'text-csc-gold' : 'text-white/30'} />
                    )}
                  </span>
                  <span
                    className={`flex-1 min-w-0 truncate font-display font-bold text-[11px] ${
                      eOClube ? 'text-csc-gold' : 'text-white/85'
                    }`}
                  >
                    {sigla}
                  </span>
                  <span className="w-6 text-center font-bold text-[10.5px] text-white/50 tabular-nums flex-none">
                    {linha.j}
                  </span>
                  <span
                    className={`w-7 text-center font-bold text-[10.5px] tabular-nums flex-none ${
                      linha.dg > 0 ? 'text-csc-verde-texto' : linha.dg < 0 ? 'text-csc-vermelho-texto' : 'text-white/50'
                    }`}
                  >
                    {linha.dg > 0 ? `+${linha.dg}` : linha.dg}
                  </span>
                  <span
                    className={`w-6 text-center font-display font-black text-[12px] tabular-nums flex-none ${
                      eOClube ? 'text-csc-gold' : 'text-white'
                    }`}
                  >
                    {linha.p}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-white/50 mt-2">
            {prova.jornadas} {prova.jornadas === 1 ? 'jornada lançada' : 'jornadas lançadas'} — ver a
            classificação completa
          </p>
        </>
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
