import React from 'react'
import { X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'

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
  const painelRef = useModalA11y({ isOpen, onClose })

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-modal-top animate-fade-in"
      onMouseDown={e => {
        // mousedown no fundo, e não um arrasto que começou dentro do painel (ex.: a selecionar texto)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-opp-titulo"
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl border border-gray-100 space-y-4 outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-900 flex items-center justify-center text-lg font-black shadow-xs" aria-hidden="true">
            🛡️
          </div>
          <div>
            <h3 id="quick-opp-titulo" className="text-base font-black text-csc-dark">Criar Novo Adversário</h3>
            <p className="text-[11px] text-gray-500">Regista uma nova equipa/clube adversário para seleção imediata.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="quick-opp-nome">Nome do Clube / Equipa *</label>
            <input
              id="quick-opp-nome"
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => onNameChange(e.target.value)}
              placeholder="Ex: G.D. Estoril Praia"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold text-gray-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="quick-opp-sigla">Sigla (opcional)</label>
              <input
                id="quick-opp-sigla"
                type="text"
                value={initials}
                onChange={e => onInitialsChange(e.target.value)}
                placeholder="Ex: GDEP"
                maxLength={6}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white uppercase font-bold text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="quick-opp-campo">Campo Habitual</label>
              <select
                id="quick-opp-campo"
                value={homeFieldId}
                onChange={e => onHomeFieldIdChange(e.target.value)}
                className="w-full min-w-0 px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium text-gray-900"
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
              <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="quick-opp-contacto">Nome do Contacto</label>
              <input
                id="quick-opp-contacto"
                type="text"
                value={contactName}
                onChange={e => onContactNameChange(e.target.value)}
                placeholder="Ex: Diretor desportivo"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1" htmlFor="quick-opp-telefone">Telefone Contacto</label>
              <input
                id="quick-opp-telefone"
                type="tel"
                value={contactPhone}
                onChange={e => onContactPhoneChange(e.target.value)}
                placeholder="Ex: 912 345 678"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white text-gray-900"
              />
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="flex-1 px-4 py-2.5 bg-csc-dark hover:bg-csc-dark/90 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <span>{isSaving ? 'A registar...' : '➕ Criar Adversário'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuickOpponentModal
