import React from 'react'
import { MapPin } from 'lucide-react'
import Modal from './Modal'
import { Botao } from './ui'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from './UnsavedChangesModal'
import { CLASSE_CAMPO as CAMPO_DIALOGO, CLASSE_ETIQUETA_CAMPO as ETIQUETA } from './ui/formulario'

/** Um submit sem evento a sério — o formulário só lhe chama `preventDefault`. */
const EVENTO_FALSO = { preventDefault: () => {} } as React.FormEvent

/**
 * Criação rápida de um campo/instalação sem sair do formulário de evento.
 *
 * Vivia duplicado no Calendário e nos Eventos. Tinha moldura própria, com um
 * título escuro sobre o painel escuro (não se lia) e um fechar de 32px; passou
 * ao `<Modal>` na vaga 4 da auditoria de design.
 *
 * Abre sempre por cima do formulário de evento — daí o `stacked`.
 */

export interface QuickFieldModalProps {
  isOpen: boolean
  name: string
  address: string
  onNameChange: (valor: string) => void
  onAddressChange: (valor: string) => void
  onSubmit: (e: React.FormEvent) => void
  /** Fecho pedido pelo utilizador (X, Cancelar, Escape ou clique no fundo). */
  onClose: () => void
  isSaving?: boolean
}

export const QuickFieldModal: React.FC<QuickFieldModalProps> = ({
  isOpen,
  name,
  address,
  onNameChange,
  onAddressChange,
  onSubmit,
  onClose,
  isSaving = false,
}) => {
  /* Um campo meio preenchido não se perde por um Escape ou um clique ao lado. */
  const guarda = useAlteracoesPorGravar({
    aberto: isOpen,
    valores: [name, address],
    aoGravar: () => onSubmit(EVENTO_FALSO),
    aoSair: onClose,
    descricao: 'O campo que estás a criar ainda não foi gravado. Se saíres agora, perde-se.',
  })

  if (!isOpen) return null

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={guarda.tentarFechar}
      title="Criar campo"
      description="Fica logo escolhido neste evento."
      icon={<MapPin size={20} className="text-csc-gold" aria-hidden="true" />}
      size="md"
      stacked
    >
        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className={ETIQUETA} htmlFor="quick-field-nome">Nome do Campo / Estádio *</label>
            <input
              id="quick-field-nome"
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => onNameChange(e.target.value)}
              placeholder="Ex: Campo Sintético Municipal de Tires"
              className={CAMPO_DIALOGO}
            />
          </div>

          <div>
            <label className={ETIQUETA} htmlFor="quick-field-morada">Morada / Localização</label>
            <input
              id="quick-field-morada"
              type="text"
              value={address}
              onChange={e => onAddressChange(e.target.value)}
              placeholder="Ex: Av. Amadeu Duarte, Tires, Cascais"
              className={CAMPO_DIALOGO}
            />
            <p className="text-[10.5px] text-white/62 mt-1">Usada para navegação e rotas com Google Maps.</p>
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

export default QuickFieldModal
