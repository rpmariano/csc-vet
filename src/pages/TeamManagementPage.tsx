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
import { useAuth, extractRolesFromProfile, cleanNotesFromRolesTag } from '../context/AuthContext'
import type { Profile, UserRole, ProfileStatus } from '../context/AuthContext'
import SoccerPitchSelector, { parsePositions, normalizePositionName } from '../components/SoccerPitchSelector'
import { VistaDetalhe } from '../components/VistaDetalhe'
import { useSearchParams } from 'react-router-dom'
import { useEhDesktop } from '../hooks/useEhDesktop'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { toast } from '../context/ToastContext'
import { useModalA11y } from '../hooks/useModalA11y'

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
  'Ponta de Lança (Dir)'
]

const TeamManagementPage: React.FC = () => {
  const { profile: currentUserProfile, refreshProfile } = useAuth()
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
  const [searchParams, setSearchParams] = useSearchParams()
  const ehDesktop = useEhDesktop()
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Form State - Expanded with PDF fields
  const [formId, setFormId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
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

  // Upload URLs & Status
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null)
  const [insuranceDocUrl, setInsuranceDocUrl] = useState<string | null>(null)
  const [medicalExamDocUrl, setMedicalExamDocUrl] = useState<string | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false)

  // Generic Confirmation Modal State
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'info' | 'success'
    onConfirm: () => void | Promise<void>
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {}
  })

  const isFormDirty = () => {
    return Boolean(
      formName.trim() ||
      formShirtName.trim() ||
      formEmail.trim() ||
      formPhone.trim() ||
      formNif.trim() ||
      formAddress.trim() ||
      formEmergencyName.trim() ||
      formMedicalNotes.trim()
    )
  }

  const handleAttemptCloseFormModal = () => {
    if (isFormDirty()) {
      setIsUnsavedModalOpen(true)
    } else {
      setIsFormModalOpen(false)
      resetForm()
    }
  }

  const isCoachOrAdmin = currentUserProfile && ['coach', 'admin'].includes(currentUserProfile.role)
  const isAdmin = currentUserProfile?.role === 'admin'

  const ordenarPlantel = (remoteProfiles: Profile[]): Profile[] => {
    // A base de dados é a única fonte do plantel — ver nota em CalendarPage.
    return [...remoteProfiles].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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
      setProfiles(ordenarPlantel((data as Profile[]) || []))
    } catch (err) {
      console.error(err)
      setProfiles(ordenarPlantel([]))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  // Quais fichas têm conta de login associada — só o admin precisa de saber,
  // para o merge de fichas nunca poder apagar o lado que tem sessão.
  const [linkedProfileIds, setLinkedProfileIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!isAdmin) return
    supabase.rpc('admin_linked_profile_ids').then(({ data, error }) => {
      if (error) {
        console.error('Erro ao verificar fichas com conta associada:', error.message)
        return
      }
      setLinkedProfileIds(new Set((data as string[]) || []))
    })
  }, [isAdmin])

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

  // Ver uma ficha é navegar: o endereço passa a ter ?atleta=<id>, portanto a
  // ficha tem link próprio e o botão de retroceder do browser fecha-a. No
  // desktop deixa de ser uma persiana e passa a ser a página (ver VistaDetalhe).
  const openDetailModal = (p: Profile) => {
    setSelectedProfile(p)
    setIsDetailModalOpen(true)
    setSearchParams({ atleta: p.id })
  }

  useEffect(() => {
    const idAtleta = searchParams.get('atleta')
    if (!idAtleta) {
      setIsDetailModalOpen(false)
      return
    }
    const alvo = profiles.find(p => p.id === idAtleta)
    if (alvo) {
      setSelectedProfile(alvo)
      setIsDetailModalOpen(true)
    }
  }, [searchParams, profiles])

  const fecharFicha = () => {
    setIsDetailModalOpen(false)
    if (searchParams.get('atleta')) {
      const restantes = new URLSearchParams(searchParams)
      restantes.delete('atleta')
      setSearchParams(restantes, { replace: true })
    }
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

      toast.success('Ficheiro carregado com sucesso!')
    } catch (err: any) {
      toast.error('Erro ao carregar ficheiro: ' + err.message)
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

  const syncPlayerPracticeCallups = async (targetPlayerId: string, status: ProfileStatus) => {
    try {
      const nowIso = new Date().toISOString()
      const { data: upcomingPractices } = await supabase
        .from('events')
        .select('id')
        .eq('type', 'practice')
        .gte('date_time', nowIso)

      if (!upcomingPractices || upcomingPractices.length === 0) return

      const practiceIds = upcomingPractices.map(p => p.id)

      if (status === 'active') {
        // Jogador passou a apto: adicionar a todos os treinos futuros onde ainda não esteja convocado
        const { data: existingCallups } = await supabase
          .from('callups')
          .select('event_id')
          .eq('player_id', targetPlayerId)
          .in('event_id', practiceIds)

        const alreadyCalledEventIds = new Set((existingCallups || []).map(c => c.event_id))
        const toCallEventIds = practiceIds.filter(id => !alreadyCalledEventIds.has(id))

        if (toCallEventIds.length > 0) {
          const insertPayload = toCallEventIds.map(eventId => ({
            event_id: eventId,
            player_id: targetPlayerId,
            status: 'called'
          }))
          await supabase.from('callups').insert(insertPayload)
        }
      } else {
        // Jogador passou a lesionado ('injured') ou inativo ('inactive'): retirar de todos os treinos futuros
        await supabase
          .from('callups')
          .delete()
          .eq('player_id', targetPlayerId)
          .in('event_id', practiceIds)
      }
    } catch (syncErr) {
      console.error('Erro ao sincronizar convocatórias de treino:', syncErr)
    }
  }

  const handleTogglePlayerClinicalStatus = async (player: Profile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const newStatus: ProfileStatus = player.status === 'injured' ? 'active' : 'injured'

    try {
      // 1. Atualizar na BD
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', player.id)

      if (error) throw error

      // 2. Sincronizar treinos
      await syncPlayerPracticeCallups(player.id, newStatus)

      // 3. Atualizar estados locais
      setProfiles(prev => prev.map(p => p.id === player.id ? { ...p, status: newStatus } : p))
      if (selectedProfile && selectedProfile.id === player.id) {
        setSelectedProfile(prev => prev ? { ...prev, status: newStatus } : null)
      }

      if (currentUserProfile && currentUserProfile.id === player.id) {
        await refreshProfile()
      }
      toast.success(newStatus === 'injured' ? 'Atleta marcado como lesionado ⚠️' : 'Atleta marcado como apto ✓')
    } catch (err: any) {
      toast.error('Erro ao atualizar estado físico: ' + (err.message || 'Erro desconhecido'))
    }
  }

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName || !formEmail) {
      toast.warning('Nome e Email são obrigatórios.')
      return
    }

    const primaryRole: UserRole = formRoles.includes('admin') 
      ? 'admin' 
      : formRoles.includes('coach') 
      ? 'coach' 
      : 'player'

    // Sem o papel de Jogador não há posição de campo a gravar — mesmo que a
    // seleção tenha ficado por defeito de uma edição anterior, não se grava.
    const positionStr = formRoles.includes('player')
      ? (formPositions.length > 0 ? formPositions.join(', ') : 'Médio Centro')
      : null
    // Os papéis passam a ir na coluna `roles`, protegida por RLS, em vez de uma
    // etiqueta <!--roles:--> escondida dentro do texto das notas médicas.
    const medicalNotesEncoded = formMedicalNotes && formMedicalNotes.trim() ? formMedicalNotes.trim() : null

    const sanitizeDate = (val?: string | null) => (val && val.trim() ? val.trim() : null)
    const sanitizeText = (val?: string | null) => (val && val.trim() ? val.trim() : null)

    const payload = {
      name: formName.trim(),
      shirt_name: sanitizeText(formShirtName),
      nickname: sanitizeText(formShirtName),
      email: formEmail.trim().toLowerCase(),
      phone: sanitizeText(formPhone),
      role: primaryRole,
      // Coluna `roles`: a lista completa de papéis atribuídos. Só administradores
      // conseguem escrevê-la — a RLS rejeita a alteração feita pelo próprio.
      roles: formRoles,
      status: formStatus,
      jersey_number: formJerseyNumber !== '' && !isNaN(Number(formJerseyNumber)) ? Number(formJerseyNumber) : null,
      kit_size: sanitizeText(formKitSize),
      birth_date: sanitizeDate(formBirthDate),
      nationality: sanitizeText(formNationality) || 'Portuguesa',
      position: positionStr,
      address: sanitizeText(formAddress),
      postal_code: sanitizeText(formPostalCode),
      city: sanitizeText(formCity),
      nif: sanitizeText(formNif),
      id_number: sanitizeText(formIdNumber),
      id_card_expiry: sanitizeDate(formIdCardExpiry),
      iban: sanitizeText(formIban),
      gdpr_consent: Boolean(formGdprConsent),
      member_number: sanitizeText(formMemberNumber),
      emergency_contact_name: sanitizeText(formEmergencyName),
      emergency_contact_phone: sanitizeText(formEmergencyPhone),
      medical_notes: medicalNotesEncoded,
      photo_url: photoUrl || null,
      id_document_url: idDocUrl || null,
      insurance_doc_url: insuranceDocUrl || null,
      medical_exam_doc_url: medicalExamDocUrl || null,
    }

    try {
      const cleanEmail = formEmail.trim().toLowerCase()
      const cleanName = formName.trim()
      let savedPlayerId: string | null = null

      if (isEditing && formId && !formId.startsWith('seed-')) {
        // 1. Verificar se o novo email já pertence a OUTRO atleta na base de dados
        const { data: conflict } = await supabase
          .from('profiles')
          .select('id, name')
          .eq('email', cleanEmail)
          .neq('id', formId)
          .maybeSingle()

        if (conflict) {
          toast.error(`O email "${cleanEmail}" já está associado a outro membro ("${conflict.name}").`)
          return
        }

        const { data: updatedRows, error } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', formId)
          .select()

        if (error) throw error
        if (updatedRows && updatedRows.length === 0) {
          console.warn('Update matched 0 rows')
        }
        savedPlayerId = formId
        toast.success('Ficha de membro atualizada com sucesso!')
      } else {
        // 2. Se for um membro de semente (seed-X) ou novo registo:
        // Verificar se já existe perfil na BD com este nome ou email
        const { data: existingByName } = await supabase
          .from('profiles')
          .select('id')
          .ilike('name', cleanName)
          .maybeSingle()

        let existingId = existingByName?.id

        if (!existingId) {
          const { data: existingByEmail } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle()
          existingId = existingByEmail?.id
        }

        if (existingId) {
          const { error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('id', existingId)
            .select()
          if (error) throw error
          savedPlayerId = existingId
          toast.success('Ficha de membro atualizada na base de dados!')
        } else {
          const newId = crypto.randomUUID()
          const { error } = await supabase
            .from('profiles')
            .insert([{
              ...payload,
              id: newId
            }])
            .select()
          if (error) throw error
          savedPlayerId = newId
          toast.success('Novo membro gravado com sucesso!')
        }
      }

      // Atualizar o estado local imediatamente para refletir no ecrã sem depender de race conditions
      if (savedPlayerId) {
        setProfiles(prev => prev.map(p => {
          if (p.id === formId || p.id === savedPlayerId || p.name?.toLowerCase().trim() === cleanName.toLowerCase()) {
            return {
              ...p,
              ...payload,
              id: savedPlayerId!
            }
          }
          return p
        }))
        await syncPlayerPracticeCallups(savedPlayerId, formStatus)
      }

      setIsFormModalOpen(false)
      fetchProfiles()
    } catch (err: any) {
      console.error('Erro ao gravar membro:', err)
      toast.error('Erro ao gravar membro: ' + (err.message || 'Verifique a base de dados'))
    }
  }

  const handleDeleteMember = (id: string, name: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Eliminar Membro',
      description: `Tens a certeza que desejas eliminar o membro "${name}"? Todas as fichas e dados associados serão removidos.`,
      confirmText: 'Sim, Eliminar Membro',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        try {
          if (id.startsWith('seed-')) {
            setProfiles(prev => prev.filter(p => p.id !== id))
          } else {
            const { error } = await supabase.from('profiles').delete().eq('id', id)
            if (error) throw error
            setProfiles(prev => prev.filter(p => p.id !== id))
          }
          if (selectedProfile?.id === id) fecharFicha()
          toast.success('Membro eliminado com sucesso!')
        } catch (err: any) {
          toast.error('Erro ao eliminar membro: ' + err.message)
        }
      }
    })
  }

  // --- FUSÃO DE FICHAS (admin) ---
  // Antes disto era "Associar Conta de Utilizador": copiava campos à mão no
  // cliente (só convocatórias e quotas — estatísticas, presenças, encargos,
  // seguros e comunicados ficavam para trás e eram apagados em cascata com a
  // ficha antiga) e presumia que a ficha órfã tinha um id "seed-…", convenção
  // de quando o plantel vinha embutido no código. Desde a migração para o
  // Supabase nenhuma ficha tem esse prefixo, por isso o botão nunca aparecia
  // — a fusão real ficava por fazer, tal como aconteceu com o André Couto.
  // Agora é a RPC `admin_merge_profiles`, numa transação só no servidor.
  const [associatingPlayer, setAssociatingPlayer] = useState<Profile | null>(null)
  const [associateSearchTerm, setAssociateSearchTerm] = useState('')
  const [selectedUserToAssociate, setSelectedUserToAssociate] = useState<Profile | null>(null)
  const [survivorSide, setSurvivorSide] = useState<'ficha' | 'selecionado'>('ficha')
  const [associatingLoading, setAssociatingLoading] = useState(false)

  const openAssociateModal = (p: Profile) => {
    setAssociatingPlayer(p)
    setAssociateSearchTerm('')
    setSelectedUserToAssociate(null)
    setSurvivorSide('ficha')
  }

  const handleConfirmAssociate = (fichaA: Profile, fichaB: Profile, manterA: boolean) => {
    if (fichaA.id === fichaB.id) {
      toast.warning('Escolhe duas fichas diferentes.')
      return
    }
    const manter = manterA ? fichaA : fichaB
    const apagar = manterA ? fichaB : fichaA

    setConfirmModalConfig({
      isOpen: true,
      title: 'Fundir Fichas',
      description: `Vais fundir "${apagar.name}" em "${manter.name}": os dados em falta em "${manter.name}" são preenchidos a partir de "${apagar.name}", todo o histórico (convocatórias, presenças, estatísticas, quotas, encargos, seguros) passa para "${manter.name}", e a ficha "${apagar.name}" é apagada. Tens a certeza?`,
      confirmText: 'Sim, Fundir Fichas',
      cancelText: 'Cancelar',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        setAssociatingLoading(true)
        try {
          const { error } = await supabase.rpc('admin_merge_profiles', {
            id_manter: manter.id,
            id_apagar: apagar.id
          })
          if (error) throw error

          toast.success(`Fichas fundidas: "${apagar.name}" passou para "${manter.name}".`)
          setAssociatingPlayer(null)
          setSelectedUserToAssociate(null)
          if (selectedProfile?.id === apagar.id) {
            fecharFicha()
          }
          fetchProfiles()
        } catch (err: any) {
          toast.error('Erro ao fundir fichas: ' + (err.message || 'Verifique a base de dados'))
        } finally {
          setAssociatingLoading(false)
        }
      }
    })
  }

  // Procura de sugestões inteligentes de associação
  const associationSuggestions = React.useMemo(() => {
    if (!isAdmin) return []
    const registeredUsersWithoutKit = profiles.filter(p => linkedProfileIds.has(p.id) && (!p.jersey_number || !p.kit_size))
    const unlinkedSquadProfiles = profiles.filter(p => !linkedProfileIds.has(p.id))

    const suggestions: { user: Profile; player: Profile }[] = []

    registeredUsersWithoutKit.forEach(userP => {
      const uEmail = (userP.email || '').toLowerCase().trim()
      const uPhone = (userP.phone || '').trim().replace(/\D/g, '')
      const uName = (userP.name || '').toLowerCase().trim()
      const uWords = uName.split(' ').filter(w => w.length > 2)

      const match = unlinkedSquadProfiles.find(squadP => {
        const sEmail = (squadP.email || '').toLowerCase().trim()
        const sPhone = (squadP.phone || '').trim().replace(/\D/g, '')
        const sName = (squadP.name || '').toLowerCase().trim()
        const sWords = sName.split(' ').filter(w => w.length > 2)

        // 1. Email idêntico
        if (uEmail && sEmail && uEmail === sEmail) return true

        // 2. Telefone idêntico (>= 9 dígitos)
        if (uPhone && sPhone && uPhone.length >= 9 && uPhone === sPhone) return true

        // 3. Se a ficha tiver outro email atribuído, não associar por nome
        if (sEmail && uEmail && sEmail !== uEmail) return false

        // 4. Nome completo idêntico ou Primeiro + Último Nome
        if (uName && sName && uName === sName) return true
        if (uWords.length >= 2 && sWords.length >= 2) {
          return uWords[0] === sWords[0] && uWords[uWords.length - 1] === sWords[sWords.length - 1]
        }

        return false
      })

      if (match) {
        suggestions.push({ user: userP, player: match })
      }
    })

    return suggestions
  }, [profiles, isAdmin, linkedProfileIds])

  // Filtered list
  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = 
      (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.shirt_name && p.shirt_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.position && p.position.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.jersey_number && p.jersey_number.toString().includes(searchTerm))

    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    const matchesPosition = positionFilter === 'all' || (() => {
      if (!p.position) return false
      const playerPosList = parsePositions(p.position).map(pos => normalizePositionName(pos).toLowerCase())
      const targetPos = normalizePositionName(positionFilter).toLowerCase()
      return playerPosList.includes(targetPos) || p.position.toLowerCase().includes(positionFilter.toLowerCase())
    })()

    return matchesSearch && matchesStatus && matchesPosition
  })

  // Quick Metrics
  const totalCount = profiles.length
  const activeCount = profiles.filter(p => p.status === 'active').length
  const injuredCount = profiles.filter(p => p.status === 'injured').length
  const inactiveCount = profiles.filter(p => p.status === 'inactive').length

  // Escape, prisão de foco e anúncio a leitores de ecrã, mantendo o visual próprio de cada painel.
  const painelFichaRef = useModalA11y({ isOpen: isFormModalOpen, onClose: handleAttemptCloseFormModal })
  const painelAssociarRef = useModalA11y({
    isOpen: !!associatingPlayer,
    onClose: () => {
      setAssociatingPlayer(null)
      setSelectedUserToAssociate(null)
    },
  })

  return (
    <div className="space-y-6 pb-12">
      {/* No desktop, abrir uma ficha é mudar de página: a lista sai da frente
          em vez de ficar por baixo de uma janela. No telemóvel a persiana sobe
          por cima e a lista continua onde estava. */}
      <div className={ehDesktop && isDetailModalOpen ? 'hidden' : 'space-y-6'}>
      {/* Header com título removido a pedido do utilizador */}
      {isCoachOrAdmin && (
        <div className="flex items-center justify-end">
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 bg-csc-dark text-white px-4 py-2.5 rounded-xl font-bold hover:bg-csc-dark/80 transition-colors shadow-md shrink-0 text-xs sm:text-sm cursor-pointer active:scale-95"
          >
            <Plus size={18} />
            <span>Adicionar Membro</span>
          </button>
        </div>
      )}

      {/* Banner de Sugestões Inteligentes de Fusão de Fichas — só admin, que é
          quem pode chamar admin_merge_profiles */}
      {isAdmin && associationSuggestions.length > 0 && (
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
                    ⚽ Ficha: #{pl.jersey_number} {pl.name} {pl.shirt_name ? `(${pl.shirt_name})` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={associatingLoading}
                  onClick={() => handleConfirmAssociate(pl, u, false)}
                  className="px-3 py-1.5 bg-csc-dark hover:bg-csc-dark/85 text-white text-xs font-black rounded-lg shrink-0 shadow-xs cursor-pointer active:scale-95 flex items-center gap-1"
                >
                  <Link2 size={13} />
                  <span>Fundir</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de Pesquisa + Filtro de Posição + Alternador de Vista (Posicionada Acima dos Cards) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Pesquisa */}
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, nome na camisola, posição ou nº camisola..."
              className="w-full pl-9.5 pr-4 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
            />
          </div>

          {/* Filtro por Posição & Alternador de Vista */}
          <div className="flex gap-2 items-center flex-wrap shrink-0 justify-between sm:justify-end">
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="px-3.5 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-bold text-gray-700 max-w-[190px] shadow-2xs cursor-pointer"
            >
              <option value="all">Todas as Posições</option>
              {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>

            {/* Alternador Duplo de Vista (Lista vs Cartas) */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setViewMode('list')
                  localStorage.setItem('csc_team_view_mode', 'list')
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-csc-dark shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Vista em Lista Compacta"
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-csc-dark shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
                title="Vista em Cartas (FUT)"
              >
                <LayoutGrid size={15} />
                <span className="hidden sm:inline">Cartas</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Status (Filtram ao Clicar) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Plantel (Todos) */}
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-center gap-3 text-left cursor-pointer shadow-2xs ${
            statusFilter === 'all'
              ? 'bg-csc-dark border-csc-gold ring-2 ring-csc-gold shadow-md scale-102'
              : 'bg-csc-dark border-white/10 hover:border-white/25 hover:bg-white/5'
          }`}
        >
          <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center font-black text-base shrink-0 transition-colors ${
            statusFilter === 'all' ? 'bg-white/15 text-csc-gold' : 'bg-white/10 text-white/70'
          }`}>
            {totalCount}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-white/70 font-bold uppercase tracking-wider">Total Plantel</p>
            <p className="text-sm font-black text-white leading-tight">Membros</p>
          </div>
        </button>

        {/* Ativos / Disponíveis */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-center gap-3 text-left cursor-pointer shadow-2xs ${
            statusFilter === 'active'
              ? 'bg-csc-dark border-emerald-400 ring-2 ring-emerald-400 shadow-md scale-102'
              : 'bg-csc-dark border-white/10 hover:border-emerald-400/40 hover:bg-emerald-500/5'
          }`}
        >
          <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center font-black text-base shrink-0 transition-colors ${
            statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {activeCount}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider">Disponíveis</p>
            <p className="text-sm font-black text-emerald-200 leading-tight">Ativos</p>
          </div>
        </button>

        {/* Lesionados / Dpto Médico */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'injured' ? 'all' : 'injured')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-center gap-3 text-left cursor-pointer shadow-2xs ${
            statusFilter === 'injured'
              ? 'bg-csc-dark border-red-400 ring-2 ring-red-400 shadow-md scale-102'
              : 'bg-csc-dark border-white/10 hover:border-red-400/40 hover:bg-red-500/5'
          }`}
        >
          <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center font-black text-base shrink-0 transition-colors ${
            statusFilter === 'injured' ? 'bg-red-600 text-white animate-pulse' : 'bg-red-100 text-red-800'
          }`}>
            {injuredCount}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-red-300 font-bold uppercase tracking-wider">Dpto. Médico</p>
            <p className="text-sm font-black text-red-200 leading-tight">Lesionados</p>
          </div>
        </button>

        {/* Inativos */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'inactive' ? 'all' : 'inactive')}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all flex items-center gap-3 text-left cursor-pointer shadow-2xs ${
            statusFilter === 'inactive'
              ? 'bg-csc-dark border-white/40 ring-2 ring-white/40 shadow-md scale-102'
              : 'bg-csc-dark border-white/10 hover:border-white/25 hover:bg-white/5'
          }`}
        >
          <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center font-black text-base shrink-0 transition-colors ${
            statusFilter === 'inactive' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
          }`}>
            {inactiveCount}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-white/70 font-bold uppercase tracking-wider">Indisponíveis</p>
            <p className="text-sm font-black text-white/80 leading-tight">Inativos</p>
          </div>
        </button>
      </div>

      {/* Profiles View */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-gold"></div>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="bg-csc-dark text-white rounded-2xl border border-dashed border-white/15 p-12 text-center">
          <Users size={48} className="mx-auto text-white/20 mb-3" />
          <p className="font-bold text-white/70 text-lg">Nenhum atleta encontrado</p>
          <p className="text-xs text-white/65 mt-1">Ajuste os filtros de pesquisa ou adicione um novo membro.</p>
        </div>
      ) : viewMode === 'list' ? (
        /* VISTA 1: LISTA MODERNA & ELEGANTE (Mobile-first) */
        <div className="space-y-2.5">
          {filteredProfiles.map((person) => {
            const age = calculateAge(person.birth_date)
            const roles = extractRolesFromProfile(person)
            // Sem o papel de Jogador não há posições a mostrar — sem isto, o valor por
            // omissão de parsePositions(null) mostrava sempre "Médio Defensivo".
            const positions = roles.includes('player') ? parsePositions(person.position) : []

            return (
              <div
                key={person.id}
                onClick={() => openDetailModal(person)}
                className="bg-csc-dark text-white rounded-2xl border border-white/10 shadow-2xs hover:shadow-md hover:border-csc-gold/60 transition-all p-3.5 sm:p-4 cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                      <h3 className="font-black text-white text-sm sm:text-base leading-tight group-hover:text-csc-gold transition-colors">
                        {person.name}
                      </h3>

                      {(person.shirt_name || person.nickname) && (
                        <span className="text-[11px] font-black text-amber-950 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                          <span>👕</span>
                          <span className="uppercase">{person.shirt_name || person.nickname}</span>
                        </span>
                      )}

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

                      {/* Conta de login associada — só o admin precisa de ver isto */}
                      {isAdmin && (
                        linkedProfileIds.has(person.id) ? (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.2 rounded border bg-sky-100 text-sky-800 border-sky-200 flex items-center gap-0.5"
                            title="Esta ficha tem conta de login associada"
                          >
                            <UserCheck size={9} /> Conta
                          </span>
                        ) : (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.2 rounded border bg-gray-100 text-gray-500 border-gray-200"
                            title="Ninguém fez login associado a esta ficha ainda"
                          >
                            Sem Conta
                          </span>
                        )
                      )}
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
                        <span className="text-[10px] text-white/60 font-semibold bg-white/10 px-1.5 py-0.5 rounded">
                          Tam: {person.kit_size}
                        </span>
                      )}

                      {person.member_number && (
                        <span className="text-[10px] text-white/65 font-medium hidden sm:inline">
                          • Sócio nº {person.member_number}
                        </span>
                      )}

                      {age && (
                        <span className="text-[10px] text-white/65 font-medium">
                          • {age} anos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right / Bottom Action Bar */}
                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                  {/* Status Indicator Interativo */}
                  <button
                    type="button"
                    onClick={(e) => handleTogglePlayerClinicalStatus(person, e)}
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-2xs cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                      person.status === 'active' ? 'bg-green-100 text-green-800 border border-green-200 hover:bg-green-200' :
                      person.status === 'injured' ? 'bg-red-100 text-red-800 border border-red-200 animate-pulse hover:bg-red-200' :
                      'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                    }`}
                    title="Clique para alternar o estado de aptidão física (Apto / Lesionado)"
                  >
                    {person.status === 'active' ? <CheckCircle2 size={11}/> :
                     person.status === 'injured' ? <HeartPulse size={11}/> :
                     <XCircle size={11}/>}
                    <span>{person.status === 'active' ? 'Apto' : person.status === 'injured' ? 'Lesionado' : 'Inativo'}</span>
                  </button>

                  {/* Actions for Coach / Admin */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isCoachOrAdmin && (
                      <>
                        {isAdmin && !linkedProfileIds.has(person.id) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openAssociateModal(person)
                            }}
                            className="p-1.5 text-blue-300 hover:text-blue-200 rounded-lg hover:bg-blue-500/10 transition-colors"
                            title="Fundir com outra ficha"
                          >
                            <Link2 size={15} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditModal(person)
                          }}
                          className="p-1.5 text-white/70 hover:text-csc-gold rounded-lg hover:bg-white/10 transition-colors"
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
                            className="p-1.5 text-white/60 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                            title="Eliminar Membro"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </>
                    )}

                    <ChevronRight size={16} className="text-white/25 group-hover:text-csc-gold group-hover:translate-x-0.5 transition-all ml-1" />
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
            // Sem o papel de Jogador não há posições a mostrar — sem isto, o valor por
            // omissão de parsePositions(null) mostrava sempre "Médio Defensivo".
            const positions = extractRolesFromProfile(person).includes('player') ? parsePositions(person.position) : []

            return (
              <div
                key={person.id}
                onClick={() => openDetailModal(person)}
                className={`bg-csc-dark text-white rounded-2xl shadow-sm border-2 transition-all duration-200 hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col justify-between overflow-hidden group relative ${
                  person.status === 'injured'
                    ? 'border-red-400/50 ring-2 ring-red-400/20'
                    : 'border-white/10 hover:border-csc-gold'
                }`}
              >
                {/* Top Card Gradient Background Accent */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-csc-gold/10 to-transparent pointer-events-none" />

                <div className="p-4 relative z-10 flex flex-col items-center text-center space-y-3">
                  {/* Top Bar: Number left, Status right */}
                  <div className="w-full flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl font-black text-csc-gold tracking-tighter">
                        {person.jersey_number ? `#${person.jersey_number}` : '-'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleTogglePlayerClinicalStatus(person, e)}
                      className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                        person.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                        person.status === 'injured' ? 'bg-red-100 text-red-800 animate-pulse hover:bg-red-200' :
                        'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title="Clique para alternar o estado de aptidão física (Apto / Lesionado)"
                    >
                      {person.status === 'active' ? <CheckCircle2 size={10}/> :
                       person.status === 'injured' ? <HeartPulse size={10}/> :
                       <XCircle size={10}/>}
                      <span>{person.status === 'active' ? 'Apto' :
                       person.status === 'injured' ? 'Lesionado' : 'Inativo'}</span>
                    </button>
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

                  {/* Nome da Camisola como título da carta */}
                  <div className="w-full">
                    <h3 className="font-black text-white text-base leading-tight uppercase tracking-wide truncate group-hover:text-csc-gold transition-colors" title={person.name}>
                      {person.shirt_name || person.nickname || person.name}
                    </h3>

                    {/* Positions Ribbon */}
                    <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                      {positions.map((pos, idx) => (
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

                      {/* Conta de login associada — só o admin precisa de ver isto */}
                      {isAdmin && (
                        linkedProfileIds.has(person.id) ? (
                          <span
                            className="text-[9px] font-black px-2 py-0.5 rounded border bg-sky-100 text-sky-800 border-sky-200 flex items-center gap-0.5"
                            title="Esta ficha tem conta de login associada"
                          >
                            <UserCheck size={9} /> Conta
                          </span>
                        ) : (
                          <span
                            className="text-[9px] font-black px-2 py-0.5 rounded border bg-white/10 text-white/50 border-white/15"
                            title="Ninguém fez login associado a esta ficha ainda"
                          >
                            Sem Conta
                          </span>
                        )
                      )}
                    </div>

                    {/* Member & Age Info */}
                    <p className="text-[10px] text-white/65 font-semibold mt-1">
                      {person.kit_size ? `Tam: ${person.kit_size} • ` : ''}{person.member_number ? `Sócio nº ${person.member_number}` : ''} {age ? `• ${age} anos` : ''}
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="bg-white/5 px-3.5 py-2.5 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-xs font-black text-csc-gold group-hover:underline flex items-center gap-1">
                    Ver Ficha Completa
                  </span>

                  {isCoachOrAdmin && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {isAdmin && !linkedProfileIds.has(person.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openAssociateModal(person)
                          }}
                          className="p-1.5 text-blue-300 hover:text-blue-200 rounded-lg hover:bg-blue-500/10 transition-colors"
                          title="Fundir com outra ficha"
                        >
                          <Link2 size={14} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditModal(person)
                        }}
                        className="p-1.5 text-white/70 hover:text-csc-gold rounded-lg hover:bg-white/10 transition-colors"
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
                          className="p-1.5 text-white/60 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
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
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 lg:p-6 z-50 overflow-y-auto"
          onMouseDown={(e) => {
            // mousedown no fundo, e não um arrasto que começou dentro do painel (ex.: a selecionar texto)
            if (e.target === e.currentTarget) handleAttemptCloseFormModal()
          }}
        >
          <div
            ref={painelFichaRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ficha-membro-titulo"
            tabIndex={-1}
            className="bg-csc-dark text-white rounded-3xl max-w-4xl xl:max-w-5xl w-full p-6 lg:p-8 relative max-h-[92vh] overflow-y-auto shadow-2xl border-2 border-amber-400/40 outline-none"
          >
            <button
              type="button"
              onClick={handleAttemptCloseFormModal}
              aria-label="Fechar"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white text-csc-dark hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-md border-2 border-white/40"
            >
              <X size={19} className="stroke-[2.5]" />
            </button>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-5">
              <div>
                <h2 id="ficha-membro-titulo" className="text-2xl font-black text-white mb-0.5">
                  {isEditing ? 'Editar Ficha do Membro' : 'Criar Ficha de Novo Membro'}
                </h2>
                <p className="text-xs text-white/70">
                  Preencha os dados cadastrais, fiscais, morada, equipamento, contactos e anexe a documentação legal.
                </p>
              </div>

              {/* Estado de Aptidão & Atividade no Cabeçalho */}
              <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-2xl border border-white/10 self-start sm:self-auto shrink-0">
                <span className="text-xs font-bold text-white/70 pl-1.5">Estado:</span>
                <div className="flex rounded-xl p-0.5 bg-white/10 border border-white/10 gap-1">
                  <button
                    type="button"
                    onClick={() => setFormStatus('active')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      formStatus === 'active'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    🟢 Apto
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormStatus('injured')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      formStatus === 'injured'
                        ? 'bg-red-600 text-white shadow-xs animate-pulse'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    🔴 Lesionado
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormStatus('inactive')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      formStatus === 'inactive'
                        ? 'bg-white/25 text-white shadow-xs'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    ⚪ Inativo
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMember} className="space-y-6">
              
              {/* 1. DADOS PESSOAIS & IDENTIFICAÇÃO FISCAL */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} className="text-csc-gold" />
                  <span>1. Identificação Pessoal & Fiscal</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="Ex: André Gomes Marques do Couto"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Nome na Camisola</label>
                    <input
                      type="text"
                      value={formShirtName}
                      onChange={(e) => setFormShirtName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="Ex: A. COUTO"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Data de Nascimento</label>
                    <input
                      type="date"
                      value={formBirthDate}
                      onChange={(e) => setFormBirthDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Nacionalidade</label>
                    <input
                      type="text"
                      value={formNationality}
                      onChange={(e) => setFormNationality(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="Portuguesa"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Nº de Contribuinte (NIF)</label>
                    <input
                      type="text"
                      value={formNif}
                      onChange={(e) => setFormNif(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="000 000 000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Nº Cartão de Cidadão / Passaporte</label>
                    <input
                      type="text"
                      value={formIdNumber}
                      onChange={(e) => setFormIdNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="00000000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Validade do Cartão de Cidadão</label>
                    <input
                      type="date"
                      value={formIdCardExpiry}
                      onChange={(e) => setFormIdCardExpiry(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                    />
                  </div>
                </div>
              </div>

              {/* 2. MORADA & RESIDÊNCIA */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-gold" />
                  <span>2. Morada & Residência</span>
                </h3>

                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Morada (Rua, Nº e Andar)</label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                    placeholder="Rua e número da morada"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Código Postal</label>
                    <input
                      type="text"
                      value={formPostalCode}
                      onChange={(e) => setFormPostalCode(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="0000-000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Localidade</label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="Cascais / Alcabideche"
                    />
                  </div>
                </div>
              </div>

              {/* 3. CONTACTOS */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={14} className="text-csc-gold" />
                  <span>3. Contactos</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="atleta@clube.pt"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Telemóvel</label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="912 345 678"
                    />
                  </div>
                </div>
              </div>

              {/* 4. DADOS DESPORTIVOS, EQUIPAMENTO & PAPEL */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Shield size={14} className="text-csc-gold" />
                    <span>4. Dados Desportivos, Equipamento & Função</span>
                  </span>
                  <span className="text-[10px] text-white/65 font-bold">Múltiplas posições e papéis permitidos</span>
                </h3>

                {/* 4.1 Campo de Futebol Interativo — só faz sentido para quem tem o papel
                    de Jogador; treinadores/direção sem esse papel não jogam, não têm posição. */}
                {formRoles.includes('player') && (
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-2">
                      Posições no Campo:
                    </label>
                    <SoccerPitchSelector
                      selectedPositions={formPositions}
                      onChange={setFormPositions}
                    />
                  </div>
                )}

                {/* 4.2 Papéis no Sistema (1, 2 ou 3 funções) */}
                <div className="pt-2 border-t border-white/10">
                  <label className="block text-xs font-bold text-white/70 mb-2">
                    Papel / Funções no Sistema (Selecione 1, 2 ou 3):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Jogador */}
                    <button
                      type="button"
                      onClick={() => toggleRole('player')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        formRoles.includes('player')
                          ? 'bg-emerald-500/15 border-emerald-400 ring-2 ring-emerald-400/40 shadow-xs'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-base">⚽</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('player') ? 'bg-emerald-600 text-white' : 'border border-white/20'
                        }`}>
                          {formRoles.includes('player') && <Check size={12} className="stroke-[3]" />}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-white">Jogador</span>
                      <span className="text-[10px] text-white/70 mt-0.5 leading-tight">Atleta nas convocatórias e estatísticas</span>
                    </button>

                    {/* Treinador */}
                    <button
                      type="button"
                      onClick={() => toggleRole('coach')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        formRoles.includes('coach')
                          ? 'bg-blue-500/15 border-blue-400 ring-2 ring-blue-400/40 shadow-xs'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-base">📋</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('coach') ? 'bg-blue-600 text-white' : 'border border-white/20'
                        }`}>
                          {formRoles.includes('coach') && <Check size={12} className="stroke-[3]" />}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-white">Treinador</span>
                      <span className="text-[10px] text-white/70 mt-0.5 leading-tight">Equipa técnica, criação de treinos e jogos</span>
                    </button>

                    {/* Administrador / Direção */}
                    <button
                      type="button"
                      onClick={() => toggleRole('admin')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        formRoles.includes('admin')
                          ? 'bg-amber-500/15 border-csc-gold ring-2 ring-csc-gold/40 shadow-xs'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-base">🛡️</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('admin') ? 'bg-white/10 text-csc-gold' : 'border border-white/20'
                        }`}>
                          {formRoles.includes('admin') && <Check size={12} className="stroke-[3]" />}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-white">Administrador / Direção</span>
                      <span className="text-[10px] text-white/70 mt-0.5 leading-tight">Acesso total, finanças e administração app</span>
                    </button>
                  </div>
                </div>

                {/* 4.3 Camisola & Tamanho de Equipamento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Nº da Camisola</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={formJerseyNumber}
                      onChange={(e) => setFormJerseyNumber(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="Ex: 10"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Tamanho Equipamento</label>
                    <select
                      value={formKitSize}
                      onChange={(e) => setFormKitSize(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-bold text-gray-900"
                    >
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 5. DADOS BANCÁRIOS & QUOTAS */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={14} className="text-csc-gold" />
                  <span>5. Dados Bancários & Quotas</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">IBAN (Débito Direto / Quotas)</label>
                    <input
                      type="text"
                      value={formIban}
                      onChange={(e) => setFormIban(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-mono text-gray-900"
                      placeholder="PT50 0000 0000 0000 0000 0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Nº de Sócio do Clube</label>
                    <input
                      type="text"
                      value={formMemberNumber}
                      onChange={(e) => setFormMemberNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="Ex: 1420"
                    />
                  </div>
                </div>
              </div>

              {/* 6. SAÚDE & EMERGÊNCIA */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <HeartPulse size={14} className="text-red-400" />
                  <span>6. Saúde & Contacto de Emergência</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Contacto de Emergência (Nome / Relação)</label>
                    <input
                      type="text"
                      value={formEmergencyName}
                      onChange={(e) => setFormEmergencyName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="Ex: Maria (Esposa)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Telefone de Emergência</label>
                    <input
                      type="tel"
                      value={formEmergencyPhone}
                      onChange={(e) => setFormEmergencyPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                      placeholder="960 000 000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Notas Médicas / Alergias / Tipo Sanguíneo</label>
                  <textarea
                    value={formMedicalNotes}
                    onChange={(e) => setFormMedicalNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                    placeholder="Ex: Alergia a anti-inflamatórios, Tipo O+, histórico de lesão no joelho direito..."
                  />
                </div>
              </div>

              {/* 7. UPLOAD DE DOCUMENTOS & RGPD */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-gold" />
                  <span>7. Documentos & Proteção de Dados (RGPD)</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Foto de Perfil */}
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-white/80">Fotografia de Perfil</label>
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
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-white/80">Doc. Identificação (CC / Passaporte)</label>
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
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-white/80">Apólice de Seguro Desportivo</label>
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
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-2">
                    <label className="block text-xs font-bold text-white/80">Atestado / Exame Médico Desportivo</label>
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
                <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="gdpr_consent"
                    checked={formGdprConsent}
                    onChange={(e) => setFormGdprConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-csc-dark rounded border-gray-300 focus:ring-csc-dark"
                  />
                  <label htmlFor="gdpr_consent" className="text-xs text-white/70 font-medium cursor-pointer">
                    Aceita que os seus dados sejam processados pela política de proteção de dados (RGPD) do Grupo Dramático e Sportivo de Cascais.
                  </label>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={handleAttemptCloseFormModal}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-white/10 hover:bg-white/20 text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingDoc !== null}
                  className="flex-1 py-3 rounded-xl font-bold text-csc-dark bg-csc-gold hover:brightness-95 transition-colors shadow-md text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save size={16} className="text-csc-dark" />
                  <span>{isEditing ? 'Guardar Alterações' : 'Criar Membro'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* MODAL 2: DETALHES COMPLETOS DA FICHA DE ATLETA (DOSSIER PC & MOBILE).
          A condição usa só `selectedProfile` (nunca é limpo ao fechar) — a persiana
          controla a própria visibilidade por `isDetailModalOpen`, para poder deslizar
          para fora suavemente em vez de desaparecer no instante em que se fecha. */}
      {selectedProfile && (
        <VistaDetalhe
          isOpen={isDetailModalOpen}
          onClose={() => fecharFicha()}
          tone="dark"
          size="6xl"
          showCloseButton={false}
          ariaLabel={`Ficha de ${selectedProfile.name}`}
          voltarTexto="Voltar ao plantel"
          className="border-2 border-amber-400/40"
        >
          <div className="space-y-6">
            {/* Top Bar Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-csc-dark text-csc-gold font-black flex items-center justify-center text-lg shadow-sm border border-amber-300">
                  {selectedProfile.jersey_number ? `#${selectedProfile.jersey_number}` : '⚽'}
                </span>
                <div>
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/65 block">
                    Ficha Oficial de Atleta • Plantel CSC
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                    {selectedProfile.name}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Toggle Clínico Interativo para todos os perfis */}
                <button
                  type="button"
                  onClick={() => handleTogglePlayerClinicalStatus(selectedProfile)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border shadow-xs cursor-pointer active:scale-95 ${
                    selectedProfile.status === 'injured'
                      ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 animate-pulse ring-2 ring-red-200'
                      : selectedProfile.status === 'inactive'
                      ? 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 ring-2 ring-emerald-150'
                  }`}
                  title="Clique para alternar o estado de aptidão física (Apto / Lesionado)"
                >
                  <span>{selectedProfile.status === 'injured' ? '🔴' : selectedProfile.status === 'inactive' ? '⚪' : '🟢'}</span>
                  <span>{selectedProfile.status === 'injured' ? 'Lesionado' : selectedProfile.status === 'inactive' ? 'Inativo' : 'Apto'}</span>
                </button>

                {isCoachOrAdmin && (
                  <button
                    onClick={() => {
                      fecharFicha()
                      openEditModal(selectedProfile)
                    }}
                    className="px-3.5 py-1.5 bg-csc-gold text-csc-dark rounded-xl text-xs font-bold hover:brightness-95 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Edit2 size={13} />
                    <span className="hidden sm:inline">Editar Ficha</span>
                  </button>
                )}
                {/* Fechar a persiana — só no telemóvel: no desktop isto é uma página,
                    e quem volta atrás é a barra "Voltar ao plantel" da VistaDetalhe. */}
                <button
                  onClick={() => fecharFicha()}
                  aria-label="Fechar"
                  className="md:hidden w-9 h-9 rounded-full bg-white text-csc-dark hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-md border-2 border-white/40 shrink-0"
                  title="Fechar"
                >
                  <X size={18} className="stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Desktop 2-Column Grid (Traditional PC Dossier) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUNA ESQUERDA: Cartão de Identidade Desportiva + Campo Tático (lg:col-span-5 xl:col-span-4) */}
              <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                {/* Hero ID Card */}
                <div className="bg-gradient-to-br from-csc-dark via-csc-dark to-emerald-950 p-5 rounded-2xl border-2 border-amber-400/40 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-csc-gold/10 to-transparent pointer-events-none" />

                  {/* Photo with Gold Ring */}
                  <div className="relative mb-3 z-10">
                    {selectedProfile.photo_url ? (
                      <img
                        src={selectedProfile.photo_url}
                        alt={selectedProfile.name}
                        className="w-24 h-24 rounded-2xl object-cover border-2 border-csc-gold shadow-md"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-csc-dark to-emerald-900 text-white flex items-center justify-center font-black text-3xl shadow-md border-2 border-csc-gold">
                        {selectedProfile.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {selectedProfile.jersey_number && (
                      <span className="absolute -bottom-2 -right-2 bg-csc-dark text-csc-gold font-black text-xs px-2 py-0.5 rounded-lg border-2 border-white shadow-xs">
                        #{selectedProfile.jersey_number}
                      </span>
                    )}
                  </div>

                  <h3 className="font-black text-white text-lg leading-tight">
                    {selectedProfile.name}
                  </h3>

                  {selectedProfile.shirt_name && (
                    <p className="text-xs font-bold text-amber-300 mt-0.5">
                      Nome na Camisola: "{selectedProfile.shirt_name}"
                    </p>
                  )}

                  {/* Status clicável no cartão */}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePlayerClinicalStatus(selectedProfile)}
                      className={`text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-2xs cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                        selectedProfile.status === 'active' ? 'bg-green-100 text-green-800 border border-green-200 hover:bg-green-200' :
                        selectedProfile.status === 'injured' ? 'bg-red-100 text-red-800 border border-red-200 animate-pulse hover:bg-red-200' :
                        'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                      }`}
                      title="Clique para alternar o estado de aptidão física"
                    >
                      {selectedProfile.status === 'active' ? <CheckCircle2 size={12}/> :
                       selectedProfile.status === 'injured' ? <HeartPulse size={12}/> :
                       <XCircle size={12}/>}
                      <span>{selectedProfile.status === 'active' ? 'Apto' : selectedProfile.status === 'injured' ? 'Lesionado' : 'Inativo'}</span>
                    </button>
                  </div>

                  {/* Role Badges */}
                  <div className="flex flex-wrap justify-center gap-1 mt-3">
                    {extractRolesFromProfile(selectedProfile).map((r) => (
                      <span
                        key={r}
                        className={`text-[9.5px] font-black px-2 py-0.5 rounded border ${
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

                  {/* Quick Meta Pills */}
                  <div className="grid grid-cols-2 gap-2 w-full mt-4 pt-3 border-t border-white/10 text-xs">
                    <div className="bg-white/10 p-2 rounded-xl border border-white/10">
                      <span className="text-white/65 block text-[9px] uppercase font-bold">Equipamento</span>
                      <span className="font-extrabold text-white">Tam: {selectedProfile.kit_size || '-'}</span>
                    </div>
                    <div className="bg-white/10 p-2 rounded-xl border border-white/10">
                      <span className="text-white/65 block text-[9px] uppercase font-bold">Nº de Sócio</span>
                      <span className="font-extrabold text-white">{selectedProfile.member_number ? `#${selectedProfile.member_number}` : '-'}</span>
                    </div>
                  </div>

                  {/* Contact Buttons */}
                  <div className="w-full mt-3 space-y-1.5">
                    {selectedProfile.phone && (
                      <a
                        href={`tel:${selectedProfile.phone}`}
                        className="w-full py-2 px-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors"
                      >
                        <Phone size={13} className="text-csc-gold" />
                        <span>{selectedProfile.phone}</span>
                      </a>
                    )}
                    {selectedProfile.email && (
                      <a
                        href={`mailto:${selectedProfile.email}`}
                        className="w-full py-2 px-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors truncate"
                      >
                        <Mail size={13} className="text-csc-gold" />
                        <span className="truncate">{selectedProfile.email}</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Campo Tático — só para quem tem o papel de Jogador */}
                {extractRolesFromProfile(selectedProfile).includes('player') && (
                  <div className="bg-white/[0.07] p-4 rounded-2xl border border-white/10 border-t-white/20 shadow-md shadow-black/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                        <Shield size={14} className="text-csc-gold" />
                        <span>Posicionamento Tático</span>
                      </h4>
                      <span className="text-[10px] font-extrabold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                        {parsePositions(selectedProfile.position).join(', ') || 'Não definido'}
                      </span>
                    </div>

                    <SoccerPitchSelector
                      selectedPositions={parsePositions(selectedProfile.position)}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA: Dossier Completo Cadastral (lg:col-span-7 xl:col-span-8) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-4">
                
                {/* 1. Identificação & Dados Fiscais */}
                <div className="bg-white/[0.07] p-4 rounded-2xl border border-white/10 border-t-white/20 shadow-md shadow-black/20 space-y-3">
                  <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={14} className="text-csc-gold" />
                    <span>1. Identificação & Dados Fiscais</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nome Completo</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.name}</p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nome na Camisola</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.shirt_name || selectedProfile.nickname || '-'}</p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Data de Nascimento / Idade</p>
                      <p className="font-extrabold text-white mt-0.5">
                        {selectedProfile.birth_date ? (
                          `${new Date(selectedProfile.birth_date).toLocaleDateString('pt-PT')} (${calculateAge(selectedProfile.birth_date)} anos)`
                        ) : '-'}
                      </p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">NIF / Contribuinte</p>
                      <p className="font-extrabold text-white mt-0.5 font-mono">{selectedProfile.nif || '-'}</p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nº CC / Passaporte</p>
                      <p className="font-extrabold text-white mt-0.5 font-mono">{selectedProfile.id_number || '-'}</p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Validade do CC</p>
                      <p className="font-extrabold text-white mt-0.5">
                        {selectedProfile.id_card_expiry ? new Date(selectedProfile.id_card_expiry).toLocaleDateString('pt-PT') : '-'}
                      </p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nacionalidade</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.nationality || 'Portuguesa'}</p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nº de Sócio CSC</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.member_number ? `Sócio nº ${selectedProfile.member_number}` : '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 2. Morada & Residência */}
                <div className="bg-white/[0.07] p-4 rounded-2xl border border-white/10 border-t-white/20 shadow-md shadow-black/20 space-y-3">
                  <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-csc-gold" />
                    <span>2. Morada & Residência</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Morada (Rua / Edifício / Andar)</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.address || 'Não registada'}</p>
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Código Postal & Localidade</p>
                      <p className="font-extrabold text-white mt-0.5">
                        {selectedProfile.postal_code || '-'} {selectedProfile.city ? `• ${selectedProfile.city}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Dados Bancários (Débito Direto) */}
                <div className="bg-white/[0.07] p-4 rounded-2xl border border-white/10 border-t-white/20 shadow-md shadow-black/20 space-y-3">
                  <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield size={14} className="text-csc-gold" />
                    <span>3. Dados Bancários & Quotas</span>
                  </h4>

                  <div className="bg-white/10 p-3 rounded-xl border border-white/10 border-t-white/20 shadow-sm shadow-black/10 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-white/65 font-bold uppercase text-[9px]">IBAN (Débito Direto de Quotas)</p>
                      <p className="font-black text-white font-mono text-xs sm:text-sm mt-0.5">
                        {selectedProfile.iban || 'Nenhum IBAN registado'}
                      </p>
                    </div>
                    {selectedProfile.iban && (
                      <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded">
                        ✓ Ativo
                      </span>
                    )}
                  </div>
                </div>

                {/* 4. Saúde & Contacto de Emergência */}
                <div className="bg-red-500/10 p-4 rounded-2xl border border-red-400/30 space-y-3">
                  <h4 className="text-xs font-black text-red-200 uppercase tracking-wider flex items-center gap-1.5">
                    <HeartPulse size={14} className="text-red-400" />
                    <span>4. Saúde & Contacto de Emergência</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white/10 p-3 rounded-xl border border-red-400/20">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Contacto de Emergência</p>
                      <p className="font-extrabold text-white mt-0.5">
                        {selectedProfile.emergency_contact_name || 'Não registado'}
                      </p>
                      {selectedProfile.emergency_contact_phone && (
                        <p className="text-white/60 font-semibold mt-0.5">
                          Tel: {selectedProfile.emergency_contact_phone}
                        </p>
                      )}
                    </div>

                    <div className="bg-white/10 p-3 rounded-xl border border-red-400/20">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Notas Médicas / Alergias</p>
                      <p className="font-medium text-white/80 mt-0.5">
                        {cleanNotesFromRolesTag(selectedProfile.medical_notes) || 'Nenhuma restrição médica registada'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 5. Documentos Anexados & RGPD */}
                <div className="bg-white/[0.07] p-4 rounded-2xl border border-white/10 border-t-white/20 shadow-md shadow-black/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} className="text-csc-gold" />
                      <span>5. Documentação Oficial & RGPD</span>
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 flex items-center gap-1">
                      <CheckCircle2 size={11} /> RGPD Consentido
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {selectedProfile.id_document_url ? (
                      <a
                        href={selectedProfile.id_document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-blue-700 font-bold hover:bg-blue-100 transition-colors text-center"
                      >
                        <FileText size={18} />
                        <span>Doc. Identificação</span>
                        <span className="text-[10px] underline flex items-center gap-0.5">Abrir Documento <ExternalLink size={10}/></span>
                      </a>
                    ) : (
                      <div className="p-3 bg-white/5 border border-dashed border-white/15 rounded-xl flex flex-col items-center justify-center gap-1 text-white/60 text-center">
                        <FileText size={18} />
                        <span>Sem CC Anexado</span>
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
                        <span className="text-[10px] underline flex items-center gap-0.5">Abrir Apólice <ExternalLink size={10}/></span>
                      </a>
                    ) : (
                      <div className="p-3 bg-white/5 border border-dashed border-white/15 rounded-xl flex flex-col items-center justify-center gap-1 text-white/60 text-center">
                        <Shield size={18} />
                        <span>Sem Seguro Anexado</span>
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
                        <span className="text-[10px] underline flex items-center gap-0.5">Abrir Exame <ExternalLink size={10}/></span>
                      </a>
                    ) : (
                      <div className="p-3 bg-white/5 border border-dashed border-white/15 rounded-xl flex flex-col items-center justify-center gap-1 text-white/60 text-center">
                        <HeartPulse size={18} />
                        <span>Sem Atestado Anexado</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Actions Footer */}
            <div className="pt-4 border-t border-white/10 flex flex-wrap justify-between items-center gap-3">
              {isAdmin && selectedProfile?.id && (
                linkedProfileIds.has(selectedProfile.id) ? (
                  <span className="px-4 py-2.5 bg-sky-50 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                    <UserCheck size={15} />
                    <span>Tem Conta de Login Associada</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const profileToAssociate = selectedProfile
                      fecharFicha()
                      openAssociateModal(profileToAssociate)
                    }}
                    className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Link2 size={15} />
                    <span>Fundir com Outra Ficha</span>
                  </button>
                )
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => fecharFicha()}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                {isCoachOrAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      fecharFicha()
                      openEditModal(selectedProfile)
                    }}
                    className="px-5 py-2.5 bg-csc-gold hover:brightness-95 text-csc-dark rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Edit2 size={14} />
                    <span>Editar Ficha</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        </VistaDetalhe>
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
            <div
              ref={painelAssociarRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="associar-utilizador-titulo"
              tabIndex={-1}
              className="bg-csc-dark text-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl border border-white/10 outline-none"
            >
              <button
                onClick={() => {
                  setAssociatingPlayer(null)
                  setSelectedUserToAssociate(null)
                }}
                aria-label="Fechar"
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white text-csc-dark hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-md border-2 border-white/40"
              >
                <X size={18} className="stroke-[2.5]" />
              </button>

              {/* Cabeçalho */}
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2.5 bg-blue-100 rounded-xl text-blue-700">
                  <Link2 size={22} />
                </div>
                <div>
                  <h3 id="associar-utilizador-titulo" className="text-lg font-black text-white">
                    Fundir Ficha de {associatingPlayer.name}
                  </h3>
                  <p className="text-xs text-white/70 font-medium">
                    Junta esta ficha a outra — os dados em falta na que ficar são preenchidos a partir da outra, e a que sobra é apagada
                  </p>
                </div>
              </div>

              {/* Informação do Jogador Atual */}
              <div className="mt-4 p-3.5 bg-white/5 rounded-xl border border-white/10 text-xs flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">{associatingPlayer.name} {associatingPlayer.nickname ? `("${associatingPlayer.nickname}")` : ''}</p>
                  <p className="text-white/70 mt-0.5 font-medium">Email na ficha: <strong className="text-white/80">{associatingPlayer.email}</strong></p>
                  {associatingPlayer.phone && <p className="text-white/70 font-medium">Tel: <strong className="text-white/80">{associatingPlayer.phone}</strong></p>}
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-csc-gold text-csc-dark rounded">
                  Sem Conta de Login
                </span>
              </div>

              {/* 1. Sugestões Automáticas / Coincidências Encontradas */}
              {potentialMatches.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-300">
                    <Sparkles size={16} className="text-emerald-400" />
                    <span>Coincidência Automática Detetada por Email/Contacto!</span>
                  </div>
                  {potentialMatches.map(match => {
                    const matchTemConta = linkedProfileIds.has(match.id)
                    return (
                      <div
                        key={match.id}
                        className="p-3.5 bg-green-50/80 border-2 border-green-400 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                      >
                        <div className="text-xs">
                          <p className="font-bold text-green-950 text-sm">{match.name}</p>
                          <p className="text-green-800 font-medium">{match.email}</p>
                          {match.phone && <p className="text-green-700 text-[11px]">Tel: {match.phone}</p>}
                          <p className="text-green-700 text-[10px] font-bold mt-0.5">
                            {matchTemConta ? '✓ Tem conta de login — vai ser a ficha que fica' : 'Sem conta de login'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={associatingLoading}
                          onClick={() => handleConfirmAssociate(associatingPlayer, match, !matchTemConta)}
                          className="px-3.5 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs shrink-0 flex items-center gap-1"
                        >
                          <UserCheck size={14} />
                          <span>Fundir Imediatamente</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 2. Pesquisa e Seleção de Outro Utilizador Registado */}
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-white/80 uppercase tracking-wider">
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
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white text-gray-900"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 border border-white/10 rounded-xl p-2 bg-white/5">
                  {otherUsers.length === 0 ? (
                    <p className="text-center py-6 text-xs text-white/65 font-medium">
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
                              : 'border-white/10 hover:border-white/20 hover:bg-white/10 bg-white/5'
                          }`}
                        >
                          <div>
                            <p className="font-bold text-white">{user.name}</p>
                            <p className="text-white/70 text-[11px]">{user.email} {user.phone ? `• ${user.phone}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60 capitalize">
                              {user.role}
                            </span>
                            {isSelected && <Check size={16} className="text-csc-gold font-black" />}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 3. Qual ficha deve prevalecer — só há escolha real quando a
                  ficha selecionada também não tem conta: se tiver, é sempre
                  ela que fica (é a única com sessão iniciada). */}
              {selectedUserToAssociate && (() => {
                const alvoTemConta = linkedProfileIds.has(selectedUserToAssociate.id)
                const manterA = alvoTemConta ? false : survivorSide === 'ficha'
                return (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-xs font-black text-white/80 uppercase tracking-wider">
                      Qual ficha deve prevalecer?
                    </h4>
                    {alvoTemConta ? (
                      <p className="text-[11px] text-white/70 bg-white/5 border border-white/10 rounded-lg p-2.5">
                        "{selectedUserToAssociate.name}" tem conta de login própria — vai ser sempre essa a ficha que fica; "{associatingPlayer.name}" fecha e os dados em falta em "{selectedUserToAssociate.name}" são preenchidos a partir dela.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSurvivorSide('ficha')}
                          className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                            survivorSide === 'ficha'
                              ? 'border-csc-gold bg-csc-gold/15 ring-2 ring-csc-gold/50'
                              : 'border-white/10 bg-white/5 hover:border-white/30'
                          }`}
                        >
                          <p className="font-bold text-white truncate">{associatingPlayer.name}</p>
                          <p className="text-white/60 text-[10px]">Sem conta de login</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSurvivorSide('selecionado')}
                          className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                            survivorSide === 'selecionado'
                              ? 'border-csc-gold bg-csc-gold/15 ring-2 ring-csc-gold/50'
                              : 'border-white/10 bg-white/5 hover:border-white/30'
                          }`}
                        >
                          <p className="font-bold text-white truncate">{selectedUserToAssociate.name}</p>
                          <p className="text-white/60 text-[10px]">Sem conta de login</p>
                        </button>
                      </div>
                    )}

                    {/* Botões do Rodapé */}
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAssociatingPlayer(null)
                          setSelectedUserToAssociate(null)
                        }}
                        className="px-4 py-2 border border-white/15 rounded-lg text-xs font-bold text-white hover:bg-white/10"
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        disabled={associatingLoading}
                        onClick={() => handleConfirmAssociate(associatingPlayer, selectedUserToAssociate, manterA)}
                        className="px-4 py-2 bg-csc-gold hover:brightness-95 text-csc-dark rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md disabled:opacity-50"
                      >
                        <UserCheck size={15} />
                        <span>{associatingLoading ? 'A fundir...' : `Fundir — fica "${manterA ? associatingPlayer.name : selectedUserToAssociate.name}"`}</span>
                      </button>
                    </div>
                  </div>
                )
              })()}

              {!selectedUserToAssociate && (
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAssociatingPlayer(null)
                      setSelectedUserToAssociate(null)
                    }}
                    className="px-4 py-2 border border-white/15 rounded-lg text-xs font-bold text-white hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* MODAL: CONFIRMAÇÃO DE SAÍDA COM ALTERAÇÕES NÃO GUARDADAS */}
      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        onSaveAndExit={async () => {
          setIsUnsavedModalOpen(false)
          const fakeEvent = { preventDefault: () => {} } as React.FormEvent
          await handleSaveMember(fakeEvent)
        }}
        onExitWithoutSaving={() => {
          setIsUnsavedModalOpen(false)
          setIsFormModalOpen(false)
          resetForm()
        }}
        onCancel={() => setIsUnsavedModalOpen(false)}
      />

      {/* Modal Genérico de Confirmação (Estilo Unificado e Elegante) */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        confirmText={confirmModalConfig.confirmText}
        cancelText={confirmModalConfig.cancelText}
        variant={confirmModalConfig.variant}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}

export default TeamManagementPage
