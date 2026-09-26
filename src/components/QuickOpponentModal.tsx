import React from 'react'
import { Shield } from 'lucide-react'
import Modal from './Modal'
import { Botao } from './ui'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from './UnsavedChangesModal'
import { CLASSE_CAMPO as CAMPO_DIALOGO, CLASSE_ETIQUETA_CAMPO as ETIQUETA } from './ui/formulario'

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
  /** Campos disponíveis para "Campo Habitual". */
  fields: { id: string; name: string }[]
  onNameChange: (valor: string) => void
  onInitialsChange: (valor: string) => void
  onHomeFieldIdChange: (valor: string) => void
  onContactNameChange: (valor: string) => void
  onContactPhoneChange: (valor: string) => void
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
  fields,
  onNameChange,
  onInitialsChange,
  onHomeFieldIdChange,
  onContactNameChange,
  onContactPhoneChange,
  onSubmit,
  onClose,
  isSaving = false,
}) => {
  /* Um adversário meio preenchido não se perde por um Escape ou um clique ao lado. */
  const guarda = useAlteracoesPorGravar({
    aberto: isOpen,
    valores: [name, initials, homeFieldId, contactName, contactPhone],
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
