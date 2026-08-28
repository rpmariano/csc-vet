import React, { useEffect, useState } from 'react'
import { 
  Users, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Phone, 
  Mail, 
  FileText, 
  Shield, 
  HeartPulse, 
  CheckCircle2, 
  XCircle, 
  X, 
  ExternalLink,
  Save,
  Link2,
  UserCheck,
  Sparkles,
  Check,
  LayoutGrid,
  List,
  ChevronRight
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth, extractRolesFromProfile, encodeRolesToNotes, cleanNotesFromRolesTag, formatDisplayName } from '../context/AuthContext'
import type { Profile, UserRole, ProfileStatus } from '../context/AuthContext'
import SoccerPitchSelector, { parsePositions } from '../components/SoccerPitchSelector'
import { INITIAL_PLAYERS_DATA } from '../data/initialPlayers'

const POSITIONS = [
  'Guarda-redes',
  'Defesa Central Esquerdo',
  'Defesa Central Direito',
  'Lateral Direito',
  'Lateral Esquerdo',
  'Médio Defensivo',
  'Médio Esquerdo',
  'Médio Direito',
  'Médio Ofensivo',
  'Ponta de Lança (Esq)',
  'Ponta de Lança (Dir)',
  'Ponta de Lança'
]

const TeamManagementPage: React.FC = () => {
  const { profile: currentUserProfile } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  // Filters, Search & View Mode
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProfileStatus>('all')
  const [positionFilter, setPositionFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    return (localStorage.getItem('csc_team_view_mode') as 'list' | 'cards') || 'list'
  })

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Form State - Expanded with PDF fields
  const [formId, setFormId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formNickname, setFormNickname] = useState('')
  const [formShirtName, setFormShirtName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRoles, setFormRoles] = useState<UserRole[]>(['player'])
  const [formStatus, setFormStatus] = useState<ProfileStatus>('active')
  const [formJerseyNumber, setFormJerseyNumber] = useState<number | ''>('')
  const [formKitSize, setFormKitSize] = useState('L')
  const [formBirthDate, setFormBirthDate] = useState('')
  const [formNationality, setFormNationality] = useState('Portuguesa')
  const [formPositions, setFormPositions] = useState<string[]>(['Médio Centro'])
  const [formAddress, setFormAddress] = useState('')
  const [formPostalCode, setFormPostalCode] = useState('')
  const [formCity, setFormCity] = useState('')
  const [formNif, setFormNif] = useState('')
  const [formIdNumber, setFormIdNumber] = useState('')
  const [formIdCardExpiry, setFormIdCardExpiry] = useState('')
  const [formIban, setFormIban] = useState('')
  const [formGdprConsent, setFormGdprConsent] = useState(true)
  const [formMemberNumber, setFormMemberNumber] = useState('')
  const [formEmergencyName, setFormEmergencyName] = useState('')
  const [formEmergencyPhone, setFormEmergencyPhone] = useState('')
  const [formMedicalNotes, setFormMedicalNotes] = useState('')
  const [isSyncingInitialData, setIsSyncingInitialData] = useState(false)

  // Upload URLs & Status
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null)
  const [insuranceDocUrl, setInsuranceDocUrl] = useState<string | null>(null)
  const [medicalExamDocUrl, setMedicalExamDocUrl] = useState<string | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)

  const isCoachOrAdmin = currentUserProfile && ['coach', 'admin'].includes(currentUserProfile.role)
  const isAdmin = currentUserProfile?.role === 'admin'

  const mergeProfilesWithSeedData = (remoteProfiles: Profile[]): Profile[] => {
    const emailMap = new Map<string, Profile>()

    // 1. Iniciar com todos os 31 atletas do plantel (dados do PDF)
    INITIAL_PLAYERS_DATA.forEach((seedPlayer, idx) => {
      const emailKey = (seedPlayer.email || `player-${idx}@csc.pt`).toLowerCase().trim()
      emailMap.set(emailKey, {
        ...seedPlayer,
        id: `seed-${idx}`,
      } as Profile)
    })

    // 2. Sobrepor perfis do Supabase (que têm UUIDs reais, fotos carregadas e edições mais recentes)
    remoteProfiles.forEach((remotePlayer) => {
      if (remotePlayer.email) {
        const emailKey = remotePlayer.email.toLowerCase().trim()
        const existing = emailMap.get(emailKey)
        emailMap.set(emailKey, {
          ...(existing || {}),
          ...remotePlayer,
        })
      } else {
        emailMap.set(remotePlayer.id, remotePlayer)
      }
    })

    return Array.from(emailMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }

  const fetchProfiles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        console.warn('Supabase query error, fallback to merged dataset:', error)
      }
      setProfiles(mergeProfilesWithSeedData((data as Profile[]) || []))
    } catch (err) {
      console.error(err)
      setProfiles(mergeProfilesWithSeedData([]))
    } finally {
      setLoading(false)
    }
  }

  const handleSyncInitialPlayers = async () => {
    if (!confirm('Deseja sincronizar e gravar todos os 31 atletas do PDF na base de dados Supabase?')) return
    setIsSyncingInitialData(true)
    try {
      // 1. Obter registos existentes por email para evitar conflitos
      const { data: existingData } = await supabase.from('profiles').select('id, email')
      const existingByEmail = new Map(
        (existingData || [])
          .filter(p => !!p.email)
          .map(p => [p.email.toLowerCase().trim(), p.id])
      )

      let countSuccess = 0
      for (const p of INITIAL_PLAYERS_DATA) {
        const emailKey = p.email.toLowerCase().trim()
        const payload = {
          ...p,
          medical_notes: encodeRolesToNotes(p.medical_notes, [p.role || 'player']),
        }
        const existingId = existingByEmail.get(emailKey)
        if (existingId) {
          const { error } = await supabase.from('profiles').update(payload).eq('id', existingId)
          if (!error) countSuccess++
        } else {
          const { error } = await supabase.from('profiles').insert([payload])
          if (!error) countSuccess++
        }
      }

      alert(`Sincronização concluída com sucesso! ${countSuccess} atletas processados na base de dados.`)
      await fetchProfiles()
    } catch (err: any) {
      alert('Erro na sincronização: ' + (err.message || 'Verifique a base de dados'))
    } finally {
      setIsSyncingInitialData(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  const calculateAge = (birthDateString?: string | null) => {
    if (!birthDateString) return null
    const birth = new Date(birthDateString)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const resetForm = () => {
    setFormId(null)
    setFormName('')
    setFormNickname('')
    setFormShirtName('')
    setFormEmail('')
    setFormPhone('')
    setFormRoles(['player'])
    setFormStatus('active')
    setFormJerseyNumber('')
    setFormKitSize('L')
    setFormBirthDate('')
    setFormNationality('Portuguesa')
    setFormPositions(['Médio Centro'])
    setFormAddress('')
    setFormPostalCode('')
    setFormCity('')
    setFormNif('')
    setFormIdNumber('')
    setFormIdCardExpiry('')
    setFormIban('')
    setFormGdprConsent(true)
    setFormMemberNumber('')
    setFormEmergencyName('')
    setFormEmergencyPhone('')
    setFormMedicalNotes('')
    setPhotoUrl(null)
    setIdDocUrl(null)
    setInsuranceDocUrl(null)
    setMedicalExamDocUrl(null)
    setIsEditing(false)
  }

  const openCreateModal = () => {
    resetForm()
    setIsFormModalOpen(true)
  }

  const openEditModal = (p: Profile) => {
    setFormId(p.id)
    setFormName(p.name || '')
    setFormNickname(p.nickname || '')
    setFormShirtName(p.shirt_name || p.nickname || '')
    setFormEmail(p.email || '')
    setFormPhone(p.phone || '')
    
    // Iniciar papéis atribuídos
    const roles = extractRolesFromProfile(p)
    setFormRoles(roles)

    setFormStatus(p.status || 'active')
    setFormJerseyNumber(p.jersey_number !== undefined && p.jersey_number !== null ? p.jersey_number : '')
    setFormKitSize(p.kit_size || 'L')
    setFormBirthDate(p.birth_date || '')
    setFormNationality(p.nationality || 'Portuguesa')
    setFormPositions(parsePositions(p.position))
    setFormAddress(p.address || '')
    setFormPostalCode(p.postal_code || '')
    setFormCity(p.city || '')
    setFormNif(p.nif || '')
    setFormIdNumber(p.id_number || '')
    setFormIdCardExpiry(p.id_card_expiry || '')
    setFormIban(p.iban || '')
    setFormGdprConsent(p.gdpr_consent !== false)
    setFormMemberNumber(p.member_number || '')
    setFormEmergencyName(p.emergency_contact_name || '')
    setFormEmergencyPhone(p.emergency_contact_phone || '')
    setFormMedicalNotes(cleanNotesFromRolesTag(p.medical_notes) || '')
    setPhotoUrl(p.photo_url || null)
    setIdDocUrl(p.id_document_url || null)
    setInsuranceDocUrl(p.insurance_doc_url || null)
    setMedicalExamDocUrl(p.medical_exam_doc_url || null)
    setIsEditing(true)
    setIsFormModalOpen(true)
  }

  const openDetailModal = (p: Profile) => {
    setSelectedProfile(p)
    setIsDetailModalOpen(true)
  }

  // Upload handler for document/photo fields
  const handleUploadFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'photo' | 'idDoc' | 'insurance' | 'medical'
  ) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    const ext = file.name.split('.').pop()
    const fileName = `member_${field}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`
    
    try {
      setUploadingDoc(field)
      const { error: uploadErr } = await supabase.storage
        .from('club_assets')
        .upload(fileName, file, { upsert: true })

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('club_assets')
        .getPublicUrl(fileName)

      if (field === 'photo') setPhotoUrl(publicUrl)
      if (field === 'idDoc') setIdDocUrl(publicUrl)
      if (field === 'insurance') setInsuranceDocUrl(publicUrl)
      if (field === 'medical') setMedicalExamDocUrl(publicUrl)

      alert('Ficheiro carregado com sucesso!')
    } catch (err: any) {
      alert('Erro ao carregar ficheiro: ' + err.message)
    } finally {
      setUploadingDoc(null)
    }
  }

  const toggleRole = (r: UserRole) => {
    if (formRoles.includes(r)) {
      if (formRoles.length > 1) {
        setFormRoles(formRoles.filter(item => item !== r))
      }
    } else {
      setFormRoles([...formRoles, r])
    }
  }

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName || !formEmail) {
      alert('Nome e Email são obrigatórios.')
      return
    }

    const primaryRole: UserRole = formRoles.includes('admin') 
      ? 'admin' 
      : formRoles.includes('coach') 
      ? 'coach' 
      : 'player'

    const positionStr = formPositions.length > 0 ? formPositions.join(', ') : 'Médio Centro'
    const medicalNotesEncoded = encodeRolesToNotes(formMedicalNotes, formRoles)

    const payload = {
      name: formName,
      nickname: formNickname || formShirtName || null,
      shirt_name: formShirtName || formNickname || null,
      email: formEmail,
      phone: formPhone || null,
      role: primaryRole,
      status: formStatus,
      jersey_number: formJerseyNumber !== '' ? Number(formJerseyNumber) : null,
      kit_size: formKitSize || null,
      birth_date: formBirthDate || null,
      nationality: formNationality || null,
      position: positionStr,
      address: formAddress || null,
      postal_code: formPostalCode || null,
      city: formCity || null,
      nif: formNif || null,
      id_number: formIdNumber || null,
      id_card_expiry: formIdCardExpiry || null,
      iban: formIban || null,
      gdpr_consent: formGdprConsent,
      member_number: formMemberNumber || null,
      emergency_contact_name: formEmergencyName || null,
      emergency_contact_phone: formEmergencyPhone || null,
      medical_notes: medicalNotesEncoded,
      photo_url: photoUrl || null,
      id_document_url: idDocUrl || null,
      insurance_doc_url: insuranceDocUrl || null,
      medical_exam_doc_url: medicalExamDocUrl || null,
    }

    try {
      if (isEditing && formId && !formId.startsWith('seed-')) {
        const { error } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', formId)

        if (error) throw error
        alert('Ficha de membro atualizada!')
      } else {
        // Verificar se já existe perfil na BD com este email
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', formEmail)
          .maybeSingle()

        if (existing?.id) {
          const { error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', existing.id)
          if (error) throw error
          alert('Ficha de membro atualizada na base de dados!')
        } else {
          const { error } = await supabase
            .from('profiles')
            .insert([payload])
          if (error) throw error
          alert('Novo membro gravado com sucesso na base de dados!')
        }
      }

      setIsFormModalOpen(false)
      fetchProfiles()
    } catch (err: any) {
      alert('Erro ao gravar membro: ' + (err.message || 'Verifique a base de dados'))
    }
  }

  const handleDeleteMember = async (id: string, name: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar o membro "${name}"?`)) return
    try {
      if (id.startsWith('seed-')) {
        setProfiles(prev => prev.filter(p => p.id !== id))
      } else {
        const { error } = await supabase.from('profiles').delete().eq('id', id)
        if (error) throw error
        setProfiles(prev => prev.filter(p => p.id !== id))
      }
      if (selectedProfile?.id === id) setIsDetailModalOpen(false)
    } catch (err: any) {
      alert('Erro ao eliminar membro: ' + err.message)
    }
  }

  // --- USER ACCOUNT ASSOCIATION STATES & LOGIC ---
  const [associatingPlayer, setAssociatingPlayer] = useState<Profile | null>(null)
  const [associateSearchTerm, setAssociateSearchTerm] = useState('')
  const [selectedUserToAssociate, setSelectedUserToAssociate] = useState<Profile | null>(null)
  const [associatingLoading, setAssociatingLoading] = useState(false)

  const openAssociateModal = (p: Profile) => {
    setAssociatingPlayer(p)
    setAssociateSearchTerm('')
    setSelectedUserToAssociate(null)
  }

  const handleConfirmAssociate = async (sourcePlayer: Profile, targetUser: Profile) => {
    if (sourcePlayer.id === targetUser.id) {
      alert('Este jogador já está associado a esta conta.')
      return
    }

    if (!confirm(`Tem a certeza que deseja associar a conta de "${targetUser.email}" (${targetUser.name}) à ficha do jogador "${sourcePlayer.name}"?`)) {
      return
    }

    setAssociatingLoading(true)
    try {
      const targetUserId = targetUser.id
      const sourcePlayerId = sourcePlayer.id

      // 1. Atualizar referências de convocatórias e quotas para a conta destino
      await Promise.allSettled([
        supabase.from('callups').update({ player_id: targetUserId }).eq('player_id', sourcePlayerId),
        supabase.from('dues').update({ player_id: targetUserId }).eq('player_id', sourcePlayerId)
      ])

      // 2. Unificar campos no perfil de destino preservando dados da ficha
      const mergedPayload = {
        name: sourcePlayer.name || targetUser.name,
        nickname: sourcePlayer.nickname || targetUser.nickname,
        phone: sourcePlayer.phone || targetUser.phone,
        role: sourcePlayer.role || targetUser.role || 'player',
        status: sourcePlayer.status || targetUser.status || 'active',
        jersey_number: sourcePlayer.jersey_number !== undefined && sourcePlayer.jersey_number !== null ? sourcePlayer.jersey_number : targetUser.jersey_number,
        birth_date: sourcePlayer.birth_date || targetUser.birth_date,
        nationality: sourcePlayer.nationality || targetUser.nationality || 'Portuguesa',
        position: sourcePlayer.position || targetUser.position || 'Médio Centro',
        id_number: sourcePlayer.id_number || targetUser.id_number,
        member_number: sourcePlayer.member_number || targetUser.member_number,
        emergency_contact_name: sourcePlayer.emergency_contact_name || targetUser.emergency_contact_name,
        emergency_contact_phone: sourcePlayer.emergency_contact_phone || targetUser.emergency_contact_phone,
        medical_notes: sourcePlayer.medical_notes || targetUser.medical_notes,
        photo_url: sourcePlayer.photo_url || targetUser.photo_url,
        id_document_url: sourcePlayer.id_document_url || targetUser.id_document_url,
        insurance_doc_url: sourcePlayer.insurance_doc_url || targetUser.insurance_doc_url,
        medical_exam_doc_url: sourcePlayer.medical_exam_doc_url || targetUser.medical_exam_doc_url
      }

      // 3. Atualizar o perfil de destino
      const { error: updateError } = await supabase
        .from('profiles')
        .update(mergedPayload)
        .eq('id', targetUserId)

      if (updateError) throw updateError

      // 4. Eliminar o registo placeholder original se for um perfil separado
      await supabase.from('profiles').delete().eq('id', sourcePlayerId)

      alert(`Jogador "${sourcePlayer.name}" associado com sucesso à conta "${targetUser.email}"!`)
      setAssociatingPlayer(null)
      setSelectedUserToAssociate(null)
      if (selectedProfile?.id === sourcePlayerId) {
        setIsDetailModalOpen(false)
      }
      fetchProfiles()
    } catch (err: any) {
      alert('Erro ao associar utilizador: ' + (err.message || 'Verifique a base de dados'))
    } finally {
      setAssociatingLoading(false)
    }
  }

  // Procura de sugestões inteligentes de associação
  const associationSuggestions = React.useMemo(() => {
    const registeredUsersWithoutKit = profiles.filter(p => !p.id.startsWith('seed-') && (!p.jersey_number || !p.kit_size))
    const unlinkedSquadProfiles = profiles.filter(p => p.id.startsWith('seed-'))

    const suggestions: { user: Profile; player: Profile }[] = []

    registeredUsersWithoutKit.forEach(userP => {
      const uEmail = (userP.email || '').toLowerCase().trim()
      const uPhone = (userP.phone || '').trim()
      const uName = (userP.name || '').toLowerCase().trim()

      const match = unlinkedSquadProfiles.find(squadP => {
        const sEmail = (squadP.email || '').toLowerCase().trim()
        const sPhone = (squadP.phone || '').trim()
        const sName = (squadP.name || '').toLowerCase().trim()
        const sNick = (squadP.nickname || '').toLowerCase().trim()

        return (
          (uEmail && sEmail && uEmail === sEmail) ||
          (uPhone && sPhone && uPhone === sPhone) ||
          (uName && sName && (uName.includes(sName) || sName.includes(uName))) ||
          (uName && sNick && uName.includes(sNick))
        )
      })

      if (match) {
        suggestions.push({ user: userP, player: match })
      }
    })

    return suggestions
  }, [profiles])

  // Filtered list
  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = 
      (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.nickname && p.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.position && p.position.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.jersey_number && p.jersey_number.toString().includes(searchTerm))

    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    const matchesPosition = positionFilter === 'all' || p.position === positionFilter

    return matchesSearch && matchesStatus && matchesPosition
  })

  // Quick Metrics
  const totalCount = profiles.length
  const activeCount = profiles.filter(p => p.status === 'active').length
  const injuredCount = profiles.filter(p => p.status === 'injured').length
  const inactiveCount = profiles.filter(p => p.status === 'inactive').length

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-csc-dark flex items-center gap-2.5">
            <Users size={32} />
            <span>Gestão do Plantel & Membros</span>
          </h1>
          <p className="text-gray-550 mt-1 text-sm">
            Fichas completas dos atletas, dados fiscais, moradas, IBAN, equipamento, contactos de emergência e documentos.
          </p>
        </div>

        {isCoachOrAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSyncInitialPlayers}
              disabled={isSyncingInitialData}
              className="flex items-center space-x-2 bg-csc-gold text-csc-dark border border-amber-300 px-3.5 py-2.5 rounded-xl font-black hover:bg-amber-400 transition-colors shadow-xs shrink-0 text-xs cursor-pointer active:scale-95"
              title="Importar e sincronizar os 31 jogadores do documento PDF com a base de dados"
            >
              <Sparkles size={15} />
              <span>{isSyncingInitialData ? 'A sincronizar...' : 'Sincronizar Plantel (PDF)'}</span>
            </button>

            <button
              onClick={openCreateModal}
              className="flex items-center space-x-2 bg-csc-dark text-white px-4 py-2.5 rounded-xl font-bold hover:bg-csc-dark/80 transition-colors shadow-md shrink-0 text-xs sm:text-sm cursor-pointer active:scale-95"
            >
              <Plus size={18} />
              <span>Adicionar Membro</span>
            </button>
          </div>
        )}
      </div>

      {/* Banner de Sugestões Inteligentes de Associação para Treinadores/Admins */}
      {isCoachOrAdmin && associationSuggestions.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-emerald-500/10 border-2 border-amber-300 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-600 animate-pulse" />
              <h3 className="text-sm font-black text-gray-900">
                Sugestões de Associação Automática ({associationSuggestions.length} conta{associationSuggestions.length > 1 ? 's' : ''} detetada{associationSuggestions.length > 1 ? 's' : ''})
              </h3>
            </div>
            <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full">
              Smart Link
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {associationSuggestions.map(({ user: u, player: pl }, idx) => (
              <div key={idx} className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-gray-900 truncate">
                    👤 Conta: {u.name} <span className="text-gray-400 font-normal">({u.email})</span>
                  </p>
                  <p className="text-[11px] text-amber-900 font-bold truncate mt-0.5">
                    ⚽ Ficha: #{pl.jersey_number} {pl.name} {pl.nickname ? `"${pl.nickname}"` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={associatingLoading}
                  onClick={() => handleConfirmAssociate(pl, u)}
                  className="px-3 py-1.5 bg-csc-dark hover:bg-csc-dark/85 text-white text-xs font-black rounded-lg shrink-0 shadow-xs cursor-pointer active:scale-95 flex items-center gap-1"
                >
                  <Link2 size={13} />
                  <span>Associar</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border border-gray-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 font-bold">
            {totalCount}
          </div>
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase">Total Plantel</p>
            <p className="text-sm font-extrabold text-gray-850">Membros</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-green-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-700 font-bold">
            {activeCount}
          </div>
          <div>
            <p className="text-xs text-green-700 font-semibold uppercase">Disponíveis</p>
            <p className="text-sm font-extrabold text-green-800">Ativos</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-red-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-700 font-bold">
            {injuredCount}
          </div>
          <div>
            <p className="text-xs text-red-700 font-semibold uppercase">Departamento Médico</p>
            <p className="text-sm font-extrabold text-red-800">Lesionados</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
            {inactiveCount}
          </div>
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase">Indisponíveis</p>
            <p className="text-sm font-extrabold text-gray-700">Inativos</p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, alcunha, posição ou nº camisola..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark"
            />
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-700"
            >
              <option value="all">Todos os Estados</option>
              <option value="active">🟢 Ativos</option>
              <option value="injured">🔴 Lesionados</option>
              <option value="inactive">⚪ Inativos</option>
            </select>

            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-700 max-w-[180px]"
            >
              <option value="all">Todas as Posições</option>
              {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>

            {/* Alternador Duplo de Vista (Hipótese 1: Lista vs Hipótese 3: Cartas) */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => {
                  setViewMode('list')
                  localStorage.setItem('csc_team_view_mode', 'list')
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-csc-dark shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Vista em Lista Compacta (Estilo Sofascore)"
              >
                <List size={15} />
                <span className="hidden sm:inline">Lista</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('cards')
                  localStorage.setItem('csc_team_view_mode', 'cards')
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-csc-dark shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Vista em Cartas de Futebol (Estilo FUT)"
              >
                <LayoutGrid size={15} />
                <span className="hidden sm:inline">Cartas</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profiles View */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="font-bold text-gray-700 text-lg">Nenhum atleta encontrado</p>
          <p className="text-xs text-gray-500 mt-1">Ajuste os filtros de pesquisa ou adicione um novo membro.</p>
        </div>
      ) : viewMode === 'list' ? (
        /* VISTA 1: LISTA MODERNA & ELEGANTE (Mobile-first) */
        <div className="space-y-2.5">
          {filteredProfiles.map((person) => {
            const age = calculateAge(person.birth_date)
            const positions = parsePositions(person.position)
            const roles = extractRolesFromProfile(person)

            return (
              <div
                key={person.id}
                onClick={() => openDetailModal(person)}
                className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all p-3.5 sm:p-4 cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Top/Main Section: Jersey Number + Photo + Name + Positions */}
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Photo with Number Overlay */}
                  <div className="relative shrink-0">
                    {person.photo_url ? (
                      <img
                        src={person.photo_url}
                        alt={person.name}
                        className="w-13 h-13 rounded-2xl object-cover border-2 border-csc-dark/10 shadow-xs group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-csc-dark to-emerald-900 text-white flex items-center justify-center font-black text-lg shadow-xs group-hover:scale-105 transition-transform">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Jersey Badge Pin */}
                    {person.jersey_number ? (
                      <span className="absolute -bottom-1.5 -right-1.5 bg-csc-dark text-csc-gold font-black text-[11px] px-1.5 py-0.2 rounded-md border-2 border-white shadow-xs">
                        #{person.jersey_number}
                      </span>
                    ) : null}
                  </div>

                  {/* Name + Positions + Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-gray-900 text-sm sm:text-base leading-tight group-hover:text-csc-dark transition-colors">
                        {formatDisplayName(person.name, person.nickname || person.shirt_name)}
                      </h3>

                      {/* Role Badges */}
                      {roles.map((r) => (
                        <span
                          key={r}
                          className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${
                            r === 'admin'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : r === 'coach'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {r === 'admin' ? '🛡️ Admin' : r === 'coach' ? '📋 Treinador' : '⚽ Jogador'}
                        </span>
                      ))}
                    </div>

                    {/* Subtitle: Positions + Info */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
                      {positions.map((pos, idx) => (
                        <span
                          key={idx}
                          className="bg-amber-50/90 text-amber-900 border border-amber-200/80 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-2xs"
                        >
                          {pos}
                        </span>
                      ))}

                      {person.kit_size && (
                        <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                          Tam: {person.kit_size}
                        </span>
                      )}

                      {person.member_number && (
                        <span className="text-[10px] text-gray-400 font-medium hidden sm:inline">
                          • Sócio nº {person.member_number}
                        </span>
                      )}

                      {age && (
                        <span className="text-[10px] text-gray-400 font-medium">
                          • {age} anos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right / Bottom Action Bar */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                  {/* Status Indicator */}
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-2xs ${
                    person.status === 'active' ? 'bg-green-100 text-green-800 border border-green-200' :
                    person.status === 'injured' ? 'bg-red-100 text-red-800 border border-red-200 animate-pulse' :
                    'bg-gray-100 text-gray-600 border border-gray-200'
                  }`}>
                    {person.status === 'active' ? <CheckCircle2 size={11}/> :
                     person.status === 'injured' ? <HeartPulse size={11}/> :
                     <XCircle size={11}/>}
                    <span>{person.status === 'active' ? 'Ativo' : person.status === 'injured' ? 'Lesionado' : 'Inativo'}</span>
                  </span>

                  {/* Actions for Coach / Admin */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isCoachOrAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openAssociateModal(person)
                          }}
                          className="p-1.5 text-blue-600 hover:text-blue-800 rounded-lg hover:bg-blue-50 transition-colors"
                          title="Associar a Utilizador"
                        >
                          <Link2 size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditModal(person)
                          }}
                          className="p-1.5 text-gray-500 hover:text-csc-dark rounded-lg hover:bg-gray-100 transition-colors"
                          title="Editar Ficha"
                        >
                          <Edit2 size={15} />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteMember(person.id, person.name)
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="Eliminar Membro"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </>
                    )}

                    <ChevronRight size={16} className="text-gray-300 group-hover:text-csc-dark group-hover:translate-x-0.5 transition-all ml-1" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* VISTA 3: CARTAS VERTICAIS ESTILO FUT / TRADING CARDS */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProfiles.map((person) => {
            const age = calculateAge(person.birth_date)

            return (
              <div
                key={person.id}
                onClick={() => openDetailModal(person)}
                className={`bg-white rounded-2xl shadow-sm border-2 transition-all duration-200 hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col justify-between overflow-hidden group relative ${
                  person.status === 'injured'
                    ? 'border-red-300 ring-2 ring-red-100'
                    : 'border-amber-200 hover:border-csc-gold'
                }`}
              >
                {/* Top Card Gradient Background Accent */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-csc-dark/10 to-transparent pointer-events-none" />

                <div className="p-4 relative z-10 flex flex-col items-center text-center space-y-3">
                  {/* Top Bar: Number left, Status right */}
                  <div className="w-full flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl font-black text-csc-dark tracking-tighter">
                        {person.jersey_number ? `#${person.jersey_number}` : '-'}
                      </span>
                    </div>

                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                      person.status === 'active' ? 'bg-green-100 text-green-800' :
                      person.status === 'injured' ? 'bg-red-100 text-red-800 animate-pulse' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {person.status === 'active' ? <CheckCircle2 size={10}/> :
                       person.status === 'injured' ? <HeartPulse size={10}/> :
                       <XCircle size={10}/>}
                      {person.status === 'active' ? 'Ativo' :
                       person.status === 'injured' ? 'Lesionado' : 'Inativo'}
                    </span>
                  </div>

                  {/* Centered Large Photo */}
                  <div className="relative my-1">
                    {person.photo_url ? (
                      <img
                        src={person.photo_url}
                        alt={person.name}
                        className="w-20 h-20 rounded-2xl object-cover border-2 border-csc-gold shadow-md group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-csc-dark to-csc-light text-white flex items-center justify-center font-black text-2xl shadow-md border-2 border-csc-gold group-hover:scale-105 transition-transform">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Name with embedded nickname */}
                  <div className="w-full">
                    <h3 className="font-black text-gray-900 text-base leading-tight truncate group-hover:text-csc-dark transition-colors">
                      {formatDisplayName(person.name, person.nickname || person.shirt_name)}
                    </h3>

                    {/* Positions Ribbon */}
                    <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                      {parsePositions(person.position).map((pos, idx) => (
                        <span
                          key={idx}
                          className="bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-2xs"
                        >
                          {pos}
                        </span>
                      ))}
                    </div>

                    {/* Role Badges */}
                    <div className="flex flex-wrap justify-center gap-1 mt-2">
                      {extractRolesFromProfile(person).map((r) => (
                        <span
                          key={r}
                          className={`text-[9px] font-black px-2 py-0.5 rounded border ${
                            r === 'admin'
                              ? 'bg-csc-gold text-csc-dark border-amber-300'
                              : r === 'coach'
                              ? 'bg-blue-500 text-white border-blue-600'
                              : 'bg-emerald-700 text-white border-emerald-800'
                          }`}
                        >
                          {r === 'admin' ? '🛡️ Admin' : r === 'coach' ? '📋 Treinador' : '⚽ Jogador'}
                        </span>
                      ))}
                    </div>

                    {/* Member & Age Info */}
                    <p className="text-[10px] text-gray-400 font-semibold mt-1">
                      {person.kit_size ? `Tam: ${person.kit_size} • ` : ''}{person.member_number ? `Sócio nº ${person.member_number}` : ''} {age ? `• ${age} anos` : ''}
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="bg-gray-50 px-3.5 py-2.5 border-t border-gray-150 flex items-center justify-between text-xs">
                  <span className="text-xs font-black text-csc-dark group-hover:underline flex items-center gap-1">
                    Ver Ficha Completa
                  </span>

                  {isCoachOrAdmin && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openAssociateModal(person)
                        }}
                        className="p-1.5 text-blue-600 hover:text-blue-800 rounded-lg hover:bg-blue-50 transition-colors"
                        title="Associar a Utilizador"
                      >
                        <Link2 size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditModal(person)
                        }}
                        className="p-1.5 text-gray-500 hover:text-csc-dark rounded-lg hover:bg-white transition-colors"
                        title="Editar Ficha"
                      >
                        <Edit2 size={14} />
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteMember(person.id, person.name)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors"
                          title="Eliminar Membro"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL 1: CRIAR / EDITAR FICHA DE MEMBRO */}
      {isFormModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl">
            <button
              onClick={() => setIsFormModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1"
            >
              <X size={22} />
            </button>

            <h2 className="text-2xl font-black text-csc-dark mb-1">
              {isEditing ? 'Editar Ficha do Membro' : 'Criar Ficha de Novo Membro'}
            </h2>
            <p className="text-xs text-gray-500 mb-6">
              Preencha os dados cadastrais, fiscais, morada, equipamento, contactos e anexe a documentação legal.
            </p>

            <form onSubmit={handleSaveMember} className="space-y-6">
              
              {/* 1. DADOS PESSOAIS & IDENTIFICAÇÃO FISCAL */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} className="text-csc-dark" />
                  <span>1. Identificação Pessoal & Fiscal</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Ex: André Gomes Marques do Couto"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nome na Camisola / Alcunha</label>
                    <input
                      type="text"
                      value={formShirtName || formNickname}
                      onChange={(e) => {
                        setFormShirtName(e.target.value)
                        setFormNickname(e.target.value)
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Ex: A. COUTO / Tochê"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Data de Nascimento</label>
                    <input
                      type="date"
                      value={formBirthDate}
                      onChange={(e) => setFormBirthDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nacionalidade</label>
                    <input
                      type="text"
                      value={formNationality}
                      onChange={(e) => setFormNationality(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Portuguesa"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nº de Contribuinte (NIF)</label>
                    <input
                      type="text"
                      value={formNif}
                      onChange={(e) => setFormNif(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="228649129"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nº Cartão de Cidadão / Passaporte</label>
                    <input
                      type="text"
                      value={formIdNumber}
                      onChange={(e) => setFormIdNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="11960727"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Validade do Cartão de Cidadão</label>
                    <input
                      type="date"
                      value={formIdCardExpiry}
                      onChange={(e) => setFormIdCardExpiry(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 2. MORADA & RESIDÊNCIA */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-dark" />
                  <span>2. Morada & Residência</span>
                </h3>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Morada (Rua, Nº e Andar)</label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    placeholder="Rua Serra da Arrábida, LT 1263, 3 Esq."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Código Postal</label>
                    <input
                      type="text"
                      value={formPostalCode}
                      onChange={(e) => setFormPostalCode(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="2975-164"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Localidade</label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Cascais / Alcabideche"
                    />
                  </div>
                </div>
              </div>

              {/* 3. CONTACTOS */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={14} className="text-csc-dark" />
                  <span>3. Contactos</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="atleta@clube.pt"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Telemóvel</label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="912 345 678"
                    />
                  </div>
                </div>
              </div>

              {/* 4. DADOS DESPORTIVOS, EQUIPAMENTO & PAPEL */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Shield size={14} className="text-csc-dark" />
                    <span>4. Dados Desportivos, Equipamento & Função</span>
                  </span>
                  <span className="text-[10px] text-gray-400 font-bold">Múltiplas posições e papéis permitidos</span>
                </h3>

                {/* 4.1 Campo de Futebol Interativo */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Posições no Campo:
                  </label>
                  <SoccerPitchSelector
                    selectedPositions={formPositions}
                    onChange={setFormPositions}
                  />
                </div>

                {/* 4.2 Papéis no Sistema (1, 2 ou 3 funções) */}
                <div className="pt-2 border-t border-gray-200">
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    Papel / Funções no Sistema (Selecione 1, 2 ou 3):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Jogador */}
                    <button
                      type="button"
                      onClick={() => toggleRole('player')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        formRoles.includes('player')
                          ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400/50 shadow-xs'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-base">⚽</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('player') ? 'bg-emerald-600 text-white' : 'border border-gray-300'
                        }`}>
                          {formRoles.includes('player') && <Check size={12} className="stroke-[3]" />}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-gray-900">Jogador</span>
                      <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">Atleta nas convocatórias e estatísticas</span>
                    </button>

                    {/* Treinador */}
                    <button
                      type="button"
                      onClick={() => toggleRole('coach')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        formRoles.includes('coach')
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-400/50 shadow-xs'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-base">📋</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('coach') ? 'bg-blue-600 text-white' : 'border border-gray-300'
                        }`}>
                          {formRoles.includes('coach') && <Check size={12} className="stroke-[3]" />}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-gray-900">Treinador</span>
                      <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">Equipa técnica, criação de treinos e jogos</span>
                    </button>

                    {/* Administrador / Direção */}
                    <button
                      type="button"
                      onClick={() => toggleRole('admin')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        formRoles.includes('admin')
                          ? 'bg-amber-50 border-csc-gold ring-2 ring-csc-gold/50 shadow-xs'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-base">🛡️</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('admin') ? 'bg-csc-dark text-csc-gold' : 'border border-gray-300'
                        }`}>
                          {formRoles.includes('admin') && <Check size={12} className="stroke-[3]" />}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-gray-900">Administrador / Direção</span>
                      <span className="text-[10px] text-gray-500 mt-0.5 leading-tight">Acesso total, finanças e administração app</span>
                    </button>
                  </div>
                </div>

                {/* 4.3 Camisola, Tamanho de Equipamento & Estado */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-200">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nº da Camisola</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={formJerseyNumber}
                      onChange={(e) => setFormJerseyNumber(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Ex: 10"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Tamanho Equipamento</label>
                    <select
                      value={formKitSize}
                      onChange={(e) => setFormKitSize(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-bold"
                    >
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Estado de Atividade</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as ProfileStatus)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-semibold"
                    >
                      <option value="active">🟢 Ativo / Disponível</option>
                      <option value="injured">🔴 Lesionado (Dep. Médico)</option>
                      <option value="inactive">⚪ Inativo / Indisponível</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 5. DADOS BANCÁRIOS & QUOTAS */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={14} className="text-csc-dark" />
                  <span>5. Dados Bancários & Quotas</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">IBAN (Débito Direto / Quotas)</label>
                    <input
                      type="text"
                      value={formIban}
                      onChange={(e) => setFormIban(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-mono"
                      placeholder="PT50 0000 0000 0000 0000 0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nº de Sócio do Clube</label>
                    <input
                      type="text"
                      value={formMemberNumber}
                      onChange={(e) => setFormMemberNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Ex: 1420"
                    />
                  </div>
                </div>
              </div>

              {/* 6. SAÚDE & EMERGÊNCIA */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <HeartPulse size={14} className="text-red-600" />
                  <span>6. Saúde & Contacto de Emergência</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Contacto de Emergência (Nome / Relação)</label>
                    <input
                      type="text"
                      value={formEmergencyName}
                      onChange={(e) => setFormEmergencyName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Ex: Maria (Esposa)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Telefone de Emergência</label>
                    <input
                      type="tel"
                      value={formEmergencyPhone}
                      onChange={(e) => setFormEmergencyPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="960 000 000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Notas Médicas / Alergias / Tipo Sanguíneo</label>
                  <textarea
                    value={formMedicalNotes}
                    onChange={(e) => setFormMedicalNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    placeholder="Ex: Alergia a anti-inflamatórios, Tipo O+, histórico de lesão no joelho direito..."
                  />
                </div>
              </div>

              {/* 7. UPLOAD DE DOCUMENTOS & RGPD */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-dark" />
                  <span>7. Documentos & Proteção de Dados (RGPD)</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Foto de Perfil */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-gray-800">Fotografia de Perfil</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleUploadFile(e, 'photo')}
                      disabled={uploadingDoc === 'photo'}
                      className="text-xs w-full"
                    />
                    {photoUrl && (
                      <div className="flex items-center gap-2 pt-1">
                        <img src={photoUrl} alt="Preview" className="w-8 h-8 rounded-full object-cover" />
                        <span className="text-[11px] text-green-700 font-bold">✓ Foto anexada</span>
                      </div>
                    )}
                  </div>

                  {/* Documento de Identificação */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-gray-800">Doc. Identificação (CC / Passaporte)</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleUploadFile(e, 'idDoc')}
                      disabled={uploadingDoc === 'idDoc'}
                      className="text-xs w-full"
                    />
                    {idDocUrl && (
                      <a href={idDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 font-bold hover:underline flex items-center gap-1">
                        <ExternalLink size={11} /> Ver Documento CC anexado
                      </a>
                    )}
                  </div>

                  {/* Seguro Desportivo */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-gray-800">Apólice de Seguro Desportivo</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleUploadFile(e, 'insurance')}
                      disabled={uploadingDoc === 'insurance'}
                      className="text-xs w-full"
                    />
                    {insuranceDocUrl && (
                      <a href={insuranceDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-purple-700 font-bold hover:underline flex items-center gap-1">
                        <ExternalLink size={11} /> Ver Seguro anexado
                      </a>
                    )}
                  </div>

                  {/* Atestado Médico */}
                  <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-gray-800">Atestado / Exame Médico Desportivo</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => handleUploadFile(e, 'medical')}
                      disabled={uploadingDoc === 'medical'}
                      className="text-xs w-full"
                    />
                    {medicalExamDocUrl && (
                      <a href={medicalExamDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1">
                        <ExternalLink size={11} /> Ver Atestado anexado
                      </a>
                    )}
                  </div>
                </div>

                {/* Consentimento RGPD */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="gdpr_consent"
                    checked={formGdprConsent}
                    onChange={(e) => setFormGdprConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-csc-dark rounded border-gray-300 focus:ring-csc-dark"
                  />
                  <label htmlFor="gdpr_consent" className="text-xs text-gray-700 font-medium cursor-pointer">
                    Aceita que os seus dados sejam processados pela política de proteção de dados (RGPD) do Grupo Dramático e Sportivo de Cascais.
                  </label>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingDoc !== null}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-csc-dark hover:bg-csc-dark/80 transition-colors shadow-md text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save size={16} />
                  <span>{isEditing ? 'Guardar Alterações' : 'Criar Membro'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DETALHES COMPLETOS DA FICHA DE ATLETA (DOSSIER) */}
      {isDetailModalOpen && selectedProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
            >
              <X size={22} />
            </button>

            {/* Profile Header */}
            <div className="flex items-center gap-4 border-b pb-5">
              {selectedProfile.photo_url ? (
                <img
                  src={selectedProfile.photo_url}
                  alt={selectedProfile.name}
                  className="w-18 h-18 rounded-2xl object-cover border-2 border-csc-dark shadow-md"
                />
              ) : (
                <div className="w-18 h-18 rounded-2xl bg-csc-dark text-white flex items-center justify-center font-black text-2xl shadow-md">
                  {selectedProfile.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black text-gray-900 truncate">
                    {formatDisplayName(selectedProfile.name, selectedProfile.nickname || selectedProfile.shirt_name)}
                  </h2>
                  {selectedProfile.jersey_number && (
                    <span className="bg-csc-dark text-white text-xs font-black px-2 py-0.5 rounded">
                      #{selectedProfile.jersey_number}
                    </span>
                  )}
                  {selectedProfile.kit_size && (
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded">
                      Tam: {selectedProfile.kit_size}
                    </span>
                  )}
                </div>

                {/* Role Badges */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {extractRolesFromProfile(selectedProfile).map((r) => (
                    <span
                      key={r}
                      className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                        r === 'admin'
                          ? 'bg-csc-gold text-csc-dark border-amber-300'
                          : r === 'coach'
                          ? 'bg-blue-500 text-white border-blue-600'
                          : 'bg-emerald-700 text-white border-emerald-800'
                      }`}
                    >
                      {r === 'admin' ? '🛡️ Administrador / Direção' : r === 'coach' ? '📋 Treinador' : '⚽ Jogador'}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {parsePositions(selectedProfile.position).map((pos, idx) => (
                    <span key={idx} className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                      {pos}
                    </span>
                  ))}
                  <span className="text-gray-300">•</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    selectedProfile.status === 'active' ? 'bg-green-100 text-green-800' :
                    selectedProfile.status === 'injured' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {selectedProfile.status === 'active' ? 'Ativo' :
                     selectedProfile.status === 'injured' ? 'Lesionado' : 'Inativo'}
                  </span>
                </div>
              </div>
            </div>

            {/* Campo Tático com as posições do atleta destacadas */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <Shield size={14} className="text-csc-dark" />
                <span>Posicionamento no Campo</span>
              </h4>
              <SoccerPitchSelector
                selectedPositions={parsePositions(selectedProfile.position)}
                onChange={() => {}}
                readOnly={true}
              />
            </div>

            {/* 1. Dados Pessoais & Fiscais */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={14} className="text-csc-dark" />
                <span>Identificação & Dados Fiscais</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                <div>
                  <p className="text-gray-400 font-bold uppercase text-[10px]">NIF / Contribuinte</p>
                  <p className="font-extrabold text-gray-800 mt-0.5">{selectedProfile.nif || 'Não registado'}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-bold uppercase text-[10px]">Nº CC / Passaporte</p>
                  <p className="font-extrabold text-gray-800 mt-0.5">{selectedProfile.id_number || 'Não registado'}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-bold uppercase text-[10px]">Validade do CC</p>
                  <p className="font-extrabold text-gray-800 mt-0.5">
                    {selectedProfile.id_card_expiry ? new Date(selectedProfile.id_card_expiry).toLocaleDateString('pt-PT') : 'Não registada'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 font-bold uppercase text-[10px]">Idade / Nascimento</p>
                  <p className="font-extrabold text-gray-800 mt-0.5">
                    {selectedProfile.birth_date ? (
                      `${calculateAge(selectedProfile.birth_date)} anos (${new Date(selectedProfile.birth_date).toLocaleDateString('pt-PT')})`
                    ) : 'Não registada'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 font-bold uppercase text-[10px]">Nacionalidade</p>
                  <p className="font-extrabold text-gray-800 mt-0.5">{selectedProfile.nationality || 'Portuguesa'}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-bold uppercase text-[10px]">Nº de Sócio</p>
                  <p className="font-extrabold text-gray-800 mt-0.5">{selectedProfile.member_number || 'Não atribuído'}</p>
                </div>
              </div>
            </div>

            {/* 2. Morada & Residência */}
            {(selectedProfile.address || selectedProfile.city) && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-dark" />
                  <span>Morada & Residência</span>
                </h4>
                <div className="text-xs bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-1">
                  {selectedProfile.address && (
                    <p className="font-semibold text-gray-800">{selectedProfile.address}</p>
                  )}
                  {(selectedProfile.postal_code || selectedProfile.city) && (
                    <p className="text-gray-500 font-medium">
                      {selectedProfile.postal_code} {selectedProfile.city ? `• ${selectedProfile.city}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 3. Dados Bancários */}
            {selectedProfile.iban && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={14} className="text-csc-dark" />
                  <span>Dados Bancários (Débito Direto)</span>
                </h4>
                <div className="text-xs bg-gray-50 p-3 rounded-xl border border-gray-200 font-mono text-gray-800 font-bold">
                  {selectedProfile.iban}
                </div>
              </div>
            )}

            {/* 4. Contactos */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Contactos</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <a href={`tel:${selectedProfile.phone}`} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 font-semibold text-gray-800">
                  <Phone size={14} className="text-csc-dark" />
                  <span>{selectedProfile.phone || 'Sem telefone'}</span>
                </a>
                <a href={`mailto:${selectedProfile.email}`} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 font-semibold text-gray-800 truncate">
                  <Mail size={14} className="text-csc-dark" />
                  <span className="truncate">{selectedProfile.email}</span>
                </a>
              </div>
            </div>

            {/* 5. Saúde & Emergência */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <HeartPulse size={14} className="text-red-600" />
                <span>Saúde & Contacto de Emergência</span>
              </h4>
              <div className="p-3 bg-red-50/60 border border-red-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-semibold">Contacto Emergência:</span>
                  <span className="font-bold text-gray-900">
                    {selectedProfile.emergency_contact_name || 'Nenhum'} 
                    {selectedProfile.emergency_contact_phone ? ` (${selectedProfile.emergency_contact_phone})` : ''}
                  </span>
                </div>
                {cleanNotesFromRolesTag(selectedProfile.medical_notes) && (
                  <div className="pt-2 border-t border-red-200/60">
                    <span className="text-gray-600 font-semibold block mb-0.5">Notas Médicas:</span>
                    <p className="text-gray-800 font-medium">{cleanNotesFromRolesTag(selectedProfile.medical_notes)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 6. Documentos Anexados & RGPD */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-dark" />
                  <span>Documentação & RGPD</span>
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 flex items-center gap-1">
                  <CheckCircle2 size={11} /> RGPD Aceite
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {selectedProfile.id_document_url ? (
                  <a
                    href={selectedProfile.id_document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-blue-700 font-bold hover:bg-blue-100 transition-colors text-center"
                  >
                    <FileText size={18} />
                    <span>Doc. Identificação</span>
                    <span className="text-[10px] underline flex items-center gap-0.5">Abrir <ExternalLink size={10}/></span>
                  </a>
                ) : (
                  <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 text-center">
                    <FileText size={18} />
                    <span>Sem CC anexado</span>
                  </div>
                )}

                {selectedProfile.insurance_doc_url ? (
                  <a
                    href={selectedProfile.insurance_doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-purple-700 font-bold hover:bg-purple-100 transition-colors text-center"
                  >
                    <Shield size={18} />
                    <span>Seguro Desportivo</span>
                    <span className="text-[10px] underline flex items-center gap-0.5">Abrir <ExternalLink size={10}/></span>
                  </a>
                ) : (
                  <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 text-center">
                    <Shield size={18} />
                    <span>Sem Seguro</span>
                  </div>
                )}

                {selectedProfile.medical_exam_doc_url ? (
                  <a
                    href={selectedProfile.medical_exam_doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-emerald-700 font-bold hover:bg-emerald-100 transition-colors text-center"
                  >
                    <HeartPulse size={18} />
                    <span>Atestado Médico</span>
                    <span className="text-[10px] underline flex items-center gap-0.5">Abrir <ExternalLink size={10}/></span>
                  </a>
                ) : (
                  <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 text-center">
                    <HeartPulse size={18} />
                    <span>Sem Atestado</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            {isCoachOrAdmin && (
              <div className="pt-3 border-t flex flex-wrap justify-between items-center gap-2">
                <button
                  onClick={() => {
                    const profileToAssociate = selectedProfile
                    setIsDetailModalOpen(false)
                    openAssociateModal(profileToAssociate)
                  }}
                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Link2 size={14} />
                  <span>Associar Conta de Utilizador</span>
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false)
                      openEditModal(selectedProfile)
                    }}
                    className="px-4 py-2 bg-csc-dark text-white rounded-lg text-xs font-bold hover:bg-csc-dark/80 transition-colors flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Edit2 size={14} />
                    <span>Editar Ficha</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: ASSOCIAR UTILIZADOR A JOGADOR */}
      {associatingPlayer && (() => {
        // Encontrar potenciais coincidências por email ou telefone
        const potentialMatches = profiles.filter(p => 
          p.id !== associatingPlayer.id && (
            (p.email && associatingPlayer.email && p.email.trim().toLowerCase() === associatingPlayer.email.trim().toLowerCase()) ||
            (p.phone && associatingPlayer.phone && p.phone.trim() === associatingPlayer.phone.trim())
          )
        )

        const otherUsers = profiles.filter(p => 
          p.id !== associatingPlayer.id && 
          !potentialMatches.some(m => m.id === p.id) && (
            !associateSearchTerm || 
            (p.name && p.name.toLowerCase().includes(associateSearchTerm.toLowerCase())) ||
            (p.email && p.email.toLowerCase().includes(associateSearchTerm.toLowerCase())) ||
            (p.phone && p.phone.includes(associateSearchTerm))
          )
        )

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100">
              <button
                onClick={() => {
                  setAssociatingPlayer(null)
                  setSelectedUserToAssociate(null)
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>

              {/* Cabeçalho */}
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2.5 bg-blue-100 rounded-xl text-blue-700">
                  <Link2 size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">
                    Associar Utilizador a {associatingPlayer.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Liga uma conta de utilizador registada na app à ficha deste jogador
                  </p>
                </div>
              </div>

              {/* Informação do Jogador Atual */}
              <div className="mt-4 p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-850">{associatingPlayer.name} {associatingPlayer.nickname ? `("${associatingPlayer.nickname}")` : ''}</p>
                  <p className="text-gray-500 mt-0.5 font-medium">Email na ficha: <strong className="text-gray-700">{associatingPlayer.email}</strong></p>
                  {associatingPlayer.phone && <p className="text-gray-500 font-medium">Tel: <strong className="text-gray-700">{associatingPlayer.phone}</strong></p>}
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-csc-gold text-csc-dark rounded">
                  Ficha de Jogador
                </span>
              </div>

              {/* 1. Sugestões Automáticas / Coincidências Encontradas */}
              {potentialMatches.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-green-800">
                    <Sparkles size={16} className="text-green-600" />
                    <span>Coincidência Automática Detetada por Email/Contacto!</span>
                  </div>
                  {potentialMatches.map(match => (
                    <div
                      key={match.id}
                      className="p-3.5 bg-green-50/80 border-2 border-green-400 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="text-xs">
                        <p className="font-bold text-green-950 text-sm">{match.name}</p>
                        <p className="text-green-800 font-medium">{match.email}</p>
                        {match.phone && <p className="text-green-700 text-[11px]">Tel: {match.phone}</p>}
                      </div>
                      <button
                        type="button"
                        disabled={associatingLoading}
                        onClick={() => handleConfirmAssociate(associatingPlayer, match)}
                        className="px-3.5 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs shrink-0 flex items-center gap-1"
                      >
                        <UserCheck size={14} />
                        <span>Associar Imediatamente</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. Pesquisa e Seleção de Outro Utilizador Registado */}
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">
                    {potentialMatches.length > 0 ? 'Ou escolher outro utilizador registado' : 'Selecionar Utilizador Registado na App'}
                  </h4>
                </div>

                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={associateSearchTerm}
                    onChange={(e) => setAssociateSearchTerm(e.target.value)}
                    placeholder="Pesquisar utilizador por nome, email ou telefone..."
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 border border-gray-150 rounded-xl p-2 bg-gray-50/50">
                  {otherUsers.length === 0 ? (
                    <p className="text-center py-6 text-xs text-gray-400 font-medium">
                      Nenhum outro utilizador encontrado.
                    </p>
                  ) : (
                    otherUsers.map(user => {
                      const isSelected = selectedUserToAssociate?.id === user.id

                      return (
                        <div
                          key={user.id}
                          onClick={() => setSelectedUserToAssociate(user)}
                          className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                            isSelected 
                              ? 'border-csc-gold bg-csc-gold/15 ring-2 ring-csc-gold/50 shadow-xs' 
                              : 'border-gray-200 hover:border-gray-300 hover:bg-white bg-white/70'
                          }`}
                        >
                          <div>
                            <p className="font-bold text-gray-900">{user.name}</p>
                            <p className="text-gray-500 text-[11px]">{user.email} {user.phone ? `• ${user.phone}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">
                              {user.role}
                            </span>
                            {isSelected && <Check size={16} className="text-csc-dark font-black" />}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssociatingPlayer(null)
                    setSelectedUserToAssociate(null)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>

                {selectedUserToAssociate && (
                  <button
                    type="button"
                    disabled={associatingLoading}
                    onClick={() => handleConfirmAssociate(associatingPlayer, selectedUserToAssociate)}
                    className="px-4 py-2 bg-csc-dark hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md disabled:opacity-50"
                  >
                    <UserCheck size={15} />
                    <span>{associatingLoading ? 'A associar...' : `Vincular a ${selectedUserToAssociate.name}`}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default TeamManagementPage
