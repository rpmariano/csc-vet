import React, { useCallback, useEffect, useState } from 'react'
import { BellRing, Check, ChevronRight, Moon } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { BottomSheet } from './BottomSheet'
import { Botao } from './ui'
import { estadoDoPush, ligarAvisos, type EstadoPush } from '../lib/push'

/**
 * O convite para ligar os avisos.
 *
 * **O problema que isto resolve.** Das ~1200 convocatórias em produção, 1191
 * estão sem resposta. A causa mais provável não é desinteresse: é que ninguém
 * está a ser perguntado. O `avisos_pendentes()` faz `COALESCE(flag, false)`,
 * por isso quem nunca abriu o ecrã 12b não tem linha em
 * `notification_preferences` e **não recebe nada** — verificado, sete
 * subscrições sem preferências dão zero avisos. E o ecrã 12b está a quatro
 * toques de distância, atrás da fotografia do cabeçalho, com um rótulo que não
 * diz que serve para saber que se foi convocado.
 *
 * Enquanto isso for verdade, a app só avisa quem já se lembrou de a abrir — e
 * a pergunta da convocatória não chega a ser feita.
 *
 * **Como se pergunta.** Em dois sítios, e nenhum deles bloqueia a app:
 *
 * - uma faixa na Home, para quem nunca escolheu — é quem nunca responde que
 *   precisa de ver isto, e essas pessoas nunca chegam ao momento de baixo;
 * - a seguir a uma resposta, que é o momento em que a pergunta se explica
 *   sozinha: acabaste de vir cá dizer que sim, queres que te avisemos da
 *   próxima em vez de teres de vir ver?
 *
 * **O "sim" liga três avisos, e o convite diz quais.** Convocatórias,
 * comunicados e quotas em atraso — decisão da direção. Ligar mais do que a
 * pergunta promete seria ganhar a resposta com letra pequena, por isso os três
 * estão escritos no painel, com a nota de cada um, antes de haver botão nenhum
 * para carregar. Os avisos de quem gere não entram: são sobre o trabalho da
 * equipa técnica e continuam nas Definições.
 *
 * **"Agora não" adia, não recusa** — e ao fim de três vezes cala-se de vez. Um
 * convite que volta para sempre é um anúncio.
 */

/** Quantos dias o convite descansa depois de um "Agora não". */
const DIAS_DE_DESCANSO = 21

/** Ao fim de tantos adiamentos, o convite desiste. */
const ADIAMENTOS_ATE_DESISTIR = 3

const CHAVE_ADIADO = 'csc_convite_avisos_adiado'
const CHAVE_ADIAMENTOS = 'csc_convite_avisos_adiamentos'

/** O que o "sim" liga, e é isto que o painel escreve antes de o oferecer. */
const O_QUE_LIGA: readonly { titulo: string; nota: string }[] = [
  { titulo: 'Convocatórias', nota: 'Quando és chamado, e na véspera se não respondeste' },
  { titulo: 'Comunicados', nota: 'Avisos da direção e da equipa técnica' },
  { titulo: 'Quotas', nota: 'Só quando ficas em atraso' },
]

/*
  Os mesmos valores que o ecrã 12b grava, para as duas portas escreverem a
  mesma linha. O silêncio da noite não é um aviso, é uma regra sobre eles, e
  fica posto para quem ligar o primeiro não o receber às três da manhã.
*/
const ESCOLHA_DO_CONVITE = {
  convocatorias: true,
  comunicados: true,
  quotas_em_atraso: true,
  eventos_sem_convocatoria: false,
  fichas_por_preencher: false,
  silencio_inicio: '23:00',
  silencio_fim: '08:00',
}

const lerNumero = (chave: string): number => {
  try {
    return Number(localStorage.getItem(chave)) || 0
  } catch {
    return 0
  }
}

const escrever = (chave: string, valor: string) => {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    /* Modo privado, armazenamento cheio: o convite volta na próxima. Não é
       motivo para rebentar o ecrã. */
  }
}

/** Está dentro do período de descanso de um "Agora não"? */
function aDescansar(): boolean {
  if (lerNumero(CHAVE_ADIAMENTOS) >= ADIAMENTOS_ATE_DESISTIR) return true
  let quando: string | null = null
  try {
    quando = localStorage.getItem(CHAVE_ADIADO)
  } catch {
    return false
  }
  if (!quando) return false
  const dias = (Date.now() - new Date(quando).getTime()) / 86_400_000
  return dias < DIAS_DE_DESCANSO
}

export interface ConviteAvisos {
  /** Há convite a fazer a esta pessoa, neste telemóvel? */
  oferecer: boolean
  /** O estado do push neste aparelho, para o painel dizer a verdade. */
  push: EstadoPush | null
  /** Depois de ligar ou de desistir: o convite não se repete. */
  arrumar: () => void
  /** "Agora não": adia, e conta o adiamento. */
  adiar: () => void
}

/**
 * Decide se há convite a fazer.
 *
 * A ordem é a mais barata primeiro, como no `useFichaPorLigar`: o descanso é
 * uma leitura de `localStorage`, o estado do push é local, e só quem passa nos
 * dois é que custa um pedido à base.
 *
 * **Só a quem tem o papel de jogador.** O convite promete "quando fores
 * convocado", e a quem nunca é convocado isso é uma promessa falsa. Quem gere
 * e não joga continua a ter os seus avisos nas Definições — e metade da
 * direção deste clube também joga, por isso vê o convite como toda a gente.
 */
export function useConviteAvisos(perfilId: string | undefined, eJogador: boolean): ConviteAvisos {
  const [oferecer, setOferecer] = useState(false)
  const [push, setPush] = useState<EstadoPush | null>(null)

  useEffect(() => {
    if (!perfilId || !eJogador || aDescansar()) return
    let cancelado = false

    const verificar = async () => {
      const estado = await estadoDoPush()
      if (cancelado) return
      setPush(estado)

      /* Um telemóvel que bloqueou as notificações no browser não tem nada a
         ganhar com o convite: a app não consegue voltar a pedir, e a saída é
         nas definições do sistema. Fica para as Definições, que o explicam. */
      if (estado === 'recusado') return

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('profile_id')
        .eq('profile_id', perfilId)
        .maybeSingle()

      /* Um erro de rede não é uma resposta: mais vale não convidar do que
         convidar quem já escolheu. */
      if (cancelado || error || data) return
      setOferecer(true)
    }

    verificar()
    return () => { cancelado = true }
  }, [perfilId, eJogador])

  const arrumar = useCallback(() => setOferecer(false), [])

  const adiar = useCallback(() => {
    escrever(CHAVE_ADIADO, new Date().toISOString())
    escrever(CHAVE_ADIAMENTOS, String(lerNumero(CHAVE_ADIAMENTOS) + 1))
    setOferecer(false)
  }, [])

  return { oferecer, push, arrumar, adiar }
}

/**
 * A faixa na Home.
 *
 * Dourada e não vermelha: é uma oferta e não um alerta. O vermelho desta app
 * está tomado pelo que corre mal — quotas em atraso, eventos sem convocatória
 * — e gastá-lo aqui punha em alarme quem não tem problema nenhum.
 */
export const FaixaConvidarAvisos: React.FC<{ aoAbrir: () => void }> = ({ aoAbrir }) => (
  <button
    type="button"
    onClick={() => { triggerHaptic('light'); aoAbrir() }}
    className="cartao-simples w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left cursor-pointer
      bg-csc-gold/12 border-csc-gold/32 transition-transform duration-150 active:scale-97
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
  >
    <BellRing size={17} className="text-csc-gold shrink-0" />
    <span className="min-w-0 flex-1">
      <span className="block font-display font-extrabold text-[12.5px] text-white">
        Não estás a receber avisos
      </span>
      <span className="block text-[10.5px] text-white/62 mt-0.5">
        Sabes que foste convocado só se abrires a app
      </span>
    </span>
    <ChevronRight size={16} className="text-white/35 shrink-0" />
  </button>
)

/**
 * O painel do convite.
 *
 * `motivo` muda a primeira frase, e mais nada: a pergunta feita a seguir a uma
 * resposta tem de reconhecer o que a pessoa acabou de fazer, senão soa a
 * anúncio disparado ao calhas.
 */
export const PersianaConvidarAvisos: React.FC<{
  aberto: boolean
  perfilId: string | undefined
  push: EstadoPush | null
  motivo: 'faixa' | 'acabou-de-responder'
  aoLigado: () => void
  aoAdiar: () => void
}> = ({ aberto, perfilId, push, motivo, aoLigado, aoAdiar }) => {
  const [aLigar, setALigar] = useState(false)

  const semEntrega = push === 'sem-suporte' || push === 'por-configurar'

  const ligar = async () => {
    if (!perfilId) return
    triggerHaptic('success')
    setALigar(true)
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          profile_id: perfilId,
          ...ESCOLHA_DO_CONVITE,
          updated_at: new Date().toISOString(),
        })
      if (error) throw error

      /* A escolha fica gravada mesmo que a subscrição falhe: as preferências
         são da pessoa e valem em todos os aparelhos, a subscrição é de um só.
         É a mesma regra do ecrã 12b. */
      const estado = await ligarAvisos(perfilId)
      if (estado === 'ligado') {
        toast.success('Pronto. Este telemóvel avisa-te quando fores convocado.')
      } else if (estado === 'sem-suporte') {
        toast.warning('Escolha guardada — mas este browser não recebe avisos. No iPhone, instala a app no ecrã principal.')
      } else if (estado === 'recusado') {
        toast.warning('Escolha guardada — mas este telemóvel tem as notificações bloqueadas. Dá-as nas definições do site.')
      } else {
        toast.warning('Escolha guardada — mas o envio ainda não está configurado no servidor.')
      }
      aoLigado()
    } catch (err) {
      toast.error('Não foi possível ligar os avisos: ' + (err instanceof Error ? err.message : 'erro inesperado'))
    } finally {
      setALigar(false)
    }
  }

  return (
    <BottomSheet
      isOpen={aberto}
      onClose={aoAdiar}
      title="Avisamos-te quando fores convocado?"
      description="Uma escolha, e o telemóvel trata do resto"
      icon={
        <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
          <BellRing size={17} />
        </div>
      }
      footer={
        <>
          <Botao aparencia="vidro" largo onClick={() => { triggerHaptic('light'); aoAdiar() }}>
            Agora não
          </Botao>
          <Botao largo onClick={ligar} disabled={aLigar || !perfilId}>
            {aLigar ? 'A ligar…' : 'Sim, avisa-me'}
          </Botao>
        </>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-white/82">
        {motivo === 'acabou-de-responder'
          ? 'Respondeste aqui, e ainda bem. Da próxima podes responder sem ter de vir ver: o telemóvel toca quando o teu nome entra numa convocatória.'
          : 'Hoje só sabes que foste convocado se abrires a app. Com os avisos ligados, o telemóvel toca quando o teu nome entra numa convocatória — e respondes daí.'}
      </p>

      <p className="font-display font-extrabold text-[9.5px] tracking-[0.18em] uppercase text-white/62 mt-5 mb-2">
        O que fica ligado
      </p>
      <div className="cartao-simples overflow-hidden">
        {O_QUE_LIGA.map(aviso => (
          <div key={aviso.titulo} className="flex items-start gap-3 px-3.5 py-3 border-t border-white/7 first:border-t-0">
            <Check size={15} className="text-csc-verde-texto shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block font-display font-bold text-[12.5px] text-white">{aviso.titulo}</span>
              <span className="block text-[10.5px] leading-snug text-white/62 mt-0.5">{aviso.nota}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.5 mt-3">
        <Moon size={14} className="text-white/45 shrink-0" />
        <p className="text-[10.5px] leading-snug text-white/62">
          Nada entre as 23:00 e as 08:00. Mudas tudo isto quando quiseres, no teu perfil.
        </p>
      </div>

      {semEntrega && (
        <p className="text-[10.5px] leading-snug text-csc-gold mt-3">
          {push === 'sem-suporte'
            ? 'Neste telemóvel a app ainda não consegue entregar avisos. No iPhone, instala-a no ecrã principal e volta aqui — a tua escolha fica guardada à mesma.'
            : 'O envio ainda não está configurado no servidor. A tua escolha fica guardada e começa a valer quando estiver.'}
        </p>
      )}
    </BottomSheet>
  )
}
