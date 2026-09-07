import React, { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { BottomSheet } from './BottomSheet'
import { Botao } from './ui'

/**
 * Preferências de avisos (ecrã 12b) — o que cada um escolhe receber.
 *
 * As notificações ainda não são enviadas por ninguém: o envio é do lado do
 * servidor e não existe. O que existe é a tabela `notification_preferences`,
 * criada na fase 1 e privada de cada um, e este ecrã, que é onde a escolha
 * fica guardada à espera de quem a leia. Sem ele, o dia em que os avisos
 * começarem a sair encontra toda a gente subscrita a tudo.
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
  silencio_inicio: string | null
  silencio_fim: string | null
}

const OMISSOES: Preferencias = {
  convocatorias: true,
  comunicados: true,
  quotas_em_atraso: true,
  eventos_sem_convocatoria: true,
  fichas_por_preencher: true,
  silencio_inicio: '23:00',
  silencio_fim: '08:00',
}

const DO_ATLETA: readonly { chave: keyof Preferencias; titulo: string; nota: string }[] = [
  { chave: 'convocatorias', titulo: 'Convocatórias', nota: 'Quando és chamado, e na véspera se não respondeste' },
  { chave: 'comunicados', titulo: 'Comunicados', nota: 'Avisos da direção e da equipa técnica' },
  { chave: 'quotas_em_atraso', titulo: 'Quotas', nota: 'Só quando ficas em atraso' },
]

const DE_QUEM_GERE: readonly { chave: keyof Preferencias; titulo: string; nota: string }[] = [
  { chave: 'eventos_sem_convocatoria', titulo: 'Evento sem convocatória', nota: 'A sete dias da data' },
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
      <span className="block text-[10.5px] leading-snug text-white/50 mt-0.5">{nota}</span>
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

  const guardar = async () => {
    if (!perfilId) return
    setAGuardar(true)
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ profile_id: perfilId, ...prefs, updated_at: new Date().toISOString() })
      if (error) throw error
      toast.success('Preferências guardadas.')
      aoFechar()
    } catch (err) {
      toast.error('Não foi possível guardar: ' + (err instanceof Error ? err.message : 'erro inesperado'))
    } finally {
      setAGuardar(false)
    }
  }

  const silencioLigado = Boolean(prefs.silencio_inicio && prefs.silencio_fim)

  return (
    <BottomSheet
      isOpen={aberto}
      onClose={aoFechar}
      title="O que quero saber"
      description="Avisos que a app te vai enviar"
      footer={
        <>
          <Botao aparencia="vidro" onClick={aoFechar}>Cancelar</Botao>
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
          <p className="text-[10.5px] leading-relaxed text-white/50 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5">
            Os avisos ainda não estão a ser enviados — o envio é do lado do servidor e está por
            fazer. A escolha fica guardada e passa a valer no dia em que começarem.
          </p>

          <div>
            <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/50 mb-2">
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
                  silencio_inicio: v ? (p.silencio_inicio ?? '23:00') : null,
                  silencio_fim: v ? (p.silencio_fim ?? '08:00') : null,
                }))
              }
              titulo="Silêncio à noite"
              nota="Guardamos os avisos para a manhã"
            />

            {silencioLigado && (
              <div className="flex items-center gap-2 px-3.5 py-3 border-t border-white/7">
                <label className="flex-1">
                  <span className="block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/55 mb-1.5">
                    Das
                  </span>
                  <input
                    type="time"
                    value={(prefs.silencio_inicio ?? '23:00').slice(0, 5)}
                    onChange={e => setPrefs(p => ({ ...p, silencio_inicio: e.target.value }))}
                    className="w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                  />
                </label>
                <label className="flex-1">
                  <span className="block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/55 mb-1.5">
                    Às
                  </span>
                  <input
                    type="time"
                    value={(prefs.silencio_fim ?? '08:00').slice(0, 5)}
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
  )
}

export default PreferenciasAvisos
