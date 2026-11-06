import React, { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { CLUBE_NOME } from '../lib/clube'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import { formatClubSigla } from '../lib/siglas'
import { eAdepto, eTreinadorOuAdmin, eContaDeTeste } from '../lib/papeis'
import { convocatoriaFechada, textoConvocatoriaFechada } from '../lib/eventos'
import { triggerHaptic } from '../utils/haptics'
import { CartaoVidro, CartaoSimples, EtiquetaSeccao } from '../components/ui'
import {
  useEventosSemConvocatoria,
  FaixaSemConvocatoria,
  PersianaSemConvocatoria,
} from '../components/AlertaSemConvocatoria'
import { FichaPorLigar, useFichaPorLigar } from '../components/FichaPorLigar'
import { SemPerfilAtribuido } from '../components/SemPerfilAtribuido'
import {
  useConviteAvisos,
  FaixaConvidarAvisos,
  PersianaConvidarAvisos,
} from '../components/ConvidarAvisos'
import { AlertaMvpPendente } from '../components/mvp/AlertaMvpPendente'
import { CarrosselCartoes } from '../components/home/CarrosselCartoes'
import { CartaoProximoJogo, type JogoDaHome } from '../components/home/CartaoProximoJogo'
import { PorResponder, type PendenteDaHome } from '../components/home/PorResponder'
import { UltimoJogo, type UltimoJogoDaHome } from '../components/home/UltimoJogo'
import { ProvasEmCurso, type ProvaDaHome } from '../components/home/ProvasEmCurso'
import { Aniversariantes, type AniversarianteDaHome } from '../components/home/Aniversariantes'
import { calcularClassificacao, janelaDoClube, jogoTerminado } from '../lib/classificacao'
import { isTorneioEliminatoria, obterRotuloEliminatoria } from '../components/clube/torneios'
import {
  garantirTacaVeteranos2026,
  obterMetaJogoKnockout,
  resolverEquipaKnockout,
} from '../lib/tacaVeteranos2026'
import { mensagemDeErro } from '../lib/erros'
import { obterEmblemaEfetivo } from '../lib/sincronizarEquipas'
import { obterJogoAntecedidoPeloTreino, type EventoComDataETipo } from '../lib/disponibilidadeJogo'
import type { Profile } from '../context/AuthContext'

/**
 * O nome por que a pessoa é tratada: alcunha ou nome da camisola, e só depois
 * o próprio.
 */
function primeiroNome(
  p?: { name?: string | null; nickname?: string | null; shirt_name?: string | null } | null,
): string {
  const preferido = p?.nickname?.trim() || p?.shirt_name?.trim()
  if (preferido) return preferido
  const proprio = p?.name?.trim()
  return proprio ? proprio.split(/\s+/)[0] : 'atleta'
}

interface EventoBruto {
  id: string
  type: 'match' | 'practice' | 'gathering'
  title: string | null
  date_time: string
  meeting_time: string | null
  location: string | null
  is_friendly: boolean | null
  is_active: boolean | null
  home_away: 'home' | 'away' | 'neutral' | null
  home_score: number | null
  away_score: number | null
  tournament: { id?: string; name: string } | null
  field: { name: string; address: string | null } | null
  opponent: { name: string; initials: string | null; logo_url: string | null } | null
}

interface GrupoBruto {
  id: string
  tournament_id: string
  name: string
  phase: number | null
}

interface EquipaBruta {
  id: string
  tournament_id: string
  group_id: string | null
  opponent_id: string | null
  points_carryover: number | null
  opponent: { id: string; name?: string; initials: string | null; logo_url: string | null } | null
}

interface JogoSerieBruto {
  id?: string
  tournament_id: string
  group_id: string
  matchday: number
  status: string | null
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  match_date?: string | null
}

const Home: React.FC = () => {
  const { profile, assignedRoles, isUnassigned } = useAuth()
  const { clubSettings } = useClub()

  const [jogos, setJogos] = useState<JogoDaHome[]>([])
  const [pendentes, setPendentes] = useState<PendenteDaHome[]>([])
  const [plantelEquipa, setPlantelEquipa] = useState<Profile[]>([])
  const [eventosFuturos, setEventosFuturos] = useState<EventoComDataETipo[]>([])
  const [ultimo, setUltimo] = useState<UltimoJogoDaHome | null>(null)
  const [provas, setProvas] = useState<ProvaDaHome[]>([])
  const [aniversariantes, setAniversariantes] = useState<AniversarianteDaHome[]>([])
  const [aCarregar, setACarregar] = useState(true)

  const estadoDaFicha = useFichaPorLigar(profile, assignedRoles)
  const semFicha = estadoDaFicha === 'por-ligar'

  const convite = useConviteAvisos(profile?.id, assignedRoles.includes('player') && !eAdepto(profile))
  const [conviteAberto, setConviteAberto] = useState(false)
  const [conviteMotivo, setConviteMotivo] = useState<'faixa' | 'acabou-de-responder'>('faixa')

  const abrirConvite = (motivo: 'faixa' | 'acabou-de-responder') => {
    setConviteMotivo(motivo)
    setConviteAberto(true)
  }

  /* O alerta de convocatórias em falta é de quem gere; ver 4c/4d. */
  const eGestao = Boolean(eTreinadorOuAdmin(profile))
  const eventosSemConvocatoria = useEventosSemConvocatoria(Boolean(eGestao))
  const [alertaAberto, setAlertaAberto] = useState(false)

  // Alertas de suspensão — deixados por quem lança fichas de jogo, em
  // localStorage, e só visíveis a quem gere.
  const [alertasSuspensao, setAlertasSuspensao] = useState<{ chave: string; texto: string }[]>([])
  useEffect(() => {
    if (!eGestao) return
    const encontrados: { chave: string; texto: string }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i)
      if (chave?.startsWith('csc_suspension_alert_')) {
        encontrados.push({ chave, texto: localStorage.getItem(chave) || '' })
      }
    }
    setAlertasSuspensao(encontrados)
  }, [eGestao])

  useEffect(() => {
    if (!profile || isUnassigned || profile.role === 'unassigned' || profile.status === 'inactive' || estadoDaFicha !== 'ligada') return
    let cancelado = false

    const carregar = async () => {
      setACarregar(true)
      try {
        garantirTacaVeteranos2026().catch(() => {})
        const agora = new Date().toISOString()

        const [
          { data: futuros },
          { data: ultimos },
          { data: torneios },
          { data: plantel },
        ] = await Promise.all([
          supabase
            .from('events')
            .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name), field:fields(name, address)')
            .gte('date_time', agora)
            .order('date_time', { ascending: true })
            .limit(12),
          supabase
            .from('events')
            .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name), field:fields(name, address)')
            .eq('type', 'match')
            .not('home_score', 'is', null)
            .order('date_time', { ascending: false })
            .limit(1),
          /* Só as provas a decorrer: uma prova agendada não tem tabela para
             mostrar, e o cartão levava a um ecrã vazio. */
          supabase.from('tournaments').select('id, name, season, status, rules').eq('status', 'ativo'),
          supabase.from('v_players_public').select('id, name, nickname, shirt_name, jersey_number, position, birth_date, status, photo_url, role, roles'),
        ])

        if (cancelado) return
        setPlantelEquipa(((plantel ?? []) as unknown as Profile[]).filter(p => !eContaDeTeste(p)))

        // Rascunhos ficam de fora: a Home mostra o que está marcado a sério.
        const marcados = ((futuros as unknown as EventoBruto[]) ?? []).filter(e => e.is_active !== false)
        setEventosFuturos(marcados as unknown as EventoComDataETipo[])

        /* As convocatórias destes eventos, numa consulta só: preciso da minha
           resposta e de quantos já confirmaram. */
        const ids = marcados.map(e => e.id)
        const { data: convocatorias } = ids.length
          ? await supabase.from('callups').select('event_id, player_id, status').in('event_id', ids)
          : { data: [] as { event_id: string; player_id: string; status: string }[] }

        if (cancelado) return
        const linhas = (convocatorias ?? []) as { event_id: string; player_id: string; status: string }[]
        const minha = new Map(linhas.filter(c => c.player_id === profile.id).map(c => [c.event_id, c.status]))
        const mapaPapeisPlantel = new Map(
          ((plantel ?? []) as unknown as { id: string; role?: string; roles?: string[] }[]).map(p => [p.id, p]),
        )
        const confirmados = new Map<string, number>()
        const total = new Map<string, number>()
        for (const c of linhas) {
          const p = mapaPapeisPlantel.get(c.player_id)
          // Adeptos não contam para o quórum de jogadores do jogo
          if (!eAdepto(p)) {
            total.set(c.event_id, (total.get(c.event_id) ?? 0) + 1)
            if (c.status === 'confirmed') confirmados.set(c.event_id, (confirmados.get(c.event_id) ?? 0) + 1)
          }
        }

        const ondeE = (e: EventoBruto) => e.location?.trim() || e.field?.name || ''
        const utilizadorAdepto = eAdepto(profile)

        const jogosEmCima = marcados
          .filter(e => e.type === 'match')
          .slice(0, 5)

        setJogos(
          jogosEmCima
            .map(e => {
              const fechada = convocatoriaFechada(e, (total.get(e.id) ?? 0) > 0)
              return {
                id: e.id,
                date_time: e.date_time,
                meeting_time: e.meeting_time,
                is_friendly: Boolean(e.is_friendly),
                home_away: e.home_away,
                local: ondeE(e),
                morada: e.field?.address ?? null,
                prova: e.tournament?.name ?? null,
                opponent: e.opponent,
                minhaResposta: (minha.get(e.id) as JogoDaHome['minhaResposta']) ?? (utilizadorAdepto && (total.get(e.id) ?? 0) > 0 ? 'called' : null),
                confirmados: confirmados.get(e.id) ?? 0,
                fechada: fechada ? textoConvocatoriaFechada(fechada, e) : null,
              }
            }),
        )

        const idsEmCima = new Set(jogosEmCima.map(e => e.id))
        setPendentes(
          marcados
            .filter(e => !idsEmCima.has(e.id))
            .filter(e => minha.get(e.id) === 'called')
            .filter(e => !convocatoriaFechada(e, true))
            .filter(e => !(utilizadorAdepto && e.type === 'practice'))
            .slice(0, 6)
            .map(e => ({
              id: e.id,
              titulo: e.type === 'match'
                ? `Jogo com ${e.opponent?.name ?? 'adversário por definir'}`
                : e.type === 'practice'
                  ? (e.title || 'Treino')
                  : (e.title || 'Convívio'),
              tipo: e.type as 'match' | 'practice' | 'gathering',
              date_time: e.date_time,
              local: ondeE(e),
              prova: e.tournament?.name ?? null,
              jogoAntecedido: e.type === 'practice'
                ? (obterJogoAntecedidoPeloTreino(e as unknown as EventoComDataETipo, marcados as unknown as EventoComDataETipo[]) as EventoComDataETipo | null)
                : null,
              eventoOriginal: e as unknown as EventoComDataETipo,
            })),
        )

        // O último jogo, com quem marcou. Sem minuto: `stats` guarda contagens.
        const jogo = ((ultimos as unknown as EventoBruto[]) ?? [])[0]
        if (jogo && jogo.home_score !== null && jogo.away_score !== null) {
          const { data: fichas } = await supabase
            .from('stats')
            .select('player_id, goals, assists, player:v_players_public(id, name, nickname, shirt_name)')
            .eq('event_id', jogo.id)
          if (cancelado) return
          const marcadores = ((fichas ?? []) as unknown as {
            player_id: string
            goals: number | null
            assists: number | null
            player: { name?: string | null; nickname?: string | null; shirt_name?: string | null } | null
          }[])
            .filter(f => (f.goals ?? 0) > 0 || (f.assists ?? 0) > 0)
            .map(f => ({
              playerId: f.player_id,
              nome: primeiroNome(f.player),
              golos: f.goals ?? 0,
              assistencias: f.assists ?? 0,
            }))
            .sort((a, b) => b.golos - a.golos || b.assistencias - a.assistencias)

          setUltimo({
            id: jogo.id,
            date_time: jogo.date_time,
            home_score: jogo.home_score,
            away_score: jogo.away_score,
            home_away: jogo.home_away,
            adversario: jogo.opponent?.name ?? 'adversário',
            prova: jogo.tournament?.name ?? null,
            marcadores,
          })
        } else {
          setUltimo(null)
        }

        /*
          Provas a decorrer, com o pedaço da classificação onde estamos. A
          conta é a da `StandingsPage` — a mesma função, para as duas tabelas
          não poderem discordar.
        */
        const provasBrutas = (torneios ?? []) as { id: string; name: string; season: string | null; rules?: any }[]
        const idsProvas = provasBrutas.map(t => t.id)
        const [
          { data: gruposT },
          { data: equipasT },
          { data: jogosT },
        ] = idsProvas.length
          ? await Promise.all([
              supabase.from('tournament_groups').select('id, tournament_id, name, phase').in('tournament_id', idsProvas),
              supabase
                .from('tournament_teams')
                .select('id, tournament_id, group_id, opponent_id, points_carryover, opponent:opponents(id, name, initials, logo_url)')
                .in('tournament_id', idsProvas),
              supabase
                .from('tournament_matches')
                .select('id, tournament_id, group_id, matchday, status, home_team_id, away_team_id, home_score, away_score, match_date')
                .in('tournament_id', idsProvas),
            ])
          : [{ data: [] }, { data: [] }, { data: [] }]
        if (cancelado) return

        const grupos = (gruposT ?? []) as GrupoBruto[]
        const equipas = (equipasT ?? []) as unknown as EquipaBruta[]
        const jogosSerie = (jogosT ?? []) as JogoSerieBruto[]

        setProvas(provasBrutas.map(t => {
          const equipasDaProva = equipas.filter(e => e.tournament_id === t.id)
          const jogosDaProva = jogosSerie.filter(m => m.tournament_id === t.id)

          if (isTorneioEliminatoria(t)) {
            const rounds = Array.from(new Set(jogosDaProva.map(m => m.matchday || 1))).sort((a, b) => a - b)
            // Fase ativa: primeira com jogo nosso por realizar, ou primeira com jogos por realizar, ou última
            const roundEmFoco =
              rounds.find(r =>
                jogosDaProva.some(m => {
                  if ((m.matchday || 1) !== r || jogoTerminado(m)) return false
                  const metaR = obterMetaJogoKnockout(t.rules, m, jogosDaProva)
                  const c = resolverEquipaKnockout('home', m, metaR, jogosDaProva, equipasDaProva, clubSettings, t.rules)
                  const f = resolverEquipaKnockout('away', m, metaR, jogosDaProva, equipasDaProva, clubSettings, t.rules)
                  return c.eOClube || f.eOClube
                }),
              ) ??
              rounds.find(r => jogosDaProva.some(m => (m.matchday || 1) === r && !jogoTerminado(m))) ??
              rounds[rounds.length - 1] ??
              2

            const jogosFase = jogosDaProva
              .filter(m => (m.matchday || 1) === roundEmFoco)
              .sort((a, b) => {
                const ma = obterMetaJogoKnockout(t.rules, a, jogosDaProva)
                const mb = obterMetaJogoKnockout(t.rules, b, jogosDaProva)
                return (ma?.match_number ?? 99) - (mb?.match_number ?? 99)
              })
              .map((m, idx) => {
                const meta = obterMetaJogoKnockout(t.rules, m, jogosDaProva)
                const c = resolverEquipaKnockout('home', m, meta, jogosDaProva, equipasDaProva, clubSettings, t.rules)
                const f = resolverEquipaKnockout('away', m, meta, jogosDaProva, equipasDaProva, clubSettings, t.rules)
                const term = jogoTerminado(m)
                return {
                  id: m.id || `${t.id}-${idx}`,
                  numero: meta?.match_number ?? idx + 1,
                  casaNome: c.sigla,
                  foraNome: f.sigla,
                  data: m.match_date || '',
                  hora: meta?.match_time || null,
                  resultado: term ? `${m.home_score} - ${m.away_score}` : null,
                  nosso: c.eOClube || f.eOClube,
                }
              })

            return {
              id: t.id,
              nome: t.name,
              epoca: t.season,
              jornadas: rounds.length,
              grupo: obterRotuloEliminatoria(roundEmFoco),
              linhas: [],
              eliminatoria: {
                nomeFase: obterRotuloEliminatoria(roundEmFoco),
                jogos: jogosFase,
              },
            }
          }

          const gruposDaProva = grupos
            .filter(gr => gr.tournament_id === t.id)
            .sort((a, b) => (b.phase ?? 1) - (a.phase ?? 1))
          /* O grupo que interessa é aquele em que estamos, na fase mais
             adiantada; sem nós na prova, o primeiro que tenha equipas. */
          const grupo =
            gruposDaProva.find(gr => equipasDaProva.some(e => e.group_id === gr.id && e.opponent_id === null))
            ?? gruposDaProva.find(gr => equipasDaProva.some(e => e.group_id === gr.id))
            ?? null

          const linhas = grupo
            ? janelaDoClube(
                calcularClassificacao(
                  equipasDaProva,
                  jogosDaProva,
                  grupo.id,
                  t.rules,
                ),
              )
            : []

          const jornadasDaProva = new Set(
            jogosDaProva.map(m => m.matchday),
          )

          return {
            id: t.id,
            nome: t.name,
            epoca: t.season,
            jornadas: jornadasDaProva.size,
            grupo: grupo?.name ?? null,
            linhas: linhas.map(({ linha, posicao }) => ({
              id: linha.team.id,
              posicao,
              equipa: linha.team,
              j: linha.j,
              dg: linha.dg,
              p: linha.p,
            })),
          }
        }))

        const mesDeHoje = new Date().getMonth() + 1
        setAniversariantes(
          ((plantel ?? []) as {
            id: string; name: string | null; nickname: string | null
            shirt_name: string | null; birth_date: string | null; status: string | null
            photo_url: string | null
          }[])
            .filter(p => p.birth_date && p.status !== 'inactive')
            .map(p => {
              const [anoTexto, mesTexto, diaTexto] = (p.birth_date as string).split('-')
              return { p, ano: Number(anoTexto), mes: Number(mesTexto), dia: Number(diaTexto) }
            })
            .filter(({ mes }) => mes === mesDeHoje)
            .sort((a, b) => a.dia - b.dia)
            .map(({ p, ano, mes, dia }) => ({
              id: p.id,
              nome: primeiroNome(p),
              dia,
              mes,
              ano,
              foto: p.photo_url,
            })),
        )
      } catch (erro) {
        console.error('Erro a carregar a Home:', erro)
      } finally {
        if (!cancelado) setACarregar(false)
      }
    }

    carregar()
    return () => { cancelado = true }
  }, [profile?.id, profile?.role, profile?.status, isUnassigned, estadoDaFicha, clubSettings?.id, clubSettings?.name, clubSettings?.initials])

  const responder = async (eventId: string, status: 'confirmed' | 'declined') => {
    if (!profile) return
    triggerHaptic(status === 'confirmed' ? 'success' : 'warning')

    // Otimista nos dois blocos que mostram a resposta.
    setJogos(prev => prev.map(j => (j.id === eventId ? { ...j, minhaResposta: status } : j)))
    setPendentes(prev => prev.filter(p => p.id !== eventId))

    const { error } = await supabase
      .from('callups')
      .upsert(
        [{ event_id: eventId, player_id: profile.id, status }],
        { onConflict: 'event_id, player_id' }
      )

    if (error) {
      toast.error('Não foi possível guardar a resposta: ' + mensagemDeErro(error))
      return
    }
    toast.success(
      status === 'confirmed'
        ? (eAdepto(profile) ? 'Presença confirmada! Obrigado pelo apoio.' : 'Contamos contigo.')
        : 'Resposta registada.'
    )

    const faltaResponder =
      pendentes.some(p => p.id !== eventId) ||
      jogos.some(j => j.id !== eventId && j.minhaResposta === 'called' && j.fechada === null)

    if (convite.oferecer && !faltaResponder) abrirConvite('acabou-de-responder')
  }

  if (!profile) return null

  const semPerfil = isUnassigned || profile?.role === 'unassigned' || profile?.status === 'inactive'
  if (semPerfil) {
    return <SemPerfilAtribuido />
  }

  const emblema = obterEmblemaEfetivo(clubSettings?.logo_url, 'Cascais', 'CSC') || '/csc-vet/cascais-emblem.png'
  const sigla = formatClubSigla(clubSettings?.initials)
  return (
    <div className="space-y-4 pb-2">
      {estadoDaFicha === 'a-verificar' ? (
        <CartaoSimples className="h-40 animate-pulse" />
      ) : semFicha ? (
        <FichaPorLigar perfil={profile} />
      ) : (
        <>
          <FaixaSemConvocatoria eventos={eventosSemConvocatoria} aoAbrir={() => setAlertaAberto(true)} />
          <PersianaSemConvocatoria
            aberto={alertaAberto}
            aoFechar={() => setAlertaAberto(false)}
            eventos={eventosSemConvocatoria}
          />

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
                className="w-11 h-11 -m-2 rounded-full flex items-center justify-center text-white/62 cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </CartaoSimples>
          ))}

          <AlertaMvpPendente />

          {aCarregar ? (
            <CartaoVidro className="h-56 animate-pulse" />
          ) : jogos.length > 0 ? (
            <CarrosselCartoes
              etiqueta="Próximos jogos"
              paginas={jogos.map(jogo => (
                <CartaoProximoJogo
                  key={jogo.id}
                  jogo={jogo}
                  siglaClube={sigla}
                  nomeClube={clubSettings?.name || CLUBE_NOME}
                  emblemaClube={emblema}
                  isAdepto={eAdepto(profile)}
                  aoResponder={responder}
                />
              ))}
            />
          ) : (
            <CartaoVidro className="px-[17px] py-6 text-center">
              <p className="font-display font-extrabold text-sm text-white">Sem jogos marcados</p>
              <p className="text-[11px] text-white/62 mt-1.5">
                Quando houver jogo, aparece aqui com a hora e o campo.
              </p>
            </CartaoVidro>
          )}

          <PorResponder
            pendentes={pendentes}
            isAdepto={eAdepto(profile)}
            profile={profile}
            clubeSigla={sigla}
            isCoachOrAdmin={Boolean(eGestao)}
            plantel={plantelEquipa}
            todosEventos={eventosFuturos}
            aoResponder={responder}
          />

          {convite.oferecer && <FaixaConvidarAvisos aoAbrir={() => abrirConvite('faixa')} />}

          {ultimo && <UltimoJogo jogo={ultimo} siglaClube={sigla} />}

          <ProvasEmCurso provas={provas} />

          <Aniversariantes pessoas={aniversariantes} />

          <PersianaConvidarAvisos
            aberto={conviteAberto}
            perfilId={profile.id}
            push={convite.push}
            motivo={conviteMotivo}
            aoLigado={() => { setConviteAberto(false); convite.arrumar() }}
            aoAdiar={() => { setConviteAberto(false); convite.adiar() }}
          />
        </>
      )}
    </div>
  )
}

export default Home
