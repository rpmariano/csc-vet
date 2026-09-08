import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Pencil, Trash2, Phone, User } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { VistaDetalhe } from '../VistaDetalhe'
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
      setProvas(
        linhas
          .map(l => l.tournament)
          .filter((t): t is NonNullable<typeof t> => Boolean(t))
          .map(t => ({ id: t.id, nome: t.name, epoca: t.season, estado: t.status })),
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
          {/* Identidade */}
          <div className="cartao-simples flex items-center gap-3.5 px-4 py-3.5">
            {adversario.logo_url ? (
              <img
                src={adversario.logo_url}
                alt=""
                className="w-13 h-13 object-contain bg-white rounded-xl border border-white/12 p-1.5 shrink-0"
              />
            ) : (
              <span
                className="w-13 h-13 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center
                  font-display font-black text-white/70 text-sm shrink-0"
              >
                {adversario.initials || adversario.name.substring(0, 3).toUpperCase()}
              </span>
            )}
            <span className="flex-1 min-w-0">
              <span className="block font-display font-extrabold text-[15px] text-white truncate">
                {adversario.name}
              </span>
              <span className="block text-[11px] text-white/62 mt-0.5 truncate">
                {campoPrincipal ? campoPrincipal.name : 'Sem campo principal'}
              </span>
            </span>
          </div>

          {/* Jogos · V · E · D */}
          <div className="grid grid-cols-4 gap-2">
            {([
              ['Jogos', comResultado.length],
              ['V', contagem.vitoria],
              ['E', contagem.empate],
              ['D', contagem.derrota],
            ] as const).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="cartao-simples p-3 text-center">
                <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/62">
                  {etiqueta}
                </p>
                <p className="font-display font-black text-[20px] text-white mt-1 tabular-nums leading-none">
                  {confrontos === null ? '–' : valor}
                </p>
              </div>
            ))}
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

          {/* Torneios e posições — hoje sempre em estado vazio. */}
          {provas.length > 0 && (
            <section>
              <EtiquetaSeccao className="mb-2">Torneios e posições</EtiquetaSeccao>
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
                        {[prova.epoca, prova.estado, 'sem jornadas lançadas'].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Link
                      to="/admin?ver=tournaments"
                      onClick={() => { triggerHaptic('light'); aoFechar() }}
                      className="font-display font-extrabold text-[10px] text-csc-gold shrink-0 min-h-11 flex items-center px-2
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-lg"
                    >
                      Lançar
                    </Link>
                  </div>
                ))}
                <p className="px-4 py-3 border-t border-white/7 text-[10px] leading-normal text-white/62">
                  A posição e os pontos aparecem aqui assim que houver jornadas lançadas na prova.
                  Os jogos contra nós contam sempre, mesmo sem classificação.
                </p>
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
