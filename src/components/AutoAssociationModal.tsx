import React, { useState, useEffect } from 'react'
import { Sparkles, X, Search, CheckCircle2, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { Profile } from '../context/AuthContext'
import { INITIAL_PLAYERS_DATA } from '../data/initialPlayers'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'

export const AutoAssociationModal: React.FC = () => {
  const { user, profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [matchedPlayer, setMatchedPlayer] = useState<Partial<Profile> | null>(null)
  const [isManualSelect, setIsManualSelect] = useState(false)
  const [manualSearch, setManualSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('csc_dismiss_association_prompt') === 'true'
  })

  useEffect(() => {
    if (!user || !profile || dismissed) return

    // Verificar se o perfil atual já tem dados desportivos atribuídos (ex: camisola, posição ou morada)
    const isAlreadyLinked = Boolean(
      profile.jersey_number || 
      (profile.position && profile.position !== 'Médio Centro') ||
      profile.shirt_name ||
      profile.nif
    )

    if (isAlreadyLinked) return

    // Procurar correspondência nos dados do plantel por email, telefone ou nome estrito
    const userEmail = (user.email || profile.email || '').toLowerCase().trim()
    const userPhone = (profile.phone || '').trim().replace(/\D/g, '')
    const userName = (profile.name || '').toLowerCase().trim()

    let match: Partial<Profile> | undefined

    // 1. Correspondência exata por Email
    if (userEmail) {
      match = INITIAL_PLAYERS_DATA.find(p => p.email && p.email.toLowerCase().trim() === userEmail)
    }

    // 2. Correspondência exata por Telefone (se tiver pelo menos 9 dígitos)
    if (!match && userPhone && userPhone.length >= 9) {
      match = INITIAL_PLAYERS_DATA.find(p => {
        const pPhone = (p.phone || '').trim().replace(/\D/g, '')
        return pPhone.length >= 9 && pPhone === userPhone
      })
    }

    // 3. Correspondência estrita por Nome Completo (Primeiro + Último Nome)
    // Apenas se a ficha não pertencer explicitamente a outro email
    if (!match && userName && userName !== 'novo atleta' && userName !== 'novo jogador') {
      const uWords = userName.split(' ').filter(w => w.length > 2)

      match = INITIAL_PLAYERS_DATA.find(p => {
        const pEmail = (p.email || '').toLowerCase().trim()
        // Se a ficha já tiver outro email oficial atribuído, não associar por nome
        if (pEmail && userEmail && pEmail !== userEmail) return false

        const pName = (p.name || '').toLowerCase().trim()
        if (!pName) return false

        if (pName === userName) return true

        const pWords = pName.split(' ').filter(w => w.length > 2)
        if (uWords.length >= 2 && pWords.length >= 2) {
          const firstMatch = uWords[0] === pWords[0]
          const lastMatch = uWords[uWords.length - 1] === pWords[pWords.length - 1]
          return firstMatch && lastMatch
        }
        return false
      })
    }

    if (match) {
      setMatchedPlayer(match)
      setIsOpen(true)
    }
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
      const payload = {
        name: selectedTarget.name || profile.name,
        nickname: selectedTarget.nickname || profile.nickname,
        shirt_name: selectedTarget.shirt_name || selectedTarget.nickname || profile.shirt_name,
        phone: selectedTarget.phone || profile.phone,
        role: selectedTarget.role || profile.role || 'player',
        status: selectedTarget.status || profile.status || 'active',
        jersey_number: selectedTarget.jersey_number !== undefined ? selectedTarget.jersey_number : profile.jersey_number,
        kit_size: selectedTarget.kit_size || profile.kit_size,
        birth_date: selectedTarget.birth_date || profile.birth_date,
        nationality: selectedTarget.nationality || profile.nationality || 'Portuguesa',
        position: selectedTarget.position || profile.position || 'Médio Centro',
        address: selectedTarget.address || profile.address,
        postal_code: selectedTarget.postal_code || profile.postal_code,
        city: selectedTarget.city || profile.city,
        nif: selectedTarget.nif || profile.nif,
        id_number: selectedTarget.id_number || profile.id_number,
        id_card_expiry: selectedTarget.id_card_expiry || profile.id_card_expiry,
        iban: selectedTarget.iban || profile.iban,
        gdpr_consent: selectedTarget.gdpr_consent !== undefined ? selectedTarget.gdpr_consent : true,
        member_number: selectedTarget.member_number || profile.member_number,
      }

      // 1. Atualizar o perfil do utilizador autenticado
      const { error: updateErr } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)

      if (updateErr) throw updateErr

      // 2. Se existia uma ficha placeholder separada na BD com este email, transferir e limpar
      if (selectedTarget.email) {
        const { data: placeholder } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', selectedTarget.email)
          .neq('id', user.id)
          .maybeSingle()

        if (placeholder?.id) {
          await Promise.allSettled([
            supabase.from('callups').update({ player_id: user.id }).eq('player_id', placeholder.id),
            supabase.from('dues').update({ player_id: user.id }).eq('player_id', placeholder.id),
            supabase.from('profiles').delete().eq('id', placeholder.id),
          ])
        }
      }

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

  const filteredSquad = INITIAL_PLAYERS_DATA.filter(p => 
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
