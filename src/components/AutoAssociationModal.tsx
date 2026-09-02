import React, { useState, useEffect } from 'react'
import { Sparkles, X, Search, CheckCircle2, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'

export const AutoAssociationModal: React.FC = () => {
  const { user, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [matchedPlayer, setMatchedPlayer] = useState<Partial<Profile> | null>(null)
  const [isManualSelect, setIsManualSelect] = useState(false)
  const [manualSearch, setManualSearch] = useState('')
  const [loading, setLoading] = useState(false)
  // O plantel vem do Supabase. Até agosto de 2026 vinha de uma lista embutida no
  // código que continha dados pessoais reais e era servida publicamente.
  const [squad, setSquad] = useState<Profile[]>([])
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('csc_dismiss_association_prompt') === 'true'
  })

  useEffect(() => {
    if (!user || !profile || dismissed) return
    let cancelado = false

    // A lista serve só para o utilizador escolher a sua ficha à mão, por isso
    // vem da vista pública: nome, alcunha, número e posição, sem NIF, IBAN,
    // morada nem telefone de ninguém.
    supabase
      .from('v_players_public')
      .select('id, name, nickname, shirt_name, jersey_number, position, status')
      .not('jersey_number', 'is', null)
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          console.error('Erro ao carregar o plantel para associação:', error.message)
          return
        }
        setSquad((data as Profile[]) || [])
      })

    return () => { cancelado = true }
  }, [user, profile, dismissed])

  useEffect(() => {
    if (!user || !profile || dismissed) return
    let cancelado = false

    // Verificar se o perfil atual já tem dados desportivos atribuídos
    const isAlreadyLinked = Boolean(
      profile.jersey_number ||
      (profile.position && profile.position !== 'Médio Centro') ||
      profile.shirt_name ||
      profile.nif
    )
    if (isAlreadyLinked) return

    // A correspondência (email exato, telefone com 9+ dígitos, primeiro e
    // último nome) é feita no servidor: com a RLS fechada o cliente já não lê
    // as fichas dos outros, e a função só devolve campos não sensíveis.
    supabase.rpc('find_my_profile_match').then(({ data, error }) => {
      if (cancelado) return
      if (error) {
        console.error('Erro ao procurar a ficha de atleta:', error.message)
        return
      }
      const alvo = Array.isArray(data) ? data[0] : data
      if (alvo?.id) {
        setMatchedPlayer(alvo as Partial<Profile>)
        setIsOpen(true)
      }
    })

    return () => { cancelado = true }
  }, [user, profile, dismissed])

  const handleDismiss = () => {
    setIsOpen(false)
    setDismissed(true)
    sessionStorage.setItem('csc_dismiss_association_prompt', 'true')
  }

  const handleConfirmAssociation = async (selectedTarget: Partial<Profile>) => {
    if (!user || !profile) return
    setLoading(true)

    try {
      // Toda a associação corre no servidor, numa transação só: copia os dados
      // da ficha para o perfil de quem está autenticado, transfere as
      // referências (convocatórias, presenças, estatísticas, quotas, encargos,
      // torneios) e apaga a ficha órfã. O cliente já não lê nem escreve os
      // dados sensíveis de outra ficha — e a função recusa qualquer ficha que
      // já tenha uma conta associada.
      const { error: assocErr } = await supabase.rpc('associate_my_profile', { target_id: selectedTarget.id })
      if (assocErr) throw assocErr

      toast.success(`Conta associada com sucesso à ficha de ${selectedTarget.name}!`)
      setIsOpen(false)
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      toast.error('Erro ao associar perfil: ' + (err.message || 'Verifique a ligação'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !matchedPlayer) return null

  const filteredSquad = squad.filter(p => 
    !manualSearch ||
    p.name.toLowerCase().includes(manualSearch.toLowerCase()) ||
    (p.nickname && p.nickname.toLowerCase().includes(manualSearch.toLowerCase())) ||
    (p.jersey_number && p.jersey_number.toString().includes(manualSearch)) ||
    (p.position && p.position.toLowerCase().includes(manualSearch.toLowerCase()))
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-amber-300">
        <button
          onClick={handleDismiss}
          aria-label="Fechar"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Top Icon & Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-csc-gold to-amber-300 text-csc-dark flex items-center justify-center shadow-xs">
            <Sparkles size={20} className="animate-pulse" />
          </span>
          <div>
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
              Associação Inteligente
            </span>
            <h2 className="text-xl font-black text-gray-900 leading-tight">
              Encontrámos a tua Ficha de Atleta!
            </h2>
          </div>
        </div>

        {!isManualSelect ? (
          <div className="space-y-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              Olá <strong className="text-gray-900">{profile?.name || user?.email}</strong>! Detetámos que a tua conta corresponde à seguinte ficha de atleta do plantel oficial:
            </p>

            {/* Cartão de Correspondência Sugerida */}
            <div className="bg-gradient-to-br from-amber-50/80 via-white to-amber-100/30 p-4 rounded-2xl border-2 border-amber-300 shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-csc-dark text-csc-gold flex items-center justify-center font-black text-2xl shadow-md border-2 border-white shrink-0">
                  {matchedPlayer.jersey_number ? `#${matchedPlayer.jersey_number}` : '⚽'}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-gray-900 text-base leading-tight">
                    {matchedPlayer.name}
                  </h3>
                  {matchedPlayer.shirt_name && (
                    <p className="text-xs font-bold text-amber-900">
                      Nome na Camisola: "{matchedPlayer.shirt_name}"
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
                    <span className="bg-amber-200/80 text-amber-900 font-extrabold px-2 py-0.5 rounded-md">
                      {matchedPlayer.position}
                    </span>
                    {matchedPlayer.kit_size && (
                      <span className="bg-gray-100 text-gray-700 font-bold px-1.5 py-0.5 rounded">
                        Tam: {matchedPlayer.kit_size}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-[11px] text-gray-600 font-medium">
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold">Email Ficha:</span>
                  <span className="truncate block font-semibold text-gray-800">{matchedPlayer.email}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[9px] uppercase font-bold">Telemóvel:</span>
                  <span className="font-semibold text-gray-800">{matchedPlayer.phone || 'Sem registo'}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 italic">
              Ao confirmares a associação, terás acesso imediato às tuas convocatórias, pagamento de quotas, dados de equipamento e estatísticas.
            </p>

            {/* Ações */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleConfirmAssociation(matchedPlayer)}
                className="w-full py-3.5 bg-csc-dark hover:bg-csc-dark/85 text-white font-black rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <CheckCircle2 size={18} className="text-csc-gold" />
                <span>{loading ? 'A associar...' : '✓ Confirmar e Associar à Minha Ficha'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsManualSelect(true)}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Search size={14} />
                <span>Não sou este atleta • Escolher outro do Plantel</span>
              </button>
            </div>
          </div>
        ) : (
          /* Modo de Seleção Manual */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-600">
                Selecione o seu nome na lista oficial dos 31 atletas:
              </p>
              <button
                type="button"
                onClick={() => setIsManualSelect(false)}
                className="text-xs text-csc-dark font-black hover:underline"
              >
                ← Voltar à sugestão
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="Pesquisar por nome, camisola ou posição..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark"
              />
            </div>

            {/* Squad List */}
            <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-2xl">
              {filteredSquad.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleConfirmAssociation(p)}
                  disabled={loading}
                  className="w-full p-3 hover:bg-amber-50/80 transition-colors flex items-center justify-between text-left gap-2 cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-csc-dark text-white font-black text-xs flex items-center justify-center shrink-0">
                      {p.jersey_number ? `#${p.jersey_number}` : '-'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-gray-900 truncate group-hover:text-csc-dark">
                        {p.name} {p.shirt_name ? `(${p.shirt_name})` : ''}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">
                        {p.position} {p.kit_size ? `• Tam: ${p.kit_size}` : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-csc-dark group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
