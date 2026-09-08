import React, { useEffect, useState } from 'react'
import { 
  Users, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Phone,
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
  SlidersHorizontal,
  ClipboardList,
  Landmark,
  User as UserIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth, extractRolesFromProfile, cleanNotesFromRolesTag } from '../context/AuthContext'
import type { Profile, UserRole, ProfileStatus } from '../context/AuthContext'
import SoccerPitchSelector, { parsePositions, normalizePositionName } from '../components/SoccerPitchSelector'
import { VistaDetalhe } from '../components/VistaDetalhe'
import { useSearchParams } from 'react-router-dom'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { toast } from '../context/ToastContext'
import { useModalA11y } from '../hooks/useModalA11y'
import { CLUBE_NOME } from '../lib/clube'
import { BottomSheet } from '../components/BottomSheet'
import { CabecalhoEcra, Pastilha, Botao } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import {
  getSeasonLabel,
  getSeasonMonths,
  comOmissoes,
  nomeMes,
  DEFAULT_FINANCIAL_SETTINGS,
  type FinancialSettings,
} from '../lib/finance'

/** As abreviaturas dos meses, para as pastilhas de quota dispensada. */
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Campo e etiqueta dos formulários, o mesmo desenho do resto da app. */
const CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ETIQUETA =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5'

/** Como se lê cada filtro escondido, na linha de resumo. */
const ROTULOS_ESTADO: Record<string, string> = {
  active: 'Aptos',
  injured: 'Lesionados',
  inactive: 'Inativos',
}

const ROTULOS_ORDEM: Record<string, string> = {
  jga: 'por J · G · A',
  nome: 'por nome',
}

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
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  /* O handoff ordena o plantel por número; a ordenação por nome era a única
     que existia e continua à mão de quem a preferir. */
  const [ordem, setOrdem] = useState<'numero' | 'jga' | 'nome'>('numero')
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    return (localStorage.getItem('csc_team_view_mode') as 'list' | 'cards') || 'list'
  })

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [formQuotaStart, setFormQuotaStart] = useState('')
  const [formQuotaEnd, setFormQuotaEnd] = useState('')
  const [formMesesDispensados, setFormMesesDispensados] = useState<string[]>([])

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

  /*
    Jogos, golos e assistências por atleta — a coluna "J · G · A" do ecrã 3a.
    Uma linha de `stats` é um jogo em que o atleta entrou, que é a mesma
    contagem que a página de Estatísticas faz; aqui só se soma por jogador,
    sem filtro de prova, porque a lista do plantel é da época toda.
  */
  /* A época do clube vive nas definições financeiras — está lá porque foi lá
     que primeiro fez falta, mas é a época do clube. Ver a mesma nota na Home. */
  const [epoca, setEpoca] = useState<string>('')
  /* As definições inteiras, e não só a época: o bloco de quotas da ficha
     precisa do mês em que a época começa e dos meses que o clube inteiro não
     paga, para ordenar as pastilhas e bloquear as que não são escolha de
     ninguém. */
  const [defFinanceiras, setDefFinanceiras] = useState<FinancialSettings>(DEFAULT_FINANCIAL_SETTINGS)
  useEffect(() => {
    supabase.from('financial_settings').select('*').maybeSingle().then(({ data }) => {
      const definicoes = comOmissoes(data)
      setDefFinanceiras(definicoes)
      setEpoca(getSeasonLabel(definicoes))
    })
  }, [])

  const [estatisticas, setEstatisticas] = useState<Record<string, { j: number; g: number; a: number }>>({})
  useEffect(() => {
    supabase
      .from('stats')
      .select('player_id, goals, assists')
      .then(({ data, error }) => {
        if (error || !data) return
        const porJogador: Record<string, { j: number; g: number; a: number }> = {}
        for (const linha of data as { player_id: string; goals: number | null; assists: number | null }[]) {
          const atual = porJogador[linha.player_id] ?? { j: 0, g: 0, a: 0 }
          atual.j += 1
          atual.g += linha.goals || 0
          atual.a += linha.assists || 0
          porJogador[linha.player_id] = atual
        }
        setEstatisticas(porJogador)
      })
  }, [])

  // Quais fichas têm conta de login associada — só o admin precisa de saber,
  // para o merge de fichas nunca poder apagar o lado que tem sessão.
  const [linkedProfileIds, setLinkedProfileIds] = useState<Set<string>>(new Set())

  /*
    As contas de login que não correspondem a pessoa nenhuma do clube (ecrã 3d).
    Só o admin as pode ler: a RPC recusa a quem não for.

    Chamava-se "contas sem atleta", e isso estava errado nas duas pontas:
    `profiles` são as **pessoas** do clube — há quem jogue, quem jogue e treine,
    e quem não jogue de todo —, e uma ficha sem camisola nem posição pode ser
    simplesmente a de um treinador. A condição está agora em
    `supabase_contas_por_ligar_migration.sql` e olha só para colunas que o
    próprio não pode escrever.
  */
  const [contasPorLigar, setContasPorLigar] = useState<
    { id: string; name: string | null; email: string | null; photo_url: string | null; created_at: string | null }[]
  >([])
  useEffect(() => {
    if (!isAdmin) return
    supabase.rpc('admin_contas_por_ligar').then(({ data, error }) => {
      if (error) {
        console.error('Erro ao carregar as contas por ligar:', error.message)
        return
      }
      setContasPorLigar((data as typeof contasPorLigar) ?? [])
    })
  }, [isAdmin])
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
    setFormQuotaStart('')
    setFormQuotaEnd('')
    setFormMesesDispensados([])
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
    setFormQuotaStart(p.quota_start_date || '')
    setFormQuotaEnd(p.quota_end_date || '')
    /* Os meses dispensados vivem noutra tabela; lêem-se ao abrir a ficha. */
    setFormMesesDispensados([])
    supabase
      .from('quota_exemptions')
      .select('month_year')
      .eq('profile_id', p.id)
      .then(({ data }) => {
        setFormMesesDispensados(
          ((data ?? []) as { month_year: string }[]).map(l => l.month_year.slice(-2)),
        )
      })
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
      toast.success(newStatus === 'injured' ? 'Atleta marcado como lesionado.' : 'Atleta marcado como apto.')
    } catch (err: any) {
      toast.error('Erro ao atualizar estado físico: ' + (err.message || 'Erro desconhecido'))
    }
  }

  /*
    Os meses dispensados de quota vivem em `quota_exemptions`, uma linha por
    mês. Apaga-se o que lá está e escreve-se o que ficou escolhido: são no
    máximo doze linhas por atleta, e um diff seria mais código do que vale.

    O `month_year` da tabela é 'AAAA-MM' e a dispensa é para todos os anos —
    grava-se com o ano 0000, que nenhuma época usa, e lê-se só o mês. Se um
    dia fizer falta dispensar um mês de um ano em concreto, a coluna já lá
    está para isso.
  */
  const guardarMesesDispensados = async (profileId: string) => {
    /* Só a direção escreve em `quota_exemptions` (RLS). As pastilhas já estão
       bloqueadas para os outros; isto é a segunda linha, para nunca sair daqui
       um DELETE que a política deixa passar em silêncio a apagar zero linhas. */
    if (!isAdmin) return
    const { error: apagou } = await supabase.from('quota_exemptions').delete().eq('profile_id', profileId)
    if (apagou) throw apagou
    if (formMesesDispensados.length === 0) return
    const { error } = await supabase.from('quota_exemptions').insert(
      formMesesDispensados.map(mes => ({ profile_id: profileId, month_year: `0000-${mes}` })),
    )
    if (error) throw error
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
      quota_start_date: sanitizeDate(formQuotaStart),
      quota_end_date: sanitizeDate(formQuotaEnd),
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
        await guardarMesesDispensados(formId)
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
      description: `Vais fundir "${apagar.name}" em "${manter.name}": os dados em falta em "${manter.name}" são preenchidos a partir de "${apagar.name}", todo o histórico (convocatórias e respostas, estatísticas, quotas, encargos, seguros) passa para "${manter.name}", e a ficha "${apagar.name}" é apagada. Tens a certeza?`,
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

  /*
    Sugestões de ligação para a direção (ecrã 3d).

    **Só por email.** Procurava também por telefone e por primeiro-e-último
    nome, e isso é adivinhar: ligar duas fichas apaga uma delas, e dois
    homónimos — ou um número de telefone reaproveitado — davam uma sugestão que
    parecia certa e destruía dados. A identidade de uma pessoa neste clube é o
    endereço de email, como na
    `supabase_identidade_por_email_migration.sql`.

    Por isto raramente aparece alguma coisa, e é assim que deve ser: quando o
    email bate certo, o `AuthContext` já ligou sozinho no arranque. Sobra o caso
    em que a ficha foi criada **depois** de a pessoa se registar. Quando o email
    não bate, não há sugestão nenhuma a fazer — é a direção que decide, à mão,
    na lista de baixo.
  */
  const associationSuggestions = React.useMemo(() => {
    if (!isAdmin) return []
    const registeredUsersWithoutKit = profiles.filter(p => linkedProfileIds.has(p.id) && (!p.jersey_number || !p.kit_size))
    const unlinkedSquadProfiles = profiles.filter(p => !linkedProfileIds.has(p.id))

    const suggestions: { user: Profile; player: Profile }[] = []

    registeredUsersWithoutKit.forEach(userP => {
      const uEmail = (userP.email || '').toLowerCase().trim()
      if (!uEmail) return

      const match = unlinkedSquadProfiles.find(
        squadP => (squadP.email || '').toLowerCase().trim() === uEmail,
      )

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

  /*
    A ordem por que a lista sai. O handoff (3a) põe o plantel por número de
    camisola; quem não tem número vai para o fim, senão os sem número ficavam
    todos à cabeça.
  */
  const jga = (id: string) => estatisticas[id] ?? { j: 0, g: 0, a: 0 }
  filteredProfiles.sort((a, b) => {
    if (ordem === 'nome') return (a.name || '').localeCompare(b.name || '')
    if (ordem === 'jga') {
      const ea = jga(a.id)
      const eb = jga(b.id)
      if (eb.g !== ea.g) return eb.g - ea.g
      if (eb.a !== ea.a) return eb.a - ea.a
      return eb.j - ea.j
    }
    const na = a.jersey_number ?? 999
    const nb = b.jersey_number ?? 999
    if (na !== nb) return na - nb
    return (a.name || '').localeCompare(b.name || '')
  })

  /*
    Os inativos vão para o fim, num bloco à parte (ecrã 3a): já não jogam, e
    misturados por número faziam saltar a numeração da lista de quem joga.
    Quando o filtro é justamente "Inativos", não se separa nada — seria uma
    lista vazia com um cabeçalho por baixo.
  */
  const separarInativos = statusFilter === 'all'
  const perfisAtivos = separarInativos ? filteredProfiles.filter(p => p.status !== 'inactive') : filteredProfiles
  const perfisInativos = separarInativos ? filteredProfiles.filter(p => p.status === 'inactive') : []

  /** O que a persiana esconde, para o funil acender e o resumo dizê-lo. */
  const temFiltros =
    searchTerm.trim() !== '' ||
    statusFilter !== 'all' ||
    positionFilter !== 'all' ||
    ordem !== 'numero'

  const resumoFiltros = [
    searchTerm.trim() ? `"${searchTerm.trim()}"` : null,
    statusFilter !== 'all' ? ROTULOS_ESTADO[statusFilter] : null,
    positionFilter !== 'all' ? positionFilter : null,
    ordem !== 'numero' ? ROTULOS_ORDEM[ordem] : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Filtrado'

  const limparFiltros = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setPositionFilter('all')
    setOrdem('numero')
  }

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
      <div className="space-y-6">
      {/*
        Cabeçalho do Plantel (ecrã 3a): a sobrancelha conta o plantel e diz a
        época, e a ação de adicionar é um botão redondo ao lado do título em
        vez de uma barra própria em cima de tudo.
      */}
      <CabecalhoEcra
        titulo="Plantel"
        /* Só a contagem: com a época atrás, a sobrancelha não cabia ao lado
           do canto do cabeçalho e saía cortada a meio do ano. */
        sobrancelha={`${totalCount} ${totalCount === 1 ? 'membro' : 'membros'}`}
        className="mb-1"
        acoes={isCoachOrAdmin ? (
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); openCreateModal() }}
            aria-label="Adicionar membro ao plantel"
            className="w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center shrink-0 cursor-pointer
              transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <Plus size={19} />
          </button>
        ) : undefined}
      />

      {/* Banner de Sugestões Inteligentes de Fusão de Fichas — só admin, que é
          quem pode chamar admin_merge_profiles */}
      {isAdmin && associationSuggestions.length > 0 && (
        <div className="cartao-simples bg-csc-gold/10 border-csc-gold/30 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-csc-gold shrink-0" />
            <h3 className="font-display font-extrabold text-[9.5px] tracking-[0.14em] uppercase text-csc-gold">
              Mesmo email, por ligar ({associationSuggestions.length})
            </h3>
          </div>

          <div className="space-y-2">
            {associationSuggestions.map(({ user: u, player: pl }, idx) => (
              <div key={idx} className="bg-white/5 border border-white/10 p-3 rounded-2xl flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <p className="font-display font-bold text-[12px] text-white truncate">
                    {u.name} <span className="text-white/62 font-normal">{u.email}</span>
                  </p>
                  <p className="text-[10.5px] text-csc-gold font-bold truncate mt-0.5">
                    nº {pl.jersey_number} {pl.name}{pl.shirt_name ? ` (${pl.shirt_name})` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={associatingLoading}
                  onClick={() => handleConfirmAssociate(pl, u, false)}
                  className="min-h-11 px-3.5 rounded-[18px] bg-csc-gold text-csc-tinta font-display font-extrabold text-[11px]
                    flex items-center gap-1.5 shrink-0 cursor-pointer transition-transform duration-150 active:scale-97
                    disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  <Link2 size={13} />
                  <span>Ligar</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        Os três mosaicos de estado (ecrã 3a), que também são o filtro. O
        "Total" saiu: era o quarto mosaico e é a soma dos outros três — e com
        quatro numa coluna de 480px cada um ficava com 100px. Toca-se outra vez
        no mosaico aceso para voltar a ver todos.
      */}
      <div className="grid grid-cols-3 gap-2">
        {([
          ['active', 'Aptos', activeCount, 'text-csc-verde-texto', 'bg-csc-light/18 border-csc-light/45'],
          ['injured', 'Lesionados', injuredCount, 'text-csc-vermelho-texto', 'bg-csc-red/16 border-csc-red/40'],
          ['inactive', 'Inativos', inactiveCount, 'text-white/60', 'bg-white/12 border-white/25'],
        ] as const).map(([valor, etiqueta, contagem, cor, fundoAtivo]) => {
          const ativo = statusFilter === valor
          return (
            <button
              key={valor}
              type="button"
              onClick={() => { triggerHaptic('selection'); setStatusFilter(ativo ? 'all' : valor) }}
              aria-pressed={ativo}
              className={`min-h-14 px-2.5 py-2.5 rounded-2xl border text-left cursor-pointer
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                  ativo ? fundoAtivo : 'bg-white/5 border-white/10'
                }`}
            >
              <span className={`block font-display font-extrabold text-[8px] tracking-[0.1em] uppercase leading-tight ${cor}`}>
                {etiqueta}
              </span>
              <span className="block font-display font-extrabold text-[19px] text-white mt-1 tabular-nums">
                {contagem}
              </span>
            </button>
          )
        })}
      </div>

      {/* Procurar, e a ordem por que a lista sai. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" />
          <input
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Procurar no plantel"
            aria-label="Procurar no plantel"
            className={`${CAMPO} pl-9.5`}
          />
        </div>
        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setFiltrosAbertos(true) }}
          aria-label={temFiltros ? 'Filtros e apresentação (ativos)' : 'Filtros e apresentação'}
          className={`w-11 h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
              temFiltros
                ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                : 'bg-white/10 border-white/15 text-white/75'
            }`}
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {temFiltros && (
        <button
          type="button"
          onClick={limparFiltros}
          className="cartao-simples w-full min-h-11 flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer
            bg-csc-gold/10 border-csc-gold/30 transition-transform duration-150 active:scale-97"
        >
          <SlidersHorizontal size={14} className="text-csc-gold shrink-0" />
          <span className="flex-1 font-display font-bold text-[11px] text-white/80">
            {resumoFiltros} · {filteredProfiles.length} {filteredProfiles.length === 1 ? 'membro' : 'membros'}
          </span>
          <span className="font-display font-bold text-[11px] text-csc-gold">Limpar</span>
        </button>
      )}

      <BottomSheet
        isOpen={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        title="Plantel"
        description="Como filtrar e como ordenar"
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
            <SlidersHorizontal size={17} />
          </div>
        }
        footer={
          <>
            <Botao aparencia="vidro" onClick={limparFiltros} disabled={!temFiltros}>
              Limpar
            </Botao>
            <Botao onClick={() => setFiltrosAbertos(false)}>
              Ver {filteredProfiles.length} {filteredProfiles.length === 1 ? 'membro' : 'membros'}
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={ETIQUETA} htmlFor="plantel-posicao">Posição</label>
            <select
              id="plantel-posicao"
              value={positionFilter}
              onChange={e => setPositionFilter(e.target.value)}
              className={CAMPO}
            >
              <option value="all">Todas as posições</option>
              {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>
          </div>

          <div>
            <p className={ETIQUETA}>Ordenar por</p>
            <div className="flex flex-wrap gap-2">
              {([
                ['numero', 'Número'],
                ['jga', 'J · G · A'],
                ['nome', 'Nome'],
              ] as const).map(([valor, etiqueta]) => (
                <Pastilha
                  key={valor}
                  ativa={ordem === valor}
                  onClick={() => { triggerHaptic('selection'); setOrdem(valor) }}
                >
                  {etiqueta}
                </Pastilha>
              ))}
            </div>
          </div>

          <div>
            <p className={ETIQUETA}>Apresentação</p>
            <div className="flex flex-wrap gap-2">
              <Pastilha
                ativa={viewMode === 'list'}
                onClick={() => {
                  triggerHaptic('selection')
                  setViewMode('list')
                  localStorage.setItem('csc_team_view_mode', 'list')
                }}
              >
                <List size={14} />
                Lista
              </Pastilha>
              <Pastilha
                ativa={viewMode === 'cards'}
                onClick={() => {
                  triggerHaptic('selection')
                  setViewMode('cards')
                  localStorage.setItem('csc_team_view_mode', 'cards')
                }}
              >
                <LayoutGrid size={14} />
                Cartas
              </Pastilha>
            </div>
          </div>
        </div>
      </BottomSheet>

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
        /*
          Lista do plantel (ecrã 3a): número, alcunha, nome, posições e a
          coluna J · G · A. Cada linha é um `button` — abre a ficha, e quem
          navega por teclado tem de lá chegar (ver a convenção no CLAUDE.md).

          As ações de gestão saíram da linha. Eram quatro alvos de 15px dentro
          de uma linha que já era um alvo, e o dedo acertava na ficha quando
          queria editar; agora vivem na ficha do atleta, que é onde o handoff
          as põe (3b, "Gestão do atleta"). Fica na linha só a pastilha de
          estado, que o treinador usa a toda a hora para marcar um lesionado.
        */
        <div className="space-y-4">
          {([
            ['', perfisAtivos],
            ['Inativos', perfisInativos],
          ] as const).map(([titulo, grupo]) => (
            grupo.length === 0 ? null : (
              <div key={titulo || 'plantel'} className="space-y-2">
                {titulo && (
                  <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 pt-1">
                    {titulo}
                  </p>
                )}

                {grupo.map(person => {
                  const roles = extractRolesFromProfile(person)
                  // Sem o papel de Jogador não há posições a mostrar — sem isto, o valor por
                  // omissão de parsePositions(null) mostrava sempre "Médio Defensivo".
                  const positions = roles.includes('player') ? parsePositions(person.position) : []
                  const e = jga(person.id)
                  const inativo = person.status === 'inactive'
                  const nomeCurto = person.shirt_name || person.nickname || person.name

                  return (
                    <div key={person.id} className="cartao-simples flex items-stretch overflow-hidden">
                      <button
                        type="button"
                        onClick={() => { triggerHaptic('light'); openDetailModal(person) }}
                        aria-label={`Ver a ficha de ${person.name}`}
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer
                          transition-transform duration-150 active:scale-[0.99]
                          focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold"
                      >
                        <span className="w-8 h-8 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 text-csc-gold font-display font-extrabold text-[11px] flex items-center justify-center shrink-0 tabular-nums">
                          {person.jersey_number ?? '–'}
                        </span>

                        {person.photo_url ? (
                          <img
                            src={person.photo_url}
                            alt=""
                            className="w-9 h-9 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <span className="w-9 h-9 rounded-xl bg-white/10 text-white/60 flex items-center justify-center font-display font-black text-[13px] shrink-0">
                            {(person.name || '?').charAt(0).toUpperCase()}
                          </span>
                        )}

                        <span className="flex-1 min-w-0">
                          <span className="block font-display font-black text-[13px] text-white truncate">
                            {nomeCurto}
                          </span>
                          <span className="block text-[10px] text-white/62 truncate mt-0.5">
                            {nomeCurto === person.name ? '' : `${person.name} · `}
                            {positions.length > 0
                              ? positions.map(pos => normalizePositionName(pos)).join(' · ')
                              : roles.includes('coach') ? 'Treinador' : roles.includes('admin') ? 'Direção' : ''}
                          </span>
                        </span>

                        {/* J · G · A — os inativos não jogaram esta época. */}
                        {inativo ? (
                          <span className="text-[9.5px] text-white/35 italic shrink-0">sem jogos</span>
                        ) : (
                          <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
                            <span className="font-display font-bold text-[11px] text-white/62">{e.j}<span className="text-white/30">J</span></span>
                            <span className="font-display font-black text-[11px] text-csc-gold">{e.g}<span className="opacity-60">G</span></span>
                            <span className="font-display font-black text-[11px] text-csc-azul-texto">{e.a}<span className="opacity-60">A</span></span>
                          </span>
                        )}
                      </button>

                      {/* O estado é o único botão que fica na linha: é o que o
                          treinador carrega a toda a hora. */}
                      <button
                        type="button"
                        onClick={e2 => handleTogglePlayerClinicalStatus(person, e2)}
                        disabled={!isCoachOrAdmin}
                        aria-label={`${person.name} está ${person.status === 'active' ? 'apto' : person.status === 'injured' ? 'lesionado' : 'inativo'}${isCoachOrAdmin ? '. Alternar entre apto e lesionado' : ''}`}
                        title={isCoachOrAdmin ? 'Alternar entre apto e lesionado' : undefined}
                        className={`w-11 flex items-center justify-center shrink-0 border-l border-white/8
                          transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${
                            isCoachOrAdmin ? 'cursor-pointer active:scale-97' : 'cursor-default'
                          } ${
                            person.status === 'active' ? 'text-csc-verde-texto'
                              : person.status === 'injured' ? 'text-csc-vermelho-texto'
                              : 'text-white/35'
                          }`}
                      >
                        {person.status === 'active' ? <CheckCircle2 size={16} />
                          : person.status === 'injured' ? <HeartPulse size={16} />
                          : <XCircle size={16} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          ))}
        </div>
      ) : (
        /*
          Vista em cartas. Não está no handoff — que tem só a lista — mas é o
          que a app já dava e foi decidido mantê-la, agora escolhida na
          persiana de filtros em vez de num alternador sempre à vista.

          Duas colunas, e não `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`:
          os pontos de corte do Tailwind estão desligados nesta app, e olhavam
          para a janela e não para a coluna de 480px.
        */
        <div className="space-y-4">
          {([
            ['', perfisAtivos],
            ['Inativos', perfisInativos],
          ] as const).map(([titulo, grupo]) => (
            grupo.length === 0 ? null : (
              <div key={titulo || 'plantel'} className="space-y-2">
                {titulo && (
                  <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 pt-1">
                    {titulo}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  {grupo.map(person => {
                    const roles = extractRolesFromProfile(person)
                    // Sem o papel de Jogador não há posições a mostrar — sem isto, o valor por
                    // omissão de parsePositions(null) mostrava sempre "Médio Defensivo".
                    const positions = roles.includes('player') ? parsePositions(person.position) : []
                    const e = jga(person.id)

                    return (
                      <div
                        key={person.id}
                        className={`cartao-simples overflow-hidden flex flex-col ${
                          person.status === 'injured' ? 'border-csc-red/35' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => { triggerHaptic('light'); openDetailModal(person) }}
                          aria-label={`Ver a ficha de ${person.name}`}
                          className="flex-1 p-3 flex flex-col items-center text-center gap-2 cursor-pointer
                            transition-transform duration-150 active:scale-[0.99]
                            focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold"
                        >
                          <span className="w-full flex items-center justify-between">
                            <span className="font-display font-black text-[15px] text-csc-gold tabular-nums">
                              {person.jersey_number ? `#${person.jersey_number}` : '–'}
                            </span>
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                person.status === 'active' ? 'bg-csc-light'
                                  : person.status === 'injured' ? 'bg-csc-red'
                                  : 'bg-white/25'
                              }`}
                              aria-hidden="true"
                            />
                          </span>

                          {person.photo_url ? (
                            <img
                              src={person.photo_url}
                              alt=""
                              className="w-16 h-16 rounded-2xl object-cover border border-csc-gold/45"
                            />
                          ) : (
                            <span className="w-16 h-16 rounded-2xl bg-white/10 border border-csc-gold/45 text-white/70 flex items-center justify-center font-display font-black text-[22px]">
                              {(person.name || '?').charAt(0).toUpperCase()}
                            </span>
                          )}

                          <span className="w-full min-w-0">
                            <span className="block font-display font-black text-[13px] text-white uppercase truncate">
                              {person.shirt_name || person.nickname || person.name}
                            </span>
                            <span className="block text-[9.5px] text-white/62 truncate mt-0.5">
                              {positions.length > 0
                                ? positions.map(pos => normalizePositionName(pos)).join(' · ')
                                : roles.includes('coach') ? 'Treinador' : roles.includes('admin') ? 'Direção' : ''}
                            </span>
                          </span>

                          <span className="w-full flex items-baseline justify-center gap-2 tabular-nums border-t border-white/8">
                            <span className="font-display font-bold text-[11px] text-white/62 pt-1.5">{e.j}<span className="text-white/30">J</span></span>
                            <span className="font-display font-black text-[11px] text-csc-gold pt-1.5">{e.g}<span className="opacity-60">G</span></span>
                            <span className="font-display font-black text-[11px] text-csc-azul-texto pt-1.5">{e.a}<span className="opacity-60">A</span></span>
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          ))}
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
            className="bg-csc-superficie text-white rounded-3xl w-full p-4 relative max-h-[92vh] overflow-y-auto shadow-2xl border border-white/12 outline-none"
          >
            <button
              type="button"
              onClick={handleAttemptCloseFormModal}
              aria-label="Fechar"
              className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center z-10 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <X size={18} />
            </button>

            {/*
              Editar atleta (ecrã 3c). O painel era `bg-csc-dark`, o verde do
              clube, e sobre o fundo preto lia-se como um erro; o título ficava
              por baixo de um botão de fechar branco e redondo.

              O estado passou para uma secção própria, a "2 · ESTADO" do
              handoff, em vez de um segmentado espremido ao lado do título.
            */}
            <div className="border-b border-white/10 pb-3.5 mb-4 pr-12">
              <p className="font-display font-extrabold text-[9px] tracking-[0.16em] uppercase text-csc-gold">
                {isEditing ? 'Editar atleta' : 'Novo membro'}
              </p>
              <h2 id="ficha-membro-titulo" className="font-display font-black text-[20px] leading-tight text-white mt-0.5">
                {isEditing ? (formName || 'Ficha do atleta') : 'Criar ficha'}
              </h2>
              {isEditing && formJerseyNumber !== '' && (
                <p className="text-[11px] text-white/62 mt-0.5">nº {formJerseyNumber}</p>
              )}
            </div>

            <form onSubmit={handleSaveMember} className="space-y-4">

              {/* Estado — a secção 2 do handoff, aqui em primeiro porque é o
                  que mais vezes se vem cá mudar. */}
              <div className="cartao-simples p-4 space-y-2.5">
                <h3 className={ETIQUETA}>Estado</h3>
                <div className="grid grid-cols-3 gap-1 bg-white/6 p-1 rounded-2xl border border-white/10">
                  {([
                    ['active', 'Apto'],
                    ['injured', 'Lesionado'],
                    ['inactive', 'Inativo'],
                  ] as const).map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setFormStatus(valor)}
                      aria-pressed={formStatus === valor}
                      className={`min-h-11 rounded-[14px] font-display font-black text-[11px] cursor-pointer
                        transition-transform duration-150 active:scale-97
                        focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${
                          formStatus === valor
                            ? valor === 'injured'
                              ? 'bg-csc-red text-white'
                              : valor === 'inactive'
                              ? 'bg-white/25 text-white'
                              : 'bg-csc-light text-white'
                            : 'text-white/62'
                        }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
                <p className="text-[10.5px] leading-relaxed text-white/62">
                  Lesionado ou inativo sai dos treinos futuros; lesionado ainda pode ir a convívios.
                </p>
              </div>
              
              {/* 1. DADOS PESSOAIS & IDENTIFICAÇÃO FISCAL */}
              <div className="cartao-simples p-4 space-y-3.5">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} className="text-csc-gold" />
                  <span>1. Identificação Pessoal & Fiscal</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={ETIQUETA}>Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className={CAMPO}
                      placeholder="Ex: André Gomes Marques do Couto"
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Nome na Camisola</label>
                    <input
                      type="text"
                      value={formShirtName}
                      onChange={(e) => setFormShirtName(e.target.value)}
                      className={CAMPO}
                      placeholder="Ex: A. COUTO"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={ETIQUETA}>Data de Nascimento</label>
                    <input
                      type="date"
                      value={formBirthDate}
                      onChange={(e) => setFormBirthDate(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Nacionalidade</label>
                    <input
                      type="text"
                      value={formNationality}
                      onChange={(e) => setFormNationality(e.target.value)}
                      className={CAMPO}
                      placeholder="Portuguesa"
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Nº de Contribuinte (NIF)</label>
                    <input
                      type="text"
                      value={formNif}
                      onChange={(e) => setFormNif(e.target.value)}
                      className={CAMPO}
                      placeholder="000 000 000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={ETIQUETA}>Nº Cartão de Cidadão / Passaporte</label>
                    <input
                      type="text"
                      value={formIdNumber}
                      onChange={(e) => setFormIdNumber(e.target.value)}
                      className={CAMPO}
                      placeholder="00000000"
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Validade do Cartão de Cidadão</label>
                    <input
                      type="date"
                      value={formIdCardExpiry}
                      onChange={(e) => setFormIdCardExpiry(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                </div>
              </div>

              {/* 2. MORADA & RESIDÊNCIA */}
              <div className="cartao-simples p-4 space-y-3.5">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-gold" />
                  <span>2. Morada & Residência</span>
                </h3>

                <div>
                  <label className={ETIQUETA}>Morada (Rua, Nº e Andar)</label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className={CAMPO}
                    placeholder="Rua e número da morada"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={ETIQUETA}>Código Postal</label>
                    <input
                      type="text"
                      value={formPostalCode}
                      onChange={(e) => setFormPostalCode(e.target.value)}
                      className={CAMPO}
                      placeholder="0000-000"
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Localidade</label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      className={CAMPO}
                      placeholder="Cascais / Alcabideche"
                    />
                  </div>
                </div>
              </div>

              {/* 3. CONTACTOS */}
              <div className="cartao-simples p-4 space-y-3.5">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={14} className="text-csc-gold" />
                  <span>3. Contactos</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={ETIQUETA}>Email *</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className={CAMPO}
                      placeholder="atleta@clube.pt"
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Telemóvel</label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className={CAMPO}
                      placeholder="912 345 678"
                    />
                  </div>
                </div>
              </div>

              {/* 4. DADOS DESPORTIVOS, EQUIPAMENTO & PAPEL */}
              <div className="cartao-simples p-4 space-y-3.5">
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
                  <div className="grid grid-cols-3 gap-2">
                    {/* Jogador */}
                    <button
                      type="button"
                      onClick={() => toggleRole('player')}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                        formRoles.includes('player')
                          ? 'bg-csc-light/15 border-csc-light/50'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <UserIcon size={15} className="text-csc-verde-texto" />
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('player') ? 'bg-csc-light text-white' : 'border border-white/20'
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
                          ? 'bg-csc-blue/18 border-csc-blue/50'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <ClipboardList size={15} className="text-csc-azul-texto" />
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${
                          formRoles.includes('coach') ? 'bg-csc-blue text-white' : 'border border-white/20'
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
                          ? 'bg-csc-gold/15 border-csc-gold/50'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <Shield size={15} className="text-csc-gold" />
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
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
                  <div>
                    <label className={ETIQUETA}>Nº da Camisola</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={formJerseyNumber}
                      onChange={(e) => setFormJerseyNumber(e.target.value === '' ? '' : Number(e.target.value))}
                      className={CAMPO}
                      placeholder="Ex: 10"
                    />
                  </div>

                  <div>
                    <label className={ETIQUETA}>Tamanho Equipamento</label>
                    <select
                      value={formKitSize}
                      onChange={(e) => setFormKitSize(e.target.value)}
                      className={CAMPO}
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
              <div className="cartao-simples p-4 space-y-3.5">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={14} className="text-csc-gold" />
                  <span>5. Dados Bancários & Quotas</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={ETIQUETA}>IBAN (Débito Direto / Quotas)</label>
                    <input
                      type="text"
                      value={formIban}
                      onChange={(e) => setFormIban(e.target.value)}
                      className={`${CAMPO} font-mono`}
                      placeholder="PT50 0000 0000 0000 0000 0"
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Nº de Sócio do Clube</label>
                    <input
                      type="text"
                      value={formMemberNumber}
                      onChange={(e) => setFormMemberNumber(e.target.value)}
                      className={CAMPO}
                      placeholder="Ex: 1420"
                    />
                  </div>
                </div>
              </div>

              {/*
                Quotas deste atleta (ecrã 3c). A janela em que ele paga quota
                e os meses em que está dispensado.

                Não é uma definição do clube: as datas recortam a janela do
                atleta dentro da época, e o `getPlayerQuotaMonths` já as
                respeita — só não havia sítio nenhum na app para as preencher,
                e ficavam a inferir-se do estado do perfil. Os meses
                dispensados vivem em `quota_exemptions`, criada na fase 1 e
                até agora sem uso.
              */}
              <div className="cartao-simples p-4 space-y-3.5">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Landmark size={14} className="text-csc-gold" />
                  <span>6. Quotas deste atleta</span>
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={ETIQUETA} htmlFor="quota-inicio">Início de atividade</label>
                    <input
                      id="quota-inicio"
                      type="date"
                      value={formQuotaStart}
                      onChange={e => setFormQuotaStart(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA} htmlFor="quota-fim">Fim de atividade</label>
                    <input
                      id="quota-fim"
                      type="date"
                      value={formQuotaEnd}
                      onChange={e => setFormQuotaEnd(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                </div>

                <p className="text-[10.5px] leading-relaxed text-white/62">
                  Sem datas, a janela infere-se do estado: quem fica inativo deixa de gerar meses
                  novos, mas mantém os que já venceram. Ao preencher o fim, as quotas seguintes
                  deixam de ser devidas.
                </p>

                {/*
                  As pastilhas seguem a ordem da época e não a do calendário:
                  a época começa em Setembro, e uma fila que abria em Janeiro
                  obrigava a procurar o início a meio. São sempre doze, para o
                  ano fechar.

                  Os meses que o clube inteiro não paga — o Agosto de
                  `quota_excluded_months` — e os que caem fora da época ficam
                  bloqueados: ninguém os paga, portanto dispensar alguém deles
                  não quer dizer nada. Antes eram pastilhas normais, e clicar
                  numa gravava uma dispensa que não mudava conta nenhuma.
                */}
                {(() => {
                  const mesesDaEpoca = new Set(
                    getSeasonMonths(defFinanceiras, epoca || getSeasonLabel(defFinanceiras)).map(m => m.month),
                  )
                  const excluidosDoClube = new Set(defFinanceiras.quota_excluded_months ?? [])
                  const ordemDaEpoca = Array.from(
                    { length: 12 },
                    (_, i) => ((defFinanceiras.season_start_month - 1 + i) % 12) + 1,
                  )

                  return (
                    <div>
                      <p className={ETIQUETA}>Meses dispensados de quota</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ordemDaEpoca.map(m => {
                          const chave = String(m).padStart(2, '0')
                          const dispensado = formMesesDispensados.includes(chave)
                          const bloqueado = !isAdmin || excluidosDoClube.has(m) || !mesesDaEpoca.has(m)
                          const porque = !isAdmin
                            ? 'Só a direção dispensa alguém de quota'
                            : excluidosDoClube.has(m)
                              ? 'O clube inteiro não paga quota neste mês'
                              : 'Fora da época'

                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={bloqueado}
                              title={bloqueado ? porque : undefined}
                              onClick={() => {
                                triggerHaptic('selection')
                                setFormMesesDispensados(atual =>
                                  dispensado ? atual.filter(x => x !== chave) : [...atual, chave],
                                )
                              }}
                              aria-pressed={bloqueado ? undefined : dispensado}
                              aria-label={bloqueado ? `${MESES_CURTOS[m - 1]} — ${porque}` : undefined}
                              className={`min-h-11 px-3 rounded-[18px] border font-display font-black text-[11px]
                                transition-transform duration-150
                                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                                  bloqueado
                                    ? 'bg-transparent border-dashed border-white/20 text-white/30 cursor-not-allowed line-through'
                                    : dispensado
                                      ? 'bg-csc-gold text-csc-tinta border-csc-gold cursor-pointer active:scale-97'
                                      : 'bg-white/5 border-white/12 text-white/62 cursor-pointer active:scale-97'
                                }`}
                            >
                              {MESES_CURTOS[m - 1]}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-[10.5px] leading-relaxed text-white/62 mt-2">
                        {!isAdmin && (
                          <>
                            <strong className="text-white/80">Só a direção altera dispensas de quota</strong> — a
                            tabela só aceita escrita de admin, e sem isto o treinador carregava numa pastilha e
                            levava com um erro ao gravar.{' '}
                          </>
                        )}
                        Da esquerda para a direita, a época começa em {nomeMes(defFinanceiras.season_start_month)}.
                        Dourado = dispensado, todos os anos. Riscado = ninguém paga esse mês, e define-se
                        no Financeiro. Um mês dispensado sai da dívida do atleta e da previsão de receita
                        do clube.
                      </p>
                    </div>
                  )
                })()}
              </div>
              {/* 6. SAÚDE & EMERGÊNCIA */}
              <div className="cartao-simples p-4 space-y-3.5">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <HeartPulse size={14} className="text-red-400" />
                  <span>7. Saúde & Contacto de Emergência</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className={ETIQUETA}>Contacto de Emergência (Nome / Relação)</label>
                    <input
                      type="text"
                      value={formEmergencyName}
                      onChange={(e) => setFormEmergencyName(e.target.value)}
                      className={CAMPO}
                      placeholder="Ex: Maria (Esposa)"
                    />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Telefone de Emergência</label>
                    <input
                      type="tel"
                      value={formEmergencyPhone}
                      onChange={(e) => setFormEmergencyPhone(e.target.value)}
                      className={CAMPO}
                      placeholder="960 000 000"
                    />
                  </div>
                </div>

                <div>
                  <label className={ETIQUETA}>Notas Médicas / Alergias / Tipo Sanguíneo</label>
                  <textarea
                    value={formMedicalNotes}
                    onChange={(e) => setFormMedicalNotes(e.target.value)}
                    rows={2}
                    className={CAMPO}
                    placeholder="Ex: Alergia a anti-inflamatórios, Tipo O+, histórico de lesão no joelho direito..."
                  />
                </div>
              </div>

              {/* 7. UPLOAD DE DOCUMENTOS & RGPD */}
              <div className="cartao-simples p-4 space-y-3.5">
                <h3 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-gold" />
                  <span>8. Documentos & Proteção de Dados (RGPD)</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
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
                        <span className="text-[11px] text-csc-verde-texto font-bold">Foto anexada</span>
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
                      <a href={idDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-csc-azul-texto font-bold hover:underline flex items-center gap-1">
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
                      <a href={insuranceDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-csc-azul-texto font-bold hover:underline flex items-center gap-1">
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
                      <a href={medicalExamDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-csc-verde-texto font-bold hover:underline flex items-center gap-1">
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
                    className="mt-0.5 w-4 h-4 text-csc-dark rounded border-white/15 focus:ring-csc-dark"
                  />
                  <label htmlFor="gdpr_consent" className="text-xs text-white/70 font-medium cursor-pointer">
                    Aceita que os seus dados sejam processados pela política de proteção de dados (RGPD) do {CLUBE_NOME}.
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
            {/* Fechar a persiana. */}
            <button
              type="button"
              onClick={() => fecharFicha()}
              aria-label="Fechar"
              title="Fechar"
              className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center z-30 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <X size={18} />
            </button>

            {/*
              Ficha do atleta (ecrã 3b). A fotografia grande, o nome, o número
              e o estado — e as posições logo a seguir, porque é o que se vem
              cá ver.

              Era uma grelha de doze colunas com um dossier ao lado do cartão
              de identidade, desenhada para o desktop que já não existe. Numa
              coluna de 480px isso empilhava-se em qualquer ordem menos a
              certa.
            */}
            <div className="cartao-vidro p-4 flex flex-col items-center text-center gap-2.5 pr-12">
              {selectedProfile.photo_url ? (
                <img
                  src={selectedProfile.photo_url}
                  alt=""
                  className="w-22 h-22 rounded-3xl object-cover border-2 border-csc-gold"
                  style={{ width: 88, height: 88 }}
                />
              ) : (
                <span
                  className="rounded-3xl bg-white/10 border-2 border-csc-gold text-white/70 flex items-center justify-center font-display font-black text-[30px]"
                  style={{ width: 88, height: 88 }}
                >
                  {(selectedProfile.name || '?').charAt(0).toUpperCase()}
                </span>
              )}

              <div>
                <h2 className="font-display font-black text-[22px] leading-none text-white tracking-[-0.02em]">
                  {selectedProfile.shirt_name || selectedProfile.nickname || selectedProfile.name}
                </h2>
                {(selectedProfile.shirt_name || selectedProfile.nickname) && (
                  <p className="text-[11px] text-white/62 mt-1">{selectedProfile.name}</p>
                )}
                <p className="font-display font-bold text-[11.5px] text-csc-gold mt-1">
                  {selectedProfile.jersey_number ? `nº ${selectedProfile.jersey_number}` : 'sem número'}
                  {parsePositions(selectedProfile.position).length > 0 && extractRolesFromProfile(selectedProfile).includes('player')
                    ? ` · ${normalizePositionName(parsePositions(selectedProfile.position)[0])}`
                    : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleTogglePlayerClinicalStatus(selectedProfile)}
                disabled={!isCoachOrAdmin}
                aria-label={`Estado: ${selectedProfile.status === 'injured' ? 'lesionado' : selectedProfile.status === 'inactive' ? 'inativo' : 'apto'}${isCoachOrAdmin ? '. Alternar entre apto e lesionado' : ''}`}
                className={`min-h-11 px-4 rounded-[22px] border font-display font-black text-[11px] flex items-center gap-2
                  transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                    isCoachOrAdmin ? 'cursor-pointer active:scale-97' : 'cursor-default'
                  } ${
                    selectedProfile.status === 'injured'
                      ? 'bg-csc-red/15 text-csc-vermelho-texto border-csc-red/35'
                      : selectedProfile.status === 'inactive'
                      ? 'bg-white/8 text-white/60 border-white/15'
                      : 'bg-csc-light/15 text-csc-verde-texto border-csc-light/35'
                  }`}
              >
                {selectedProfile.status === 'injured' ? <HeartPulse size={14} />
                  : selectedProfile.status === 'inactive' ? <XCircle size={14} />
                  : <CheckCircle2 size={14} />}
                {selectedProfile.status === 'injured' ? 'Lesionado' : selectedProfile.status === 'inactive' ? 'Inativo' : 'Apto'}
              </button>

              <div className="flex flex-wrap justify-center gap-1.5">
                {extractRolesFromProfile(selectedProfile).map(r => (
                  <span
                    key={r}
                    className={`font-display font-black text-[9px] tracking-[0.1em] uppercase px-2 py-1 rounded-full border ${
                      r === 'admin'
                        ? 'bg-csc-gold/15 text-csc-gold border-csc-gold/35'
                        : r === 'coach'
                        ? 'bg-csc-blue/20 text-csc-azul-texto border-csc-blue/30'
                        : 'bg-csc-light/15 text-csc-verde-texto border-csc-light/25'
                    }`}
                  >
                    {r === 'admin' ? 'Direção' : r === 'coach' ? 'Treinador' : 'Jogador'}
                  </span>
                ))}
              </div>
            </div>

            {/* Estatísticas da época (ecrã 3b). */}
            {extractRolesFromProfile(selectedProfile).includes('player') && (
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['Jogos', jga(selectedProfile.id).j, 'text-white'],
                  ['Golos', jga(selectedProfile.id).g, 'text-csc-gold'],
                  ['Assistências', jga(selectedProfile.id).a, 'text-csc-azul-texto'],
                ] as const).map(([etiqueta, valor, cor]) => (
                  <div key={etiqueta} className="cartao-simples p-3">
                    <p className="font-display font-extrabold text-[8px] tracking-[0.12em] uppercase text-white/62 leading-tight">
                      {etiqueta}
                    </p>
                    <p className={`font-display font-black text-[22px] mt-1 tabular-nums leading-none ${cor}`}>
                      {valor}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">

              {/* Campo Tático — só para quem tem o papel de Jogador */}
              {extractRolesFromProfile(selectedProfile).includes('player') && (
                <div className="cartao-simples p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 flex items-center gap-1.5">
                      <Shield size={13} className="text-csc-gold" />
                      Posições atribuídas
                    </h4>
                    <span className="font-display font-black text-[10px] text-csc-gold shrink-0">
                      {parsePositions(selectedProfile.position).length || 0}
                    </span>
                  </div>

                  <SoccerPitchSelector
                    selectedPositions={parsePositions(selectedProfile.position)}
                    onChange={() => {}}
                    readOnly={true}
                  />
                </div>
              )}

              <div className="space-y-4">
                
                {/* 1. Identificação & Dados Fiscais */}
                <div className="cartao-simples p-4 space-y-3">
                  <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={14} className="text-csc-gold" />
                    <span>1. Identificação & Dados Fiscais</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nome Completo</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.name}</p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nome na Camisola</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.shirt_name || selectedProfile.nickname || '-'}</p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Data de Nascimento / Idade</p>
                      <p className="font-extrabold text-white mt-0.5">
                        {selectedProfile.birth_date ? (
                          `${new Date(selectedProfile.birth_date).toLocaleDateString('pt-PT')} (${calculateAge(selectedProfile.birth_date)} anos)`
                        ) : '-'}
                      </p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">NIF / Contribuinte</p>
                      <p className="font-extrabold text-white mt-0.5 font-mono">{selectedProfile.nif || '-'}</p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nº CC / Passaporte</p>
                      <p className="font-extrabold text-white mt-0.5 font-mono">{selectedProfile.id_number || '-'}</p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Validade do CC</p>
                      <p className="font-extrabold text-white mt-0.5">
                        {selectedProfile.id_card_expiry ? new Date(selectedProfile.id_card_expiry).toLocaleDateString('pt-PT') : '-'}
                      </p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nacionalidade</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.nationality || 'Portuguesa'}</p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Nº de Sócio CSC</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.member_number ? `Sócio nº ${selectedProfile.member_number}` : '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 2. Morada & Residência */}
                <div className="cartao-simples p-4 space-y-3">
                  <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-csc-gold" />
                    <span>2. Morada & Residência</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Morada (Rua / Edifício / Andar)</p>
                      <p className="font-extrabold text-white mt-0.5">{selectedProfile.address || 'Não registada'}</p>
                    </div>

                    <div className="bg-white/6 p-2.5 rounded-xl border border-white/10 min-w-0">
                      <p className="text-white/65 font-bold uppercase text-[9px]">Código Postal & Localidade</p>
                      <p className="font-extrabold text-white mt-0.5">
                        {selectedProfile.postal_code || '-'} {selectedProfile.city ? `• ${selectedProfile.city}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Dados Bancários (Débito Direto) */}
                <div className="cartao-simples p-4 space-y-3">
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
                      <span className="text-[10px] font-bold bg-csc-light/16 border border-csc-light/30 text-csc-verde-texto px-2 py-0.5 rounded">
                        Ativo
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

                  <div className="grid grid-cols-2 gap-2 text-xs">
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
                <div className="cartao-simples p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} className="text-csc-gold" />
                      <span>5. Documentação Oficial & RGPD</span>
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-csc-light/16 border border-csc-light/30 text-csc-verde-texto flex items-center gap-1">
                      <CheckCircle2 size={11} /> RGPD Consentido
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-xs">
                    {selectedProfile.id_document_url ? (
                      <a
                        href={selectedProfile.id_document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-3 bg-csc-blue/12 border border-csc-blue/30 rounded-xl flex flex-col items-center justify-center gap-1.5 text-csc-azul-texto font-bold hover:bg-csc-blue/20 transition-colors text-center"
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
                        className="p-3 bg-csc-blue/12 border border-csc-blue/30 rounded-xl flex flex-col items-center justify-center gap-1.5 text-csc-azul-texto font-bold hover:bg-csc-blue/20 transition-colors text-center"
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
                        className="p-3 bg-csc-light/10 border border-csc-light/25 rounded-xl flex flex-col items-center justify-center gap-1.5 text-csc-verde-texto font-bold hover:bg-csc-light/15 transition-colors text-center"
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

            {/*
              Gestão do atleta (ecrã 3b): o cartão dourado no fim da ficha, com
              as ações que só a equipa técnica e a direção veem. É onde estão
              agora o editar, o marcar lesionado e o eliminar — saíram da linha
              da lista, onde eram quatro alvos de 15px dentro de um alvo maior.
            */}
            {isCoachOrAdmin && (
              <div className="cartao-simples bg-csc-gold/8 border-csc-gold/25 p-4 space-y-2.5">
                <h4 className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-gold">
                  Gestão do atleta
                </h4>

                <button
                  type="button"
                  onClick={() => {
                    const alvo = selectedProfile
                    fecharFicha()
                    openEditModal(alvo)
                  }}
                  className="w-full min-h-12 px-4 rounded-2xl bg-csc-gold text-csc-tinta font-display font-extrabold text-[12.5px]
                    flex items-center justify-center gap-2 cursor-pointer transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  <Edit2 size={15} />
                  Editar atleta
                </button>

                <p className="text-[10.5px] leading-relaxed text-white/60">
                  Marcar como lesionado retira-o dos treinos futuros; ao voltar a apto entra outra vez.
                </p>

                <button
                  type="button"
                  onClick={() => handleTogglePlayerClinicalStatus(selectedProfile)}
                  className="w-full min-h-12 px-4 rounded-2xl bg-csc-red/12 border border-csc-red/30 text-csc-vermelho-texto
                    font-display font-extrabold text-[12px] flex items-center justify-center gap-2 cursor-pointer
                    transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  <HeartPulse size={15} />
                  {selectedProfile.status === 'injured' ? 'Marcar como apto' : 'Marcar lesionado'}
                </button>

                {isAdmin && selectedProfile?.id && (
                  linkedProfileIds.has(selectedProfile.id) ? (
                    <p className="flex items-center gap-1.5 text-[10.5px] text-csc-verde-texto font-bold pt-1">
                      <UserCheck size={13} className="shrink-0" />
                      Tem conta de acesso ligada.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const alvo = selectedProfile
                        fecharFicha()
                        openAssociateModal(alvo)
                      }}
                      className="w-full min-h-12 px-4 rounded-2xl bg-white/8 border border-white/15 text-white/80
                        font-display font-extrabold text-[12px] flex items-center justify-center gap-2 cursor-pointer
                        transition-transform duration-150 active:scale-97
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                    >
                      <Link2 size={15} />
                      Fundir com outra ficha
                    </button>
                  )
                )}

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const alvo = selectedProfile
                      handleDeleteMember(alvo.id, alvo.name)
                    }}
                    className="w-full min-h-12 px-4 rounded-2xl text-csc-vermelho-texto font-display font-extrabold text-[12px]
                      flex items-center justify-center gap-2 cursor-pointer transition-transform duration-150 active:scale-97
                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    <Trash2 size={15} />
                    Eliminar atleta
                  </button>
                )}
              </div>
            )}

          </div>
        </VistaDetalhe>
      )}

      {/* MODAL 3: ASSOCIAR UTILIZADOR A JOGADOR */}
      {associatingPlayer && (() => {
        // As contas que se registaram e ficaram sem ficha — é o que o handoff
        // pede em 3d, e o que na prática se quer ligar. Vêm da RPC
        // `admin_contas_por_ligar`, que só o admin pode chamar.
        const porLigar = contasPorLigar.filter(c => c.id !== associatingPlayer.id)

        // Encontrar potenciais coincidências por email ou telefone
        // Só por email: é a identidade de uma pessoa neste clube. O telefone
        // saiu — é auto-editável, e fundir duas fichas apaga uma delas.
        const potentialMatches = profiles.filter(p =>
          p.id !== associatingPlayer.id &&
          p.email && associatingPlayer.email &&
          p.email.trim().toLowerCase() === associatingPlayer.email.trim().toLowerCase()
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
              className="bg-csc-superficie text-white rounded-3xl max-w-xl w-full p-5 relative max-h-[90vh] overflow-y-auto shadow-2xl border border-white/12 outline-none"
            >
              <button
                onClick={() => {
                  setAssociatingPlayer(null)
                  setSelectedUserToAssociate(null)
                }}
                aria-label="Fechar"
                className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={18} className="stroke-[2.5]" />
              </button>

              {/* Cabeçalho */}
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2.5 bg-csc-blue/20 rounded-xl text-csc-azul-texto">
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
                  <div className="flex items-center gap-1.5 text-xs font-black text-csc-verde-texto">
                    <Sparkles size={16} className="text-csc-verde-texto" />
                    <span>Mesmo email — é a mesma pessoa</span>
                  </div>
                  {potentialMatches.map(match => {
                    const matchTemConta = linkedProfileIds.has(match.id)
                    return (
                      <div
                        key={match.id}
                        className="p-3.5 cartao-simples bg-csc-light/12 border-csc-light/32 flex items-center justify-between gap-3"
                      >
                        <div className="text-xs min-w-0">
                          <p className="font-display font-bold text-white text-sm truncate">{match.name}</p>
                          <p className="text-white/70 font-medium truncate">{match.email}</p>
                          <p className="text-csc-verde-texto text-[10px] font-bold mt-0.5">
                            {matchTemConta ? 'Tem conta de acesso — vai ser a ficha que fica' : 'Sem conta de acesso'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={associatingLoading}
                          onClick={() => handleConfirmAssociate(associatingPlayer, match, !matchTemConta)}
                          className="min-h-11 px-3.5 rounded-[18px] bg-csc-light text-white text-xs font-display font-extrabold
                            shrink-0 flex items-center gap-1.5 cursor-pointer transition-transform duration-150 active:scale-97
                            disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                        >
                          <UserCheck size={14} />
                          <span>Fundir Imediatamente</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/*
                Contas por ligar (ecrã 3d). São as pessoas que se registaram na
                app e não ficaram ligadas a nenhuma ficha do clube — que é o
                caso que se vem cá resolver. A lista de baixo, com o plantel
                inteiro, fica para o caso raro de haver duas fichas da mesma
                pessoa.
              */}
              {porLigar.length > 0 && (
                <div className="mt-5 space-y-2">
                  <h4 className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-gold">
                    Contas por ligar ({porLigar.length})
                  </h4>
                  <p className="text-[10.5px] leading-relaxed text-white/62">
                    Registaram-se com um email que não está em ficha nenhuma — é por aí que a app
                    liga as contas —, por isso a ficha que têm só tem o nome e o email. Ao ligar,
                    as respostas e os pagamentos já lançados ficam nesta ficha. Corrigir o email
                    na ficha resolve o mesmo, e resolve-o para a próxima vez.
                  </p>

                  {porLigar.map(conta => (
                    <button
                      key={conta.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection')
                        setSelectedUserToAssociate(conta as unknown as Profile)
                      }}
                      aria-pressed={selectedUserToAssociate?.id === conta.id}
                      className={`w-full min-h-14 flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-left cursor-pointer
                        transition-transform duration-150 active:scale-97
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                          selectedUserToAssociate?.id === conta.id
                            ? 'bg-csc-gold/15 border-csc-gold/45'
                            : 'bg-white/5 border-white/10'
                        }`}
                    >
                      <span className="w-9 h-9 rounded-xl bg-white/10 text-white/60 flex items-center justify-center font-display font-black text-[13px] shrink-0">
                        {(conta.name || conta.email || '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display font-bold text-[12.5px] text-white truncate">
                          {conta.name || 'Sem nome'}
                        </span>
                        <span className="block text-[10px] text-white/62 truncate mt-0.5">
                          {conta.email}
                          {conta.created_at
                            ? ` · registou-se a ${new Date(conta.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}`
                            : ''}
                        </span>
                      </span>
                      {selectedUserToAssociate?.id === conta.id && (
                        <Check size={16} className="text-csc-gold shrink-0" />
                      )}
                    </button>
                  ))}
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
                  <Search size={15} className="absolute left-3 top-2.5 text-white/62" />
                  <input
                    type="text"
                    value={associateSearchTerm}
                    onChange={(e) => setAssociateSearchTerm(e.target.value)}
                    placeholder="Pesquisar utilizador por nome, email ou telefone..."
                    className={`${CAMPO} pl-9.5`}
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
