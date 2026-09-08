import React, { useEffect, useState } from 'react'
import { ShieldAlert, X, Cake } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import {
  formatClubSigla,
  convocatoriaFechada,
  textoConvocatoriaFechada,
} from './CalendarPage'
import { triggerHaptic } from '../utils/haptics'
import { AvatarPerfil, CartaoVidro, CartaoSimples, EtiquetaSeccao, PastilhaEstado } from '../components/ui'
import { AnnouncementsInboxButton } from '../components/AnnouncementsInbox'
import {
  useEventosSemConvocatoria,
  FaixaSemConvocatoria,
  PersianaSemConvocatoria,
} from '../components/AlertaSemConvocatoria'
import { FichaPorLigar, useFichaPorLigar } from '../components/FichaPorLigar'
import { CarrosselCartoes } from '../components/home/CarrosselCartoes'
import { CartaoProximoJogo, type JogoDaHome } from '../components/home/CartaoProximoJogo'
import { PorResponder, type PendenteDaHome } from '../components/home/PorResponder'
import { UltimoJogo, type UltimoJogoDaHome } from '../components/home/UltimoJogo'
import { ProvasEmCurso, type ProvaDaHome } from '../components/home/ProvasEmCurso'
import { comOmissoes, getSeasonLabel } from '../lib/finance'

/**
 * Hoje — o primeiro ecrã, e o único que responde a "o que é que me diz
 * respeito agora".
 *
 * Segue o cartão **4a** do `Home Redesign.dc.html`, por blocos: cabeçalho,
 * próximo jogo em carrossel, o que está por responder, o último jogo, as
 * provas a decorrer, e os anos de quem faz este mês.
 *
 * Três coisas do desenho não estão aqui, e nenhuma por esquecimento:
 *
 * - **A meteorologia** do cartão do jogo ("19° · vento 24 km/h"): a app não
 *   tem fonte nenhuma, e um número inventado num cartão que diz a que horas é
 *   a concentração seria pior do que a ausência dele.
 * - **A cronologia dos golos** no último jogo: `stats` guarda contagens por
 *   jogador e por jogo, não golos ao minuto com a assistência emparelhada.
 * - **A tabela de classificação**: `tournament_matches` está vazia, e o
 *   algoritmo dos desempates vive na `StandingsPage`.
 *
 * Cada uma fica registada em `docs/ecras-por-desenhar.md` com o que precisaria.
 */

interface Aniversariante {
  id: string
  nome: string
  dia: number
}

/** Bom dia até às 12h, boa tarde até às 20h, boa noite depois disso. */
function saudacao(agora = new Date()): string {
  const h = agora.getHours()
  if (h < 12) return 'Bom dia,'
  if (h < 20) return 'Boa tarde,'
  return 'Boa noite,'
}

/**
 * O nome por que a pessoa é tratada: alcunha ou nome da camisola, e só depois
 * o próprio.
 *
 * O `name` é `NOT NULL` na base, mas não está sempre lá quando esta função
 * corre: uma conta criada com o Google sem nome no perfil chegava aqui com
 * `undefined` e derrubava a Home inteira.
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

const Home: React.FC = () => {
  const { profile, assignedRoles } = useAuth()
  const { clubSettings } = useClub()

  const [jogos, setJogos] = useState<JogoDaHome[]>([])
  const [pendentes, setPendentes] = useState<PendenteDaHome[]>([])
  const [ultimo, setUltimo] = useState<UltimoJogoDaHome | null>(null)
  const [provas, setProvas] = useState<ProvaDaHome[]>([])
  const [aniversariantes, setAniversariantes] = useState<Aniversariante[]>([])
  const [epoca, setEpoca] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(true)

  /*
    Conta registada que nunca chegou a ser ligada à ficha que o clube já lhe
    tinha (ecrã 11a). Substitui a Home inteira: sem ficha não há convocatória
    nem nada que mostrar, e nenhum dos blocos diria porquê.
  */
  const estadoDaFicha = useFichaPorLigar(profile, assignedRoles)
  const semFicha = estadoDaFicha === 'por-ligar'

  /* O alerta de convocatórias em falta é de quem gere; ver 4c/4d. */
  const eGestao = profile?.role === 'coach' || profile?.role === 'admin'
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
    if (!profile || estadoDaFicha !== 'ligada') return
    let cancelado = false

    const carregar = async () => {
      setACarregar(true)
      try {
        const agora = new Date().toISOString()

        const [
          { data: defs },
          { data: futuros },
          { data: ultimos },
          { data: torneios },
          { data: plantel },
        ] = await Promise.all([
          supabase.from('financial_settings').select('*').maybeSingle(),
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
          supabase.from('tournaments').select('id, name, season, status').neq('status', 'terminado'),
          supabase.from('v_players_public').select('id, name, nickname, shirt_name, birth_date, status'),
        ])

        if (cancelado) return

        setEpoca(getSeasonLabel(comOmissoes(defs)))

        // Rascunhos ficam de fora: a Home mostra o que está marcado a sério.
        const marcados = ((futuros as unknown as EventoBruto[]) ?? []).filter(e => e.is_active !== false)

        /* As convocatórias destes eventos, numa consulta só: preciso da minha
           resposta e de quantos já confirmaram. */
        const ids = marcados.map(e => e.id)
        const { data: convocatorias } = ids.length
          ? await supabase.from('callups').select('event_id, player_id, status').in('event_id', ids)
          : { data: [] as { event_id: string; player_id: string; status: string }[] }

        if (cancelado) return
        const linhas = (convocatorias ?? []) as { event_id: string; player_id: string; status: string }[]
        const minha = new Map(linhas.filter(c => c.player_id === profile.id).map(c => [c.event_id, c.status]))
        const confirmados = new Map<string, number>()
        const total = new Map<string, number>()
        for (const c of linhas) {
          total.set(c.event_id, (total.get(c.event_id) ?? 0) + 1)
          if (c.status === 'confirmed') confirmados.set(c.event_id, (confirmados.get(c.event_id) ?? 0) + 1)
        }

        const ondeE = (e: EventoBruto) => e.location?.trim() || e.field?.name || ''

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
                minhaResposta: (minha.get(e.id) as JogoDaHome['minhaResposta']) ?? null,
                confirmados: confirmados.get(e.id) ?? 0,
                fechada: fechada ? textoConvocatoriaFechada(fechada, e) : null,
              }
            }),
        )

        /*
          Por responder: o que ainda espera resposta minha e **não está já no
          cartão de cima**. Um jogo que se pode responder no carrossel não
          precisa de aparecer outra vez três linhas abaixo, com os mesmos dois
          botões — era a mesma pergunta feita duas vezes no mesmo ecrã. Na
          prática sobram os convívios, e os jogos que ficarem de fora do
          carrossel por serem mais do que cinco.

          Os treinos entram, mas só dentro da janela deles — seis dias antes,
          e isso quem decide é o `convocatoriaFechada`. Fora dela não são
          "por responder": são uma pergunta que ainda não foi feita, e a lista
          teria sempre lá o treino da semana seguinte. O que **nunca** acontece
          é um treino subir ao cartão de cima: esse é dos jogos.
        */
        const idsEmCima = new Set(jogosEmCima.map(e => e.id))
        setPendentes(
          marcados
            .filter(e => !idsEmCima.has(e.id))
            .filter(e => minha.get(e.id) === 'called')
            .filter(e => !convocatoriaFechada(e, true))
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

        // Provas a decorrer, com quantas jornadas já foram lançadas.
        const provasBrutas = (torneios ?? []) as { id: string; name: string; season: string | null }[]
        const { data: jornadas } = provasBrutas.length
          ? await supabase
              .from('tournament_matches')
              .select('tournament_id')
              .in('tournament_id', provasBrutas.map(t => t.id))
          : { data: [] as { tournament_id: string }[] }
        if (cancelado) return
        const porProva = new Map<string, number>()
        for (const j of (jornadas ?? []) as { tournament_id: string }[]) {
          porProva.set(j.tournament_id, (porProva.get(j.tournament_id) ?? 0) + 1)
        }
        setProvas(provasBrutas.map(t => ({
          id: t.id,
          nome: t.name,
          epoca: t.season,
          jornadas: porProva.get(t.id) ?? 0,
        })))

        // Aniversários deste mês, e não só de hoje: é o que o 4a mostra.
        const hoje = new Date()
        setAniversariantes(
          ((plantel ?? []) as {
            id: string; name: string | null; nickname: string | null
            shirt_name: string | null; birth_date: string | null; status: string | null
          }[])
            .filter(p => p.birth_date && p.status !== 'inactive')
            .map(p => ({ p, d: new Date(p.birth_date as string) }))
            .filter(({ d }) => d.getMonth() === hoje.getMonth())
            .sort((a, b) => a.d.getDate() - b.d.getDate())
            .map(({ p, d }) => ({ id: p.id, nome: primeiroNome(p), dia: d.getDate() })),
        )
      } catch (erro) {
        console.error('Erro a carregar a Home:', erro)
      } finally {
        if (!cancelado) setACarregar(false)
      }
    }

    carregar()
    return () => { cancelado = true }
  }, [profile, estadoDaFicha])

  const responder = async (eventId: string, status: 'confirmed' | 'declined') => {
    if (!profile) return
    triggerHaptic(status === 'confirmed' ? 'success' : 'warning')

    // Otimista nos dois blocos que mostram a resposta.
    setJogos(prev => prev.map(j => (j.id === eventId ? { ...j, minhaResposta: status } : j)))
    setPendentes(prev => prev.filter(p => p.id !== eventId))

    const { error } = await supabase
      .from('callups')
      .update({ status })
      .eq('event_id', eventId)
      .eq('player_id', profile.id)

    if (error) {
      toast.error('Não foi possível guardar a resposta: ' + error.message)
      return
    }
    toast.success(status === 'confirmed' ? 'Contamos contigo.' : 'Resposta registada.')
  }

  if (!profile) return null

  const emblema = clubSettings?.logo_url || '/csc-vet/cascais-emblem.png'
  const sigla = formatClubSigla(clubSettings?.initials)
  const hojeDia = new Date().getDate()

  return (
    <div className="space-y-4 pb-2">
      {/*
        Cabeçalho: o clube, a época, o estado clínico e o sino dos comunicados
        — que só existe aqui.

        Eram duas linhas: uma com "Bom dia, Ricardo" e outra, por baixo, com o
        clube e a época. O desenho junta tudo numa, e é o que liberta a altura
        para o jogo abrir a página. O nome do próprio ficou onde faz falta:
        atrás do avatar, que é a porta do perfil.
      */}
      <header className="flex items-center gap-3 pt-safe">
        <img
          src={emblema}
          alt=""
          className="w-[38px] h-[38px] rounded-full bg-white object-contain p-[3px] flex-none"
        />
        <div className="flex-1 min-w-0">
          <p className="font-display font-extrabold text-[13.5px] text-white truncate">
            {semFicha ? `${sigla} Veteranos` : `${sigla} Veteranos`}
          </p>
          <p className="text-[10.5px] text-white/60 truncate mt-px">
            {epoca ? `Época ${epoca}` : saudacao()}
          </p>
        </div>
        {!semFicha && <PastilhaEstado />}
        <AnnouncementsInboxButton tone="dark" size="md" />
        <AvatarPerfil tamanho={38} />
      </header>

      {estadoDaFicha === 'a-verificar' ? (
        <CartaoVidro className="h-40 animate-pulse" />
      ) : semFicha ? (
        <FichaPorLigar perfil={profile} />
      ) : (
        <>
          {/* Eventos por convocar, só a quem gere (4c). */}
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

          {/* O próximo jogo, uma página por jogo marcado. */}
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
                  emblemaClube={emblema}
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

          <PorResponder pendentes={pendentes} aoResponder={responder} />

          {ultimo && <UltimoJogo jogo={ultimo} siglaClube={sigla} />}

          <ProvasEmCurso provas={provas} />

          {aniversariantes.length > 0 && (
            <CartaoSimples className="flex items-center gap-3 px-4 py-3.5 bg-csc-blue/15 border-csc-blue/30">
              <span className="w-8 h-8 rounded-[10px] bg-csc-blue/25 border border-csc-blue/35 flex items-center justify-center text-csc-azul-texto flex-none">
                <Cake size={15} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display font-extrabold text-[12.5px] text-white">
                  Aniversários deste mês
                </span>
                <span className="block text-[10.5px] text-white/62 mt-0.5">
                  {aniversariantes
                    .map(p => (p.dia === hojeDia ? `${p.nome} faz anos hoje` : `${p.nome} a ${p.dia}`))
                    .join(' · ')}
                </span>
              </span>
            </CartaoSimples>
          )}
        </>
      )}
    </div>
  )
}

export default Home
