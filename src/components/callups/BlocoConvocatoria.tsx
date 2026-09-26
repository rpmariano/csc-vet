import React, { useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { CallupRow } from './CallupRow'
import { QuorumFilterCards, type CallupFilter } from './QuorumFilterCards'
import { ConfirmModal } from '../ConfirmModal'
import { CaixaProcura } from '../ui/CaixaProcura'
import { getPlayerDisplayName } from '../../lib/eventos'
import { triggerHaptic } from '../../utils/haptics'

interface ConvocadoDoBloco {
  id: string
  player_id: string
  status: 'called' | 'confirmed' | 'declined' | 'pending'
  player?: {
    name?: string
    shirt_name?: string | null
    nickname?: string | null
    jersey_number?: number | null
    position?: string | null
  } | null
}

/** O que só existe onde a convocatória se edita — nos Eventos. */
export interface AcoesDaConvocatoria {
  mudarEstado: (callupId: string, estado: 'confirmed' | 'declined' | 'called') => void
  tirar: (callupId: string) => void
  /** Tirar de uma vez quem ficou sem condições depois de convocado. */
  tirarVarios: (callupIds: string[]) => Promise<void>
  /** Abrir a ficha rápida do convocado (4a). */
  abrir?: (callupId: string) => void
}

interface BlocoConvocatoriaProps<C extends ConvocadoDoBloco> {
  convocatorias: C[]
  maxJogadores?: number | null
  /** `null` se está disponível; senão o estado que o impede ("Lesionado"…). */
  estadoQueImpede: (c: C) => string | null
  /** Quem gere vê as contagens de quem não respondeu, o quórum e a procura. */
  gere: boolean
  /**
   * Presentes só nos Eventos, que é o único sítio onde a convocatória se
   * edita. Sem elas o bloco é só de leitura: cada linha diz a resposta numa
   * pastilha, e não há "Tirar" nenhum.
   */
  acoes?: AcoesDaConvocatoria
  /** Um bloco a meio, por cima da lista — o "acrescentar" dos Eventos. */
  acrescentar?: React.ReactNode
  abertoInicial?: boolean
}

/**
 * A convocatória de um evento: o cabeçalho com as contagens, o quórum, a
 * procura, o aviso de quem ficou sem condições e a lista.
 *
 * É a mesma na Agenda e nos Eventos. Eram duas: a da Agenda tinha a procura e
 * o "Tirar" de quem ficou sem condições, a dos Eventos o acrescentar — e as
 * duas escreviam na mesma tabela. Hoje a convocatória edita-se só nos Eventos
 * (com `acoes`), e a Agenda mostra-a igual, só para ler.
 *
 * **A convocatória é o que está em `callups`, e mais nada.** Quem ficou
 * lesionado ou inativo depois de convocado fica à vista, marcado com o estado;
 * escondê-lo mudava as contagens e tirava a quem gere a maneira de o tirar.
 */
export function BlocoConvocatoria<C extends ConvocadoDoBloco>({
  convocatorias,
  maxJogadores,
  estadoQueImpede,
  gere,
  acoes,
  acrescentar,
  abertoInicial = false,
}: BlocoConvocatoriaProps<C>) {
  const [aberto, setAberto] = useState(abertoInicial)
  const [filtro, setFiltro] = useState<CallupFilter>('all')
  const [procura, setProcura] = useState('')
  const [aConfirmarTirar, setAConfirmarTirar] = useState(false)

  const indisponiveis = convocatorias.filter(c => estadoQueImpede(c) !== null)
  const confirmados = convocatorias.filter(c => c.status === 'confirmed')
  const recusados = convocatorias.filter(c => c.status === 'declined')
  const semResposta = convocatorias.filter(c => c.status === 'called')

  const visiveis = convocatorias.filter(c => {
    if (filtro !== 'all' && c.status !== filtro) return false
    if (!procura) return true
    const q = procura.toLowerCase()
    return Boolean(
      c.player?.name?.toLowerCase().includes(q) ||
      c.player?.shirt_name?.toLowerCase().includes(q) ||
      c.player?.nickname?.toLowerCase().includes(q) ||
      (c.player?.jersey_number && c.player.jersey_number.toString().includes(q)),
    )
  })

  return (
    <div className="bg-white/[0.07] p-4 rounded-3xl space-y-3.5 transition-all border border-white/10 border-t-white/20 shadow-lg shadow-black/20">
      <button
        type="button"
        onClick={() => setAberto(prev => !prev)}
        aria-expanded={aberto}
        className="w-full min-h-11 flex items-center justify-between cursor-pointer select-none group text-left
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-xl"
      >
        <div className="flex-1 pr-2">
          <h3 className="text-base font-black text-white flex items-center gap-2 group-hover:text-csc-gold transition-colors">
            <Users size={18} className="text-csc-gold" />
            <span>Convocatória ({convocatorias.length}{maxJogadores ? ` / ${maxJogadores} máx` : ''})</span>
          </h3>

          {/*
            **A contagem por responder é de quem gere.** Ao atleta, "0
            confirmados · 22 pendentes" por cima do seu próprio botão é a
            prova de que ninguém responde, no sítio onde lhe pedimos que
            responda. Vê os "sim" enquanto houver algum, e nada quando não há.
          */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {(gere || confirmados.length > 0) && (
              <span className="text-[10.5px] font-bold text-csc-verde-texto bg-csc-light/15 px-2 py-0.5 rounded-md">
                {confirmados.length} {confirmados.length === 1 ? 'confirmado' : 'confirmados'}
              </span>
            )}
            {/* Neutro, e não âmbar: quem ainda não respondeu não está em
                falta com ninguém. */}
            {gere && (
              <span className="text-[10.5px] font-bold text-white/70 bg-white/8 px-2 py-0.5 rounded-md">
                {semResposta.length} sem resposta
              </span>
            )}
            {gere && recusados.length > 0 && (
              <span className="text-[10.5px] font-bold text-csc-vermelho-texto bg-csc-red/15 px-2 py-0.5 rounded-md">
                {recusados.length} {recusados.length === 1 ? 'recusado' : 'recusados'}
              </span>
            )}
            {indisponiveis.length > 0 && (
              <span className="text-[10.5px] font-bold text-csc-vermelho-texto bg-csc-red/18 border border-csc-red/35 px-2 py-0.5 rounded-md">
                {indisponiveis.length} sem condições
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-white/70 group-hover:text-white">
            {aberto ? 'Recolher' : 'Expandir'}
          </span>
          {/* Expandir no sítio é o `ChevronDown`, que roda — a seta para a
              direita é de quem vai para outro ecrã. */}
          <div className="p-2 rounded-xl bg-white/10 group-hover:bg-white/20 text-white transition-all">
            <ChevronDown size={16} className={`transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
          </div>
        </div>
      </button>

      {aberto && (
        <div className="space-y-4 pt-3 border-t border-white/10 animate-fade-in">
          {/* Quórum e procura: ferramentas de quem monta a convocatória. */}
          {gere && (
            <div className="space-y-2">
              <QuorumFilterCards
                totalCount={convocatorias.length}
                confirmedCount={confirmados.length}
                pendingCount={semResposta.length}
                declinedCount={recusados.length}
                activeFilter={filtro}
                onSelect={setFiltro}
              />

              <CaixaProcura
                valor={procura}
                aoMudar={setProcura}
                placeholder="Procurar convocado"
                rotulo="Procurar convocado"
              />
            </div>
          )}

          {/*
            A convocatória envelhece: quem foi chamado apto pode ficar lesionado
            ou ser desativado antes do jogo. Não se corrige sozinha — apagar
            linhas por trás da equipa técnica apagaria as respostas já dadas —,
            mas tem de se poder atualizar num toque.
          */}
          {acoes && indisponiveis.length > 0 && (
            <div className="rounded-2xl bg-csc-red/12 border border-csc-red/30 p-3.5 flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block font-display font-extrabold text-[12px] text-csc-vermelho-texto">
                  {indisponiveis.length === 1
                    ? '1 convocado sem condições'
                    : `${indisponiveis.length} convocados sem condições`}
                </span>
                <span className="block text-[10.5px] leading-snug text-white/62 mt-0.5">
                  Ficaram lesionados ou inativos depois de serem convocados. Continuam na lista até
                  decidires.
                </span>
              </span>
              <button
                type="button"
                onClick={() => { triggerHaptic('medium'); setAConfirmarTirar(true) }}
                className="flex-none min-h-11 px-3.5 rounded-[18px] bg-csc-red/20 border border-csc-red/45
                  text-csc-vermelho-texto font-display font-bold text-[12px] cursor-pointer
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                Tirar
              </button>
            </div>
          )}

          {acrescentar}

          {convocatorias.length === 0 ? (
            <div className="text-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/15">
              <Users size={32} className="mx-auto text-white/65 mb-1" />
              <p className="text-xs font-bold text-white/60">Nenhum jogador convocado ainda.</p>
            </div>
          ) : visiveis.length === 0 ? (
            <div className="text-center py-8 bg-white/5 rounded-2xl text-white/60 space-y-2">
              <p className="text-xs font-bold">Nenhum atleta encontrado para os critérios selecionados.</p>
              <button
                type="button"
                onClick={() => { setFiltro('all'); setProcura('') }}
                className="min-h-11 text-xs font-black text-csc-gold underline cursor-pointer"
              >
                Ver todos os {convocatorias.length} convocados
              </button>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-2.5">
                {visiveis.map(c => (
                  <CallupRow
                    key={c.id}
                    status={c.status}
                    player={c.player}
                    displayName={getPlayerDisplayName(c.player)}
                    isCoachOrAdmin={Boolean(acoes)}
                    onConfirm={() => acoes?.mudarEstado(c.id, 'confirmed')}
                    onDecline={() => acoes?.mudarEstado(c.id, 'declined')}
                    onSetPending={() => acoes?.mudarEstado(c.id, 'called')}
                    onRemove={() => acoes?.tirar(c.id)}
                    onOpen={acoes?.abrir ? () => acoes.abrir?.(c.id) : undefined}
                    impedimento={estadoQueImpede(c)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={aConfirmarTirar}
        title="Atualizar a convocatória"
        description={
          indisponiveis.length === 1
            ? 'Tirar da convocatória o convocado que já não tem condições para este evento?'
            : `Tirar da convocatória os ${indisponiveis.length} convocados que já não têm condições para este evento?`
        }
        confirmText="Sim, tirar"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={async () => {
          setAConfirmarTirar(false)
          await acoes?.tirarVarios(indisponiveis.map(c => c.id))
        }}
        onCancel={() => setAConfirmarTirar(false)}
      />
    </div>
  )
}
