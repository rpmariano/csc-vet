import React from 'react'
import { Shield, Shirt } from 'lucide-react'
import Modal from './Modal'
import { Botao } from './ui'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from './UnsavedChangesModal'
import { CLASSE_CAMPO as CAMPO_DIALOGO, CLASSE_ETIQUETA_CAMPO as ETIQUETA } from './ui/formulario'
import { BadgeCoresEquipamento, CORES_EQUIPAMENTO_SUGERIDAS, separarCoresDigitadas } from './clube/equipamentos'

/** Um submit sem evento a sério — o formulário só lhe chama `preventDefault`. */
const EVENTO_FALSO = { preventDefault: () => {} } as React.FormEvent

/**
 * Criação rápida de um adversário sem sair do formulário de evento.
 * Irmão do QuickFieldModal: mesma moldura, mesmas regras de empilhamento.
 */

export interface QuickOpponentModalProps {
  isOpen: boolean
  name: string
  initials: string
  homeFieldId: string
  contactName: string
  contactPhone: string
  homeKitColor1?: string
  homeKitColor2?: string
  awayKitColor1?: string
  awayKitColor2?: string
  /** Campos disponíveis para "Campo Habitual". */
  fields: { id: string; name: string }[]
  onNameChange: (valor: string) => void
  onInitialsChange: (valor: string) => void
  onHomeFieldIdChange: (valor: string) => void
  onContactNameChange: (valor: string) => void
  onContactPhoneChange: (valor: string) => void
  onHomeKitColor1Change?: (valor: string) => void
  onHomeKitColor2Change?: (valor: string) => void
  onAwayKitColor1Change?: (valor: string) => void
  onAwayKitColor2Change?: (valor: string) => void
  onSubmit: (e: React.FormEvent) => void
  /** Fecho pedido pelo utilizador (X, Cancelar, Escape ou clique no fundo). */
  onClose: () => void
  isSaving?: boolean
}

export const QuickOpponentModal: React.FC<QuickOpponentModalProps> = ({
  isOpen,
  name,
  initials,
  homeFieldId,
  contactName,
  contactPhone,
  homeKitColor1 = '',
  homeKitColor2 = '',
  awayKitColor1 = '',
  awayKitColor2 = '',
  fields,
  onNameChange,
  onInitialsChange,
  onHomeFieldIdChange,
  onContactNameChange,
  onContactPhoneChange,
  onHomeKitColor1Change,
  onHomeKitColor2Change,
  onAwayKitColor1Change,
  onAwayKitColor2Change,
  onSubmit,
  onClose,
  isSaving = false,
}) => {
  /* Um adversário meio preenchido não se perde por um Escape ou um clique ao lado. */
  const guarda = useAlteracoesPorGravar({
    aberto: isOpen,
    valores: [name, initials, homeFieldId, contactName, contactPhone, homeKitColor1, homeKitColor2, awayKitColor1, awayKitColor2],
    aoGravar: () => onSubmit(EVENTO_FALSO),
    aoSair: onClose,
    descricao: 'O adversário que estás a criar ainda não foi gravado. Se saíres agora, perde-se.',
  })

  if (!isOpen) return null

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={guarda.tentarFechar}
      title="Criar adversário"
      description="Fica logo escolhido neste evento."
      icon={<Shield size={20} className="text-csc-gold" aria-hidden="true" />}
      size="md"
      stacked
    >
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className={ETIQUETA} htmlFor="quick-opp-nome">Nome do Clube / Equipa *</label>
            <input
              id="quick-opp-nome"
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => onNameChange(e.target.value)}
              placeholder="Ex: G.D. Estoril Praia"
              className={CAMPO_DIALOGO}
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <div>
              <label className={ETIQUETA} htmlFor="quick-opp-sigla">Sigla (opcional)</label>
              <input
                id="quick-opp-sigla"
                type="text"
                value={initials}
                onChange={e => onInitialsChange(e.target.value)}
                placeholder="Ex: GDEP"
                maxLength={6}
                className={CAMPO_DIALOGO}
              />
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="quick-opp-campo">Campo Habitual</label>
              <select
                id="quick-opp-campo"
                value={homeFieldId}
                onChange={e => onHomeFieldIdChange(e.target.value)}
                className={CAMPO_DIALOGO}
              >
                <option value="">-- Sem Campo --</option>
                {fields.map(f => (
                  <option key={f.id} value={f.id}>🏟️ {f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <div>
              <label className={ETIQUETA} htmlFor="quick-opp-contacto">Nome do Contacto</label>
              <input
                id="quick-opp-contacto"
                type="text"
                value={contactName}
                onChange={e => onContactNameChange(e.target.value)}
                placeholder="Ex: Diretor desportivo"
                className={CAMPO_DIALOGO}
              />
            </div>

            <div>
              <label className={ETIQUETA} htmlFor="quick-opp-telefone">Telefone Contacto</label>
              <input
                id="quick-opp-telefone"
                type="tel"
                value={contactPhone}
                onChange={e => onContactPhoneChange(e.target.value)}
                placeholder="Ex: 912 345 678"
                className={CAMPO_DIALOGO}
              />
            </div>
          </div>

          {onHomeKitColor1Change && (
            <div className="pt-2.5 border-t border-white/12 space-y-2.5">
              <span className="block font-display font-extrabold text-[9.5px] uppercase tracking-wider text-csc-gold">
                Cores dos Equipamentos (opcional)
              </span>

              {/* Principal / Casa */}
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <Shirt size={12} className="text-csc-gold" /> Principal (Casa)
                  </span>
                  <BadgeCoresEquipamento cor1={homeKitColor1} cor2={homeKitColor2} tamanho="pequeno" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    list="lista-cores-sugeridas-quick"
                    value={homeKitColor1}
                    onChange={e => {
                      const sep = separarCoresDigitadas(e.target.value)
                      if (sep) {
                        onHomeKitColor1Change(sep.cor1)
                        onHomeKitColor2Change?.(sep.cor2)
                      } else {
                        onHomeKitColor1Change(e.target.value)
                      }
                    }}
                    placeholder="Cor 1 (ex: Vermelho)"
                    className={CAMPO_DIALOGO}
                  />
                  <input
                    type="text"
                    list="lista-cores-sugeridas-quick"
                    value={homeKitColor2}
                    onChange={e => onHomeKitColor2Change?.(e.target.value)}
                    placeholder="Cor 2 (opcional)"
                    className={CAMPO_DIALOGO}
                  />
                </div>
              </div>

              {/* Alternativa / Fora */}
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <Shirt size={12} className="text-csc-gold" /> Alternativa (Fora)
                  </span>
                  <BadgeCoresEquipamento cor1={awayKitColor1} cor2={awayKitColor2} tamanho="pequeno" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    list="lista-cores-sugeridas-quick"
                    value={awayKitColor1}
                    onChange={e => {
                      const sep = separarCoresDigitadas(e.target.value)
                      if (sep) {
                        onAwayKitColor1Change?.(sep.cor1)
                        onAwayKitColor2Change?.(sep.cor2)
                      } else {
                        onAwayKitColor1Change?.(e.target.value)
                      }
                    }}
                    placeholder="Cor 1 (ex: Verde)"
                    className={CAMPO_DIALOGO}
                  />
                  <input
                    type="text"
                    list="lista-cores-sugeridas-quick"
                    value={awayKitColor2}
                    onChange={e => onAwayKitColor2Change?.(e.target.value)}
                    placeholder="Cor 2 (opcional)"
                    className={CAMPO_DIALOGO}
                  />
                </div>
              </div>

              <datalist id="lista-cores-sugeridas-quick">
                {CORES_EQUIPAMENTO_SUGERIDAS.map(cor => (
                  <option key={cor} value={cor} />
                ))}
              </datalist>
            </div>
          )}

          <div className="flex gap-2.5 pt-3 border-t border-white/12">
            <Botao aparencia="vidro" className="flex-1" onClick={guarda.tentarFechar}>Cancelar</Botao>
            <Botao type="submit" className="flex-1" disabled={isSaving || !name.trim()}>
              {isSaving ? 'A guardar…' : 'Guardar e escolher'}
            </Botao>
          </div>
        </form>
    </Modal>
    <UnsavedChangesModal {...guarda.props} />
    </>
  )
}

export default QuickOpponentModal
