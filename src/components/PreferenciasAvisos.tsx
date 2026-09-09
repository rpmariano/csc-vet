import React, { useEffect, useState } from 'react'
import { BellRing, BellOff, Lock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { BottomSheet } from './BottomSheet'
import { Botao } from './ui'
import { estadoDoPush, ligarAvisos, desligarAvisos, type EstadoPush } from '../lib/push'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from './UnsavedChangesModal'

/**
 * Preferências de avisos (ecrã 12b) — o que cada um escolhe receber.
 *
 * São duas coisas diferentes, e o ecrã diz as duas: **este telemóvel recebe
 * avisos?** (a subscrição push, que é por dispositivo) e **que avisos quero?**
 * (as preferências, que são da pessoa e valem em todos os dispositivos).
 * Ligar num telemóvel não liga no outro; desligar um aviso desliga-o em
 * todos.
 *
 * No iPhone o Safari só dá push a uma PWA instalada no ecrã principal
 * (iOS 16.4+). Quando não dá, o ecrã explica porquê em vez de mostrar um
 * botão que não faz nada.
 *
 * A secção de gestão só aparece a quem gere: são avisos sobre o trabalho da
 * equipa técnica, e a um jogador não dizem nada.
 */

interface Preferencias {
  convocatorias: boolean
  comunicados: boolean
  quotas_em_atraso: boolean
  eventos_sem_convocatoria: boolean
  fichas_por_preencher: boolean
  /*
    Sem silêncio nenhum é uma janela de comprimento zero — as duas horas
    iguais —, e não `null`: as colunas são `NOT NULL` na base, e desligar o
    interruptor mandava `null` e rebentava a gravar. O `avisos_pendentes()` já
    trata `inicio = fim` como "esta pessoa nunca está em silêncio".
  */
  silencio_inicio: string
  silencio_fim: string
}

/*
  Tudo desligado à partida. Um aviso que ninguém pediu é uma interrupção, e a
  primeira coisa que se aprende a fazer com ele é ignorá-lo.

  O silêncio da noite não é um aviso, é uma regra sobre eles — fica posto de
  origem, para quem ligar o primeiro aviso não o receber às três da manhã.
*/
const OMISSOES: Preferencias = {
  convocatorias: false,
  comunicados: false,
  quotas_em_atraso: false,
  eventos_sem_convocatoria: false,
  fichas_por_preencher: false,
  silencio_inicio: '23:00',
  silencio_fim: '08:00',
}

/** As chaves que são mesmo avisos — o silêncio não conta. */
const AVISOS = [
  'convocatorias', 'comunicados', 'quotas_em_atraso',
  'eventos_sem_convocatoria', 'fichas_por_preencher',
] as const

const algumLigado = (p: Preferencias) => AVISOS.some(chave => p[chave])

const DO_ATLETA: readonly { chave: keyof Preferencias; titulo: string; nota: string }[] = [
  { chave: 'convocatorias', titulo: 'Convocatórias', nota: 'Quando és chamado, e na véspera se não respondeste' },
  { chave: 'comunicados', titulo: 'Comunicados', nota: 'Avisos da direção e da equipa técnica' },
  { chave: 'quotas_em_atraso', titulo: 'Quotas', nota: 'Só quando ficas em atraso' },
]

const DE_QUEM_GERE: readonly { chave: keyof Preferencias; titulo: string; nota: string }[] = [
  { chave: 'eventos_sem_convocatoria', titulo: 'Evento sem convocatória', nota: 'Enquanto ninguém estiver convocado' },
  { chave: 'fichas_por_preencher', titulo: 'Ficha de jogo por preencher', nota: 'No dia seguinte ao jogo' },
]

const Interruptor: React.FC<{
  ligado: boolean
  aoMudar: (v: boolean) => void
  titulo: string
  nota: string
}> = ({ ligado, aoMudar, titulo, nota }) => (
  <button
    type="button"
    role="switch"
    aria-checked={ligado}
    onClick={() => { triggerHaptic('selection'); aoMudar(!ligado) }}
    className="w-full min-h-14 flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer
      border-t border-white/7 first:border-t-0
      focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold"
  >
    <span className="min-w-0 flex-1">
      <span className="block font-display font-bold text-[12.5px] text-white">{titulo}</span>
      <span className="block text-[10.5px] leading-snug text-white/62 mt-0.5">{nota}</span>
    </span>
    <span
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${
        ligado ? 'bg-csc-light' : 'bg-white/15'
      }`}
      aria-hidden="true"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
          ligado ? 'translate-x-5' : ''
        }`}
      />
    </span>
  </button>
)

export const PreferenciasAvisos: React.FC<{
  aberto: boolean
  aoFechar: () => void
  perfilId: string | undefined
  eEquipaTecnica: boolean
}> = ({ aberto, aoFechar, perfilId, eEquipaTecnica }) => {
  const [prefs, setPrefs] = useState<Preferencias>(OMISSOES)
  const [aCarregar, setACarregar] = useState(true)
  const [aGuardar, setAGuardar] = useState(false)
  const [push, setPush] = useState<EstadoPush | null>(null)

  useEffect(() => {
    if (!aberto) return
    estadoDoPush().then(setPush)
  }, [aberto])


  useEffect(() => {
    if (!aberto || !perfilId) return
    let cancelado = false
    setACarregar(true)

    supabase
      .from('notification_preferences')
      .select('*')
      .eq('profile_id', perfilId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        if (data) {
          // Coluna a coluna: uma coluna a NULL não deve apagar a omissão.
          const juntas = { ...OMISSOES }
          for (const [chave, valor] of Object.entries(data)) {
            if (valor !== null && valor !== undefined && chave in juntas) {
              (juntas as Record<string, unknown>)[chave] = valor
            }
          }
          setPrefs(juntas)
        }
        setACarregar(false)
      })

    return () => { cancelado = true }
  }, [aberto, perfilId])

  /*
    Guardar faz as duas coisas: escreve a escolha e põe este telemóvel a
    receber (ou deixa de o pôr).

    Não há botão de "Ligar" à parte. Eram dois gestos para uma intenção —
    escolher os avisos e depois autorizar a app — e quem fizesse só o primeiro
    ficava com tudo pedido e nada a chegar. A permissão é pedida aqui, que é
    quando ela passa a fazer falta.

    **A escolha grava-se sempre, mesmo que a subscrição falhe.** As
    preferências são da pessoa e valem em todos os aparelhos; a subscrição é
    deste. Quem escolher os avisos num Safari sem a app instalada tem de os
    ver guardados na mesma — passam a valer no telemóvel onde a instalar.

    Ao desligar o último aviso, a subscrição deste telemóvel é apagada: uma
    caixa de correio que não recebe nada é só uma linha a mais na base e um
    endereço a mais para o servidor tentar.
  */
  const guardar = async () => {
    if (!perfilId) return
    setAGuardar(true)
    try {
      const querReceber = algumLigado(prefs)
      let estadoFinal = push
      let recado: string | null = null

      if (querReceber && push !== 'ligado') {
        estadoFinal = await ligarAvisos(perfilId)
        if (estadoFinal !== 'ligado') {
          recado =
            estadoFinal === 'recusado'
              ? 'Guardado — mas este telemóvel tem as notificações bloqueadas. Dá-as nas definições do site.'
              : estadoFinal === 'sem-suporte'
                ? 'Guardado — mas este browser não recebe avisos. No iPhone, instala a app no ecrã principal.'
                : 'Guardado — mas o envio ainda não está configurado no servidor.'
        }
      } else if (!querReceber && push === 'ligado') {
        await desligarAvisos()
        estadoFinal = 'desligado'
      }

      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ profile_id: perfilId, ...prefs, updated_at: new Date().toISOString() })
      if (error) throw error

      setPush(estadoFinal)
      if (recado) toast.warning(recado)
      else {
        toast.success(
          querReceber
            ? 'Este telemóvel passa a receber os avisos que escolheste.'
            : 'Guardado. Este telemóvel não recebe avisos nenhuns.',
        )
      }
      aoFechar()
    } catch (err) {
      toast.error('Não foi possível guardar: ' + (err instanceof Error ? err.message : 'erro inesperado'))
    } finally {
      setAGuardar(false)
    }
  }

  const silencioLigado = prefs.silencio_inicio !== prefs.silencio_fim

  /*
    As escolhas de avisos não se perdem num Escape ou num arrasto da persiana.
    A fotografia espera pelo `aCarregar`: as preferências vêm da base depois de
    a persiana abrir, e sem isso o próprio carregamento contava como escolha.
  */
  const guarda = useAlteracoesPorGravar({
    aberto,
    pronto: !aCarregar,
    valores: prefs,
    aoGravar: guardar,
    aoSair: aoFechar,
    descricao: 'As tuas escolhas de avisos ainda não foram guardadas. Se saíres agora, perdem-se.',
  })

  return (
    <>
    <BottomSheet
      isOpen={aberto}
      onClose={guarda.tentarFechar}
      title="O que quero saber"
      description="Avisos que a app te vai enviar"
      footer={
        <>
          <Botao aparencia="vidro" onClick={guarda.tentarFechar}>Cancelar</Botao>
          <Botao onClick={guardar} disabled={aGuardar || aCarregar}>
            {aGuardar ? 'A guardar…' : 'Guardar'}
          </Botao>
        </>
      }
    >
      {aCarregar ? (
        <div className="flex justify-center py-10" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-csc-gold border-t-transparent" />
          <span className="sr-only">A carregar…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/*
            O que este telemóvel faz — uma frase, sem botão.

            O botão de "Ligar" que aqui estava era um segundo gesto para a
            mesma intenção: quem escolhia os avisos e não carregava nele ficava
            com tudo pedido e nada a chegar. Quem liga agora é o próprio
            "Guardar", ao ver que há pelo menos um aviso escolhido.

            Quando o telemóvel não pode receber — Safari sem a app instalada,
            permissão recusada, envio por configurar — é aqui que se diz
            porquê, antes de a pessoa escolher avisos que não lhe chegariam.
          */}
          {(() => {
            const impedido = push === 'sem-suporte' || push === 'por-configurar' || push === 'recusado'
            const escolheu = algumLigado(prefs)
            return (
              <div className={`cartao-simples p-3.5 flex items-center gap-3 ${
                impedido
                  ? 'bg-csc-red/10 border-csc-red/28'
                  : push === 'ligado' ? 'bg-csc-light/10 border-csc-light/28' : ''
              }`}>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  impedido
                    ? 'bg-csc-red/18 text-csc-vermelho-texto'
                    : push === 'ligado'
                      ? 'bg-csc-light/20 text-csc-verde-texto'
                      : 'bg-white/8 text-white/60'
                }`}>
                  {push === 'ligado' ? <BellRing size={17} /> : <BellOff size={17} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-display font-extrabold text-[12.5px] text-white">
                    {push === 'ligado'
                      ? 'Este telemóvel recebe avisos'
                      : 'Este telemóvel não recebe avisos'}
                  </span>
                  <span className="block text-[10.5px] leading-relaxed text-white/62 mt-0.5">
                    {push === 'sem-suporte'
                      ? 'Este browser não os suporta. No iPhone, instala a app no ecrã principal e volta aqui.'
                      : push === 'por-configurar'
                        ? 'O envio ainda não está configurado no servidor. Fala com a direção.'
                        : push === 'recusado'
                          ? 'Bloqueaste as notificações para este site. Só nas definições do browser as podes voltar a dar.'
                          : push === 'ligado'
                            ? 'Chegam com a app fechada. Vale só para este telemóvel.'
                            : escolheu
                              ? 'Ao guardar, o telemóvel pede autorização e passa a receber os avisos escolhidos.'
                              : 'Liga em baixo o que queres saber. Está tudo desligado à partida.'}
                  </span>
                </span>
              </div>
            )
          })()}

          <div>
            <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-2">
              Avisos
            </p>
            <div className="cartao-simples overflow-hidden">
              {DO_ATLETA.map(a => (
                <Interruptor
                  key={a.chave}
                  ligado={Boolean(prefs[a.chave])}
                  aoMudar={v => setPrefs(p => ({ ...p, [a.chave]: v }))}
                  titulo={a.titulo}
                  nota={a.nota}
                />
              ))}
            </div>
          </div>

          {eEquipaTecnica && (
            <div>
              <p className="flex items-center gap-1.5 font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-gold mb-2">
                <Lock size={11} />
                Gestão
              </p>
              <div className="cartao-simples overflow-hidden">
                {DE_QUEM_GERE.map(a => (
                  <Interruptor
                    key={a.chave}
                    ligado={Boolean(prefs[a.chave])}
                    aoMudar={v => setPrefs(p => ({ ...p, [a.chave]: v }))}
                    titulo={a.titulo}
                    nota={a.nota}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="cartao-simples overflow-hidden">
            <Interruptor
              ligado={silencioLigado}
              aoMudar={v =>
                setPrefs(p => ({
                  ...p,
                  silencio_inicio: v ? (p.silencio_inicio === p.silencio_fim ? '23:00' : p.silencio_inicio) : '00:00',
                  silencio_fim: v ? (p.silencio_fim === p.silencio_inicio ? '08:00' : p.silencio_fim) : '00:00',
                }))
              }
              titulo="Silêncio à noite"
              nota="Guardamos os avisos para a manhã"
            />

            {silencioLigado && (
              <div className="flex items-center gap-2 px-3.5 py-3 border-t border-white/7">
                <label className="flex-1">
                  <span className="block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5">
                    Das
                  </span>
                  <input
                    type="time"
                    value={prefs.silencio_inicio.slice(0, 5)}
                    onChange={e => setPrefs(p => ({ ...p, silencio_inicio: e.target.value }))}
                    className="w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                  />
                </label>
                <label className="flex-1">
                  <span className="block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5">
                    Às
                  </span>
                  <input
                    type="time"
                    value={prefs.silencio_fim.slice(0, 5)}
                    onChange={e => setPrefs(p => ({ ...p, silencio_fim: e.target.value }))}
                    className="w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>

    <UnsavedChangesModal {...guarda.props} />
    </>
  )
}

export default PreferenciasAvisos
