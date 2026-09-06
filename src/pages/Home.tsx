import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ShieldAlert, X, Cake, MapPin } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import { formatClubSigla, formatOpponentSigla, hasMatchReport, getRsvpDeadline } from './CalendarPage'
import { triggerHaptic } from '../utils/haptics'
import { AvatarPerfil, CartaoVidro, CartaoSimples, EtiquetaSeccao } from '../components/ui'
import { AnnouncementsInboxButton } from '../components/AnnouncementsInbox'
import {
  DEFAULT_FINANCIAL_SETTINGS,
  getSeasonLabel,
  getSeasonMonths,
} from '../lib/finance'
import type { FinancialSettings } from '../lib/finance'

/**
 * Hoje — o primeiro ecrã, e o único que responde a "o que é que me diz
 * respeito agora".
 *
 * O redesenho tirou-lhe o carrossel de jogos e a lista de treinos: isso é a
 * Agenda. Fica **um** compromisso, o próximo, com a resposta à convocatória no
 * próprio cartão; depois o estado da competição, os dois números do próprio, e
 * os anos de quem faz hoje.
 *
 * A resposta à convocatória existe uma vez só na app, e é aqui.
 */

interface Evento {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string | null
  location: string
  field_id?: string | null
  home_away?: 'home' | 'away' | 'neutral'
  is_friendly?: boolean
  is_active?: boolean
  home_score?: number | null
  away_score?: number | null
  tournament_id?: string | null
  tournament?: { id: string; name: string } | null
  field?: { name: string; address?: string | null } | null
  opponent?: { name: string; initials: string; logo_url: string } | null
}

interface Convocatoria {
  id: string
  event_id: string
  status: 'called' | 'confirmed' | 'declined'
}

interface Aniversariante {
  id: string
  nome: string
  anos: number
}

const TIPO_ETIQUETA: Record<Evento['type'], string> = {
  match: 'Jogo',
  practice: 'Treino',
  gathering: 'Convívio',
}

/** Bom dia até às 12h, boa tarde até às 20h, boa noite depois disso. */
function saudacao(agora = new Date()): string {
  const h = agora.getHours()
  if (h < 12) return 'Bom dia,'
  if (h < 20) return 'Boa tarde,'
  return 'Boa noite,'
}

/** O nome por que a pessoa é tratada: alcunha ou nome da camisola, e só depois o próprio. */
function primeiroNome(p: { name: string; nickname?: string | null; shirt_name?: string | null }): string {
  const preferido = p.nickname?.trim() || p.shirt_name?.trim()
  if (preferido) return preferido
  return p.name.trim().split(/\s+/)[0]
}

const DATA_LONGA = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const Home: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()

  const [proximo, setProximo] = useState<Evento | null>(null)
  const [minhaConvocatoria, setMinhaConvocatoria] = useState<Convocatoria | null>(null)
  const [ultimoJogo, setUltimoJogo] = useState<Evento | null>(null)
  const [golos, setGolos] = useState<number | null>(null)
  const [presencas, setPresencas] = useState<number | null>(null)
  const [aniversariantes, setAniversariantes] = useState<Aniversariante[]>([])
  const [aCarregar, setACarregar] = useState(true)

  // Alertas de suspensão — deixados por quem lança fichas de jogo, em
  // localStorage, e só visíveis a quem gere. Continuam como estavam: são um
  // aviso pontual, não um ecrã.
  const [alertasSuspensao, setAlertasSuspensao] = useState<{ chave: string; texto: string }[]>([])
  useEffect(() => {
    if (!profile || (profile.role !== 'coach' && profile.role !== 'admin')) return
    const encontrados: { chave: string; texto: string }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i)
      if (chave?.startsWith('csc_suspension_alert_')) {
        encontrados.push({ chave, texto: localStorage.getItem(chave) || '' })
      }
    }
    setAlertasSuspensao(encontrados)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    let cancelado = false

    const carregar = async () => {
      setACarregar(true)
      try {
        const inicioDeHoje = new Date()
        inicioDeHoje.setHours(0, 0, 0, 0)

        // A época do clube é a mesma regra do módulo financeiro — está lá
        // porque foi lá que primeiro fez falta, mas é a época do clube e não
        // uma noção de contabilidade.
        const { data: defs } = await supabase.from('financial_settings').select('*').maybeSingle()
        const definicoes: FinancialSettings = { ...DEFAULT_FINANCIAL_SETTINGS, ...(defs ?? {}) }
        const meses = getSeasonMonths(definicoes, getSeasonLabel(definicoes))
        const inicioEpoca = meses.length
          ? new Date(meses[0].year, meses[0].month - 1, 1)
          : new Date(new Date().getFullYear(), 0, 1)

        const [
          { data: proximos },
          { data: ultimos },
          { data: statsMeus },
          { data: presencasMinhas },
          { data: plantel },
        ] = await Promise.all([
          // O próximo compromisso, seja jogo, treino ou convívio.
          supabase
            .from('events')
            .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name), field:fields(name, address)')
            .gte('date_time', inicioDeHoje.toISOString())
            .order('date_time', { ascending: true })
            .limit(4),
          // O último jogo com resultado, para a linha da competição.
          supabase
            .from('events')
            .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name)')
            .eq('type', 'match')
            .not('home_score', 'is', null)
            .order('date_time', { ascending: false })
            .limit(1),
          supabase
            .from('stats')
            .select('goals, event:events!inner(date_time)')
            .eq('player_id', profile.id)
            .gte('event.date_time', inicioEpoca.toISOString()),
          supabase
            .from('attendances')
            .select('present, event:events!inner(date_time)')
            .eq('player_id', profile.id)
            .gte('event.date_time', inicioEpoca.toISOString()),
          supabase.from('v_players_public').select('id, name, nickname, shirt_name, birth_date'),
        ])

        if (cancelado) return

        const ativos = ((proximos as Evento[]) ?? []).filter(e => e.is_active !== false)
        const seguinte = ativos[0] ?? null
        setProximo(seguinte)
        setUltimoJogo(((ultimos as Evento[]) ?? [])[0] ?? null)

        // A minha convocatória para esse evento, se existir.
        if (seguinte) {
          const { data: conv } = await supabase
            .from('callups')
            .select('id, event_id, status')
            .eq('player_id', profile.id)
            .eq('event_id', seguinte.id)
            .maybeSingle()
          if (!cancelado) setMinhaConvocatoria((conv as Convocatoria) ?? null)
        } else {
          setMinhaConvocatoria(null)
        }

        setGolos(((statsMeus as { goals: number | null }[]) ?? []).reduce((t, s) => t + (s.goals ?? 0), 0))

        const listaPresencas = (presencasMinhas as { present: boolean }[]) ?? []
        setPresencas(
          listaPresencas.length
            ? Math.round((listaPresencas.filter(p => p.present).length / listaPresencas.length) * 100)
            : null,
        )

        const hoje = new Date()
        setAniversariantes(
          ((plantel as { id: string; name: string; nickname?: string | null; shirt_name?: string | null; birth_date?: string | null }[]) ?? [])
            .filter(p => {
              if (!p.birth_date) return false
              const d = new Date(p.birth_date)
              return d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth()
            })
            .map(p => ({
              id: p.id,
              nome: primeiroNome(p),
              anos: hoje.getFullYear() - new Date(p.birth_date as string).getFullYear(),
            })),
        )
      } catch (erro) {
        console.error('Erro a carregar a Home:', erro)
      } finally {
        if (!cancelado) setACarregar(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [profile])

  const responder = async (status: 'confirmed' | 'declined') => {
    if (!minhaConvocatoria || !proximo) return

    if (hasMatchReport(proximo)) {
      toast.error('Este jogo já tem ficha de jogo lançada — a convocatória está fechada.')
      return
    }
    const limite = getRsvpDeadline(proximo)
    if (limite !== null && Date.now() >= limite) {
      toast.error(
        `Já passou a hora de ${proximo.meeting_time ? 'concentração' : 'início'} — a convocatória está fechada.`,
      )
      return
    }

    triggerHaptic(status === 'confirmed' ? 'success' : 'warning')
    const anterior = minhaConvocatoria.status
    setMinhaConvocatoria({ ...minhaConvocatoria, status })
    const { error } = await supabase.from('callups').update({ status }).eq('id', minhaConvocatoria.id)
    if (error) {
      setMinhaConvocatoria({ ...minhaConvocatoria, status: anterior })
      toast.error('Não foi possível guardar a resposta: ' + error.message)
      return
    }
    toast.success(status === 'confirmed' ? 'Contamos contigo.' : 'Resposta registada.')
  }

  const local = useMemo(() => {
    if (!proximo) return ''
    if (proximo.location?.trim()) return proximo.location.trim()
    if (proximo.field?.name) {
      return proximo.field.address ? `${proximo.field.name} · ${proximo.field.address}` : proximo.field.name
    }
    return ''
  }, [proximo])

  if (!profile) return null

  return (
    <div className="space-y-4 pb-2">
      {/* Saudação: o cabeçalho da Home. É o único ecrã com o sino dos
          comunicados — nos outros a fotografia é a única coisa que se repete. */}
      <header className="flex items-center gap-3 pt-safe">
        <img
          src={clubSettings?.logo_url || '/csc-vet/cascais-emblem.png'}
          alt=""
          className="w-[42px] h-[42px] rounded-full bg-white object-contain p-[3px] flex-none"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] text-white/55">{saudacao()}</p>
          <p className="font-display font-extrabold text-lg text-white truncate mt-0.5">
            {primeiroNome(profile)}
          </p>
        </div>
        <AnnouncementsInboxButton tone="dark" size="md" />
        <AvatarPerfil tamanho={46} comLapis />
      </header>

      {alertasSuspensao.map(alerta => (
        <CartaoSimples
          key={alerta.chave}
          className="flex items-start gap-3 px-4 py-3.5 border-csc-red/35 bg-csc-red/12"
        >
          <ShieldAlert size={18} className="text-csc-vermelho-texto shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <EtiquetaSeccao como="p" className="text-csc-vermelho-suave">Alerta de suspensão</EtiquetaSeccao>
            <p className="text-[13px] font-bold text-white mt-1">{alerta.texto}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(alerta.chave)
              setAlertasSuspensao(prev => prev.filter(a => a.chave !== alerta.chave))
            }}
            aria-label="Dispensar alerta"
            className="w-11 h-11 -m-2 rounded-full flex items-center justify-center text-white/50 cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </CartaoSimples>
      ))}

      {/* O próximo compromisso — o único elemento alto do ecrã. */}
      {aCarregar ? (
        <CartaoVidro className="h-40 animate-pulse" />
      ) : proximo ? (
        <CartaoVidro className="overflow-hidden">
          <div className="p-[17px]">
            <p className="font-display font-extrabold text-[9.5px] tracking-[0.18em] text-csc-gold uppercase">
              {DATA_LONGA.format(new Date(proximo.date_time))}
            </p>

            {proximo.type === 'match' ? (
              <div className="flex items-center gap-3 mt-3.5">
                <img
                  src={clubSettings?.logo_url || '/csc-vet/cascais-emblem.png'}
                  alt={formatClubSigla(clubSettings?.initials)}
                  className="w-11 h-11 rounded-full bg-white object-contain p-0.5 flex-none"
                />
                <span className="font-display font-black text-[22px] text-white tracking-[-0.02em]">vs</span>
                {proximo.opponent?.logo_url ? (
                  <img
                    src={proximo.opponent.logo_url}
                    alt={proximo.opponent.name}
                    className="w-11 h-11 rounded-full bg-white/90 object-contain p-0.5 flex-none"
                  />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center font-display font-extrabold text-[10px] text-csc-dark flex-none">
                    {formatOpponentSigla(proximo.opponent)}
                  </span>
                )}
                <span className="flex-1 min-w-0 text-right">
                  <span className="block font-display font-bold text-xs text-white">
                    {new Date(proximo.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="block text-[10.5px] text-white/50 mt-0.5 truncate">
                    {proximo.is_friendly ? 'Jogo amigável' : proximo.tournament?.name || 'Jogo oficial'}
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-3.5">
                <span className="flex-1 min-w-0">
                  <span className="block font-display font-extrabold text-[17px] text-white truncate">
                    {proximo.title || TIPO_ETIQUETA[proximo.type]}
                  </span>
                  <span className="block text-[10.5px] text-white/50 mt-0.5">
                    {TIPO_ETIQUETA[proximo.type]}
                  </span>
                </span>
                <span className="font-display font-bold text-xs text-white flex-none">
                  {new Date(proximo.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {local && (
              <p className="flex items-center gap-1.5 text-[10.5px] text-white/50 mt-3">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">{local}</span>
              </p>
            )}
          </div>

          {/* A resposta à convocatória. Só aparece a quem foi convocado. */}
          {minhaConvocatoria && (
            <div className="flex items-center gap-3 px-[17px] py-3.5 bg-[rgba(11,45,11,.55)] border-t border-csc-light/35">
              <span className="flex-1 font-display font-extrabold text-[13px] text-white">
                {minhaConvocatoria.status === 'confirmed'
                  ? 'Contamos contigo.'
                  : minhaConvocatoria.status === 'declined'
                    ? 'Ficas de fora.'
                    : 'Contamos contigo?'}
              </span>
              <div className="flex gap-2 flex-none w-[168px]">
                <button
                  type="button"
                  onClick={() => responder('confirmed')}
                  aria-pressed={minhaConvocatoria.status === 'confirmed'}
                  className={`flex-1 h-11 rounded-[22px] border font-display font-bold text-[13px] cursor-pointer
                    transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                      minhaConvocatoria.status === 'confirmed'
                        ? 'bg-csc-light border-csc-light text-white'
                        : 'bg-white/9 border-white/20 text-white'
                    }`}
                >
                  Vou
                </button>
                <button
                  type="button"
                  onClick={() => responder('declined')}
                  aria-pressed={minhaConvocatoria.status === 'declined'}
                  className={`flex-1 h-11 rounded-[22px] border font-display font-bold text-[13px] cursor-pointer
                    transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                      minhaConvocatoria.status === 'declined'
                        ? 'bg-white/90 border-white/90 text-csc-tinta'
                        : 'bg-white/9 border-white/20 text-white'
                    }`}
                >
                  Não
                </button>
              </div>
            </div>
          )}
        </CartaoVidro>
      ) : (
        <CartaoVidro className="px-[17px] py-6 text-center">
          <p className="font-display font-extrabold text-sm text-white">Nada marcado para já</p>
          <p className="text-[11px] text-white/55 mt-1.5">
            Quando houver jogo, treino ou convívio, aparece aqui.
          </p>
        </CartaoVidro>
      )}

      {/* Competição: o estado da época, num toque. */}
      {ultimoJogo && ultimoJogo.home_score !== null && ultimoJogo.away_score !== null && (
        <CartaoSimples
          como={Link}
          to="/competicao"
          onClick={() => triggerHaptic('light')}
          className="flex items-center gap-3.5 px-4 py-3.5 min-h-14 cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
        >
          <span className="w-9 h-9 rounded-xl bg-csc-gold/15 border border-csc-gold/30 flex items-center justify-center
            font-display font-extrabold text-[13px] text-csc-gold flex-none tabular-nums">
            {ultimoJogo.home_score}–{ultimoJogo.away_score}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-extrabold text-[13px] text-white truncate">
              {ultimoJogo.tournament?.name || 'Competição'}
            </span>
            <span className="block text-[10.5px] text-white/55 mt-0.5 truncate">
              Último jogo com {ultimoJogo.opponent?.name ?? 'adversário'}
            </span>
          </span>
          <ChevronRight size={16} className="text-white/35 flex-none" />
        </CartaoSimples>
      )}

      {/* Os dois números do próprio, na época em curso. */}
      <div className="flex gap-3">
        <CartaoSimples className="flex-1 px-4 py-3.5">
          <EtiquetaSeccao como="p" className="tracking-[0.12em] text-[8.5px]">Os meus golos</EtiquetaSeccao>
          <p className="font-display font-black text-[26px] leading-none text-white mt-2 tabular-nums">
            {golos ?? '—'}
          </p>
        </CartaoSimples>
        <CartaoSimples className="flex-1 px-4 py-3.5">
          <EtiquetaSeccao como="p" className="tracking-[0.12em] text-[8.5px]">Presenças</EtiquetaSeccao>
          <p className="font-display font-black text-[26px] leading-none text-white mt-2 tabular-nums">
            {presencas === null ? '—' : <>{presencas}<span className="text-[15px] text-white/45">%</span></>}
          </p>
        </CartaoSimples>
      </div>

      {aniversariantes.map(pessoa => (
        <CartaoSimples
          key={pessoa.id}
          className="flex items-center gap-3 px-4 py-3.5 bg-csc-blue/15 border-csc-blue/30"
        >
          <span className="w-8 h-8 rounded-[10px] bg-csc-blue/25 border border-csc-blue/35 flex items-center justify-center text-csc-azul-texto flex-none">
            <Cake size={15} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-extrabold text-[12.5px] text-white">
              Hoje é dia do {pessoa.nome}
            </span>
            <span className="block text-[10.5px] text-white/60 mt-0.5">faz {pessoa.anos} anos</span>
          </span>
        </CartaoSimples>
      ))}
    </div>
  )
}

export default Home
