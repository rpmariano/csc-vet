import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Pencil, Trash2, Phone, User, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { VistaDetalhe } from '../VistaDetalhe'
import { formatOpponentSigla } from '../../lib/siglas'
import { EtiquetaSeccao } from '../ui'
import { triggerHaptic } from '../../utils/haptics'

/**
 * Ficha do adversário (ecrã 9h).
 *
 * Até aqui um adversário só se editava num diálogo: não havia sítio nenhum
 * onde ver o historial de confrontos, que é a única coisa que se quer saber
 * antes de um jogo. A ficha junta o que a base já tem — o V/E/D, o campo
 * principal, os jogos entre nós — e deixa a edição para o diálogo que já
 * existia.
 *
 * **O bloco das provas é desenhado vazio de propósito.** `tournament_matches`
 * não tem uma única linha em produção: sem jornadas lançadas não há
 * classificação para calcular, e a alternativa — esconder o bloco — deixava a
 * pessoa sem perceber se o adversário não está em prova nenhuma ou se é a app
 * que não sabe. Fica a prova, a tracejado, com o caminho para lançar.
 */

export interface AdversarioDaFicha {
  id: string
  name: string
  initials?: string
  logo_url?: string
  contact_name?: string
  contact_phone?: string
  home_field_id: string | null
}

interface Confronto {
  id: string
  date_time: string
  home_away?: 'home' | 'away' | 'neutral' | null
  home_score: number | null
  away_score: number | null
  tournament: { name: string } | null
}

interface ProvaDoAdversario {
  /** Jornadas já lançadas na prova, e quantas têm resultado. */
  jornadas: number
  comResultado: number
  id: string
  nome: string
  epoca: string | null
  estado: string
}

interface FichaAdversarioProps {
  adversario: AdversarioDaFicha | null
  /** Nome do campo principal, já resolvido pela página. */
  campoPrincipal: { id: string; name: string; address: string } | null
  siglaClube: string
  aoFechar: () => void
  aoEditar: () => void
  aoEliminar: () => void
}

const RESULTADO = {
  vitoria: { letra: 'V', classe: 'bg-csc-light/30 text-csc-verde-texto' },
  empate: { letra: 'E', classe: 'bg-white/12 text-white/70' },
  derrota: { letra: 'D', classe: 'bg-csc-red/25 text-csc-vermelho-texto' },
} as const

/**
 * O resultado do nosso ponto de vista.
 *
 * `home_score`/`away_score` são sempre casa-fora do jogo, não nós-eles: num
 * jogo fora, o nosso golo é o `away_score`. Trocar isto invertia metade do
 * historial, e com dois adversários em produção ninguém daria por ela.
 */
function comoNosCorreu(jogo: Confronto): keyof typeof RESULTADO | null {
  if (jogo.home_score === null || jogo.away_score === null) return null
  const fora = jogo.home_away === 'away'
  const nos = fora ? jogo.away_score : jogo.home_score
  const eles = fora ? jogo.home_score : jogo.away_score
  return nos > eles ? 'vitoria' : nos === eles ? 'empate' : 'derrota'
}

export const FichaAdversario: React.FC<FichaAdversarioProps> = ({
  adversario,
  campoPrincipal,
  siglaClube,
  aoFechar,
  aoEditar,
  aoEliminar,
}) => {
  const [confrontos, setConfrontos] = useState<Confronto[] | null>(null)
  const [provas, setProvas] = useState<ProvaDoAdversario[]>([])

  const id = adversario?.id ?? null

  useEffect(() => {
    if (!id) {
      setConfrontos(null)
      setProvas([])
      return
    }
    let cancelado = false
    setConfrontos(null)

    const carregar = async () => {
      const [jogos, inscricoes] = await Promise.all([
        supabase
          .from('events')
          .select('id, date_time, home_away, home_score, away_score, tournament:tournaments(name)')
          .eq('opponent_id', id)
          .eq('type', 'match')
          .order('date_time', { ascending: false }),
        supabase
          .from('tournament_teams')
          .select('tournament:tournaments(id, name, season, status)')
          .eq('opponent_id', id),
      ])

      if (cancelado) return

      setConfrontos((jogos.data ?? []) as unknown as Confronto[])

      const linhas = (inscricoes.data ?? []) as unknown as {
        tournament: { id: string; name: string; season: string | null; status: string } | null
      }[]
      const provasDoAdversario = linhas
        .map(l => l.tournament)
        .filter((t): t is NonNullable<typeof t> => Boolean(t))

      /*
        Um adversário pode estar em mais do que uma prova, e cada uma está no
        seu ponto: umas com jornadas lançadas, outras ainda por começar. A
        linha dizia sempre "sem jornadas lançadas", fosse qual fosse o caso —
        um texto fixo a fazer-se passar por informação.
      */
      const jornadas = await Promise.all(
        provasDoAdversario.map(t =>
          supabase
            .from('tournament_matches')
            .select('home_score', { count: 'exact' })
            .eq('tournament_id', t.id),
        ),
      )

      if (cancelado) return

      setProvas(
        provasDoAdversario.map((t, i) => {
          const linhasDaProva = (jornadas[i].data ?? []) as { home_score: number | null }[]
          return {
            id: t.id,
            nome: t.name,
            epoca: t.season,
            estado: t.status,
            jornadas: jornadas[i].count ?? linhasDaProva.length,
            comResultado: linhasDaProva.filter(j => j.home_score !== null).length,
          }
        }),
      )
    }

    carregar()
    return () => { cancelado = true }
  }, [id])

  const comResultado = (confrontos ?? []).filter(j => comoNosCorreu(j) !== null)
  const contagem = comResultado.reduce(
    (acc, j) => {
      const r = comoNosCorreu(j)
      if (r) acc[r] += 1
      return acc
    },
    { vitoria: 0, empate: 0, derrota: 0 },
  )

  return (
    <VistaDetalhe
      isOpen={Boolean(adversario)}
      onClose={aoFechar}
      title={adversario?.name ?? ''}
      description="Adversário"
      ariaLabel={'Ficha do adversário ' + (adversario?.name ?? '')}
    >
      {adversario && (
        <div className="space-y-3">
          {/*
            O cartão de identidade **não repete o nome**: esse é o título da
            persiana, logo por cima. Repetia-o truncado e punha-lhe por baixo o
            nome do campo — que num clube como o "Grupo Desportivo dos
            Pescadores da Costa da Caparica" é quase a mesma frase, e lia-se o
            nome três vezes seguidas. O campo tem a sua secção mais abaixo.

            O que fica é o que o título não diz: o emblema e a sigla — a que
            aparece nos placares e nas tabelas — e o histórico contra nós.
          */}
          <div className="cartao-vidro px-4 py-4">
            <div className="flex items-center gap-3.5">
              {adversario.logo_url ? (
                <img
                  src={adversario.logo_url}
                  alt=""
                  className="w-14 h-14 object-contain bg-white rounded-2xl border border-white/12 p-1.5 shrink-0"
                />
              ) : (
                /* Sem emblema desenha-se um escudo, nunca as iniciais: a sigla
                   está aqui mesmo ao lado, e repeti-la era lê-la duas vezes. */
                <span
                  className="w-14 h-14 bg-white/10 border border-white/15 rounded-2xl flex items-center justify-center
                    text-white/35 shrink-0"
                  aria-hidden="true"
                >
                  <Shield size={24} />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62">
                  Sigla nos placares
                </span>
                <span className="block font-display font-black text-[22px] text-white leading-none mt-1 truncate">
                  {adversario.initials || formatOpponentSigla(adversario)}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/10">
              {([
                ['Jogos', comResultado.length],
                ['V', contagem.vitoria],
                ['E', contagem.empate],
                ['D', contagem.derrota],
              ] as const).map(([etiqueta, valor]) => (
                <div key={etiqueta} className="text-center">
                  <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/62">
                    {etiqueta}
                  </p>
                  <p className="font-display font-black text-[20px] text-white mt-1 tabular-nums leading-none">
                    {confrontos === null ? '–' : valor}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Contactos, quando os há. */}
          {(adversario.contact_name || adversario.contact_phone) && (
            <div className="cartao-simples flex items-center gap-3 px-4 py-3">
              {adversario.contact_name && (
                <span className="flex items-center gap-1.5 min-w-0 flex-1 text-[11.5px] text-white/70">
                  <User size={13} className="text-white/62 shrink-0" />
                  <span className="truncate">{adversario.contact_name}</span>
                </span>
              )}
              {adversario.contact_phone && (
                <a
                  href={'tel:' + adversario.contact_phone.replace(/[^\d+]/g, '')}
                  onClick={() => triggerHaptic('light')}
                  className="h-11 px-3.5 rounded-[18px] bg-white/8 border border-white/15 text-csc-gold
                    font-display font-extrabold text-[11px] flex items-center gap-1.5 shrink-0
                    transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  <Phone size={13} /> Ligar
                </a>
              )}
            </div>
          )}

          {/* Campo principal */}
          <section>
            <EtiquetaSeccao className="mb-2">Campo principal</EtiquetaSeccao>
            <div className="cartao-simples flex items-center gap-3 px-4 py-3.5">
              <MapPin size={18} className="text-csc-gold shrink-0" />
              <span className="flex-1 min-w-0">
                {campoPrincipal ? (
                  <>
                    <span className="block font-display font-bold text-[12.5px] text-white truncate">
                      {campoPrincipal.name}
                    </span>
                    {campoPrincipal.address && (
                      <span className="block text-[10.5px] text-white/62 mt-0.5 truncate">
                        {campoPrincipal.address}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="block text-[11.5px] text-white/62">Nenhum campo associado</span>
                )}
              </span>
              {/*
                O handoff manda este botão para a lista de campos, que é uma
                lista de leitura e não mudava nada. Quem muda o campo principal
                de um adversário é o diálogo de edição, que já tem o seletor —
                é para lá que vai.
              */}
              <button
                type="button"
                onClick={() => { triggerHaptic('light'); aoEditar() }}
                className="h-11 px-3.5 rounded-[18px] bg-white/8 border border-white/15 text-white
                  font-display font-extrabold text-[11px] flex items-center shrink-0 cursor-pointer
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                Mudar
              </button>
            </div>
          </section>

          {/* As provas em que o adversário está inscrito — podem ser várias, e
              cada uma no seu ponto. */}
          {provas.length > 0 && (
            <section>
              <EtiquetaSeccao className="mb-2">
                {provas.length === 1 ? 'Prova em que participa' : 'Provas em que participa'}
              </EtiquetaSeccao>
              <div className="cartao-simples overflow-hidden">
                {provas.map(prova => (
                  <div
                    key={prova.id}
                    className="flex items-center gap-3 px-4 py-3 border-t border-white/7 first:border-t-0"
                  >
                    <span
                      className="w-[30px] h-[30px] rounded-[10px] bg-white/5 border border-dashed border-white/18
                        flex items-center justify-center font-display font-extrabold text-xs text-white/35 shrink-0"
                    >
                      —
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display font-bold text-xs text-white truncate">{prova.nome}</span>
                      <span className="block text-[9.5px] text-white/62 mt-0.5 truncate">
                        {[
                          prova.epoca,
                          prova.estado,
                          prova.jornadas === 0
                            ? 'sem jornadas lançadas'
                            : `${prova.comResultado} de ${prova.jornadas} ${prova.jornadas === 1 ? 'jogo' : 'jogos'} com resultado`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Link
                      to={`/competicao?ver=classificacoes&torneio=${prova.id}`}
                      onClick={() => { triggerHaptic('light'); aoFechar() }}
                      className="font-display font-extrabold text-[10px] text-csc-gold shrink-0 min-h-11 flex items-center px-2
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-lg"
                    >
                      Ver prova
                    </Link>
                  </div>
                ))}
                {provas.some(p => p.jornadas === 0) && (
                  <p className="px-4 py-3 border-t border-white/7 text-[10px] leading-normal text-white/62">
                    Numa prova sem jornadas lançadas não há classificação para mostrar. Os jogos
                    contra nós contam na mesma, e estão aqui em baixo.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Jogos entre nós */}
          <section>
            <EtiquetaSeccao className="mb-2">Jogos entre nós</EtiquetaSeccao>
            {confrontos === null ? (
              <div className="cartao-simples h-20 animate-pulse" />
            ) : confrontos.length === 0 ? (
              <div className="cartao-simples border-dashed px-4 py-6 text-center">
                <p className="text-[11.5px] text-white/62">Ainda não jogámos com este adversário.</p>
              </div>
            ) : (
              <div className="cartao-simples overflow-hidden">
                {confrontos.map(jogo => {
                  const r = comoNosCorreu(jogo)
                  const fora = jogo.home_away === 'away'
                  const quando = new Date(jogo.date_time)
                  return (
                    <div
                      key={jogo.id}
                      className="flex items-center gap-3 px-4 py-3 border-t border-white/7 first:border-t-0"
                    >
                      <span
                        className={`w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0
                          font-display font-extrabold text-xs ${
                            r ? RESULTADO[r].classe : 'bg-white/5 border border-dashed border-white/18 text-white/35'
                          }`}
                      >
                        {r ? RESULTADO[r].letra : '–'}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-display font-bold text-xs text-white truncate">
                          {r
                            ? fora
                              ? `${adversario.initials || adversario.name} ${jogo.home_score}–${jogo.away_score} ${siglaClube}`
                              : `${siglaClube} ${jogo.home_score}–${jogo.away_score} ${adversario.initials || adversario.name}`
                            : `${siglaClube} vs ${adversario.initials || adversario.name}`}
                        </span>
                        <span className="block text-[9.5px] text-white/62 mt-0.5 truncate">
                          {quando.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                          {jogo.tournament?.name ? ` · ${jogo.tournament.name}` : ''}
                          {' · '}
                          {jogo.home_away === 'neutral' ? 'neutro' : fora ? 'fora' : 'casa'}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Editar e eliminar */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { triggerHaptic('light'); aoEditar() }}
              className="flex-1 h-12 rounded-3xl bg-csc-gold text-csc-tinta font-display font-extrabold text-[12.5px]
                flex items-center justify-center gap-2 cursor-pointer transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <Pencil size={15} /> Editar adversário
            </button>
            <button
              type="button"
              onClick={() => { triggerHaptic('warning'); aoEliminar() }}
              disabled={confrontos !== null && confrontos.length > 0}
              className="flex-1 h-12 rounded-3xl bg-csc-red/15 border border-csc-red/35 text-csc-vermelho-texto
                font-display font-extrabold text-[12.5px] flex items-center justify-center gap-2 cursor-pointer
                transition-transform duration-150 active:scale-97 disabled:opacity-45 disabled:cursor-not-allowed
                disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <Trash2 size={15} /> Eliminar
            </button>
          </div>

          {confrontos !== null && confrontos.length > 0 && (
            <p className="text-[10px] leading-normal text-white/62 px-1">
              Não se pode eliminar um adversário com jogos registados — nesse caso só se edita.
            </p>
          )}
        </div>
      )}
    </VistaDetalhe>
  )
}

export default FichaAdversario
