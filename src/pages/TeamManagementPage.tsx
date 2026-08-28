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
  Save
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Profile, UserRole, ProfileStatus } from '../context/AuthContext'

const POSITIONS = [
  'Guarda-redes',
  'Defesa Central',
  'Lateral Direito',
  'Lateral Esquerdo',
  'Médio Defensivo',
  'Médio Centro',
  'Médio Ofensivo',
  'Extremo Direito',
  'Extremo Esquerdo',
  'Ponta de Lança',
  'Treinador / Equipa Técnica',
  'Dirigente / Staff'
]

const TeamManagementPage: React.FC = () => {
  const { profile: currentUserProfile } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProfileStatus>('all')
  const [positionFilter, setPositionFilter] = useState('all')

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Form State
  const [formId, setFormId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formNickname, setFormNickname] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('player')
  const [formStatus, setFormStatus] = useState<ProfileStatus>('active')
  const [formJerseyNumber, setFormJerseyNumber] = useState<number | ''>('')
  const [formBirthDate, setFormBirthDate] = useState('')
  const [formNationality, setFormNationality] = useState('Portuguesa')
  const [formPosition, setFormPosition] = useState('Médio Centro')
  const [formIdNumber, setFormIdNumber] = useState('')
  const [formMemberNumber, setFormMemberNumber] = useState('')
  const [formEmergencyName, setFormEmergencyName] = useState('')
  const [formEmergencyPhone, setFormEmergencyPhone] = useState('')
  const [formMedicalNotes, setFormMedicalNotes] = useState('')

  // Upload URLs & Status
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null)
  const [insuranceDocUrl, setInsuranceDocUrl] = useState<string | null>(null)
  const [medicalExamDocUrl, setMedicalExamDocUrl] = useState<string | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null) // name of the field uploading

  const isCoachOrAdmin = currentUserProfile && ['coach', 'admin'].includes(currentUserProfile.role)
  const isAdmin = currentUserProfile?.role === 'admin'

  const fetchProfiles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      if (data) {
        setProfiles(data as Profile[])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
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
    setFormEmail('')
    setFormPhone('')
    setFormRole('player')
    setFormStatus('active')
    setFormJerseyNumber('')
    setFormBirthDate('')
    setFormNationality('Portuguesa')
    setFormPosition('Médio Centro')
    setFormIdNumber('')
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
    setFormEmail(p.email || '')
    setFormPhone(p.phone || '')
    setFormRole(p.role || 'player')
    setFormStatus(p.status || 'active')
    setFormJerseyNumber(p.jersey_number !== undefined && p.jersey_number !== null ? p.jersey_number : '')
    setFormBirthDate(p.birth_date || '')
    setFormNationality(p.nationality || 'Portuguesa')
    setFormPosition(p.position || 'Médio Centro')
    setFormIdNumber(p.id_number || '')
    setFormMemberNumber(p.member_number || '')
    setFormEmergencyName(p.emergency_contact_name || '')
    setFormEmergencyPhone(p.emergency_contact_phone || '')
    setFormMedicalNotes(p.medical_notes || '')
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

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName || !formEmail) {
      alert('Nome e Email são obrigatórios.')
      return
    }

    const payload = {
      name: formName,
      nickname: formNickname || null,
      email: formEmail,
      phone: formPhone || null,
      role: formRole,
      status: formStatus,
      jersey_number: formJerseyNumber !== '' ? Number(formJerseyNumber) : null,
      birth_date: formBirthDate || null,
      nationality: formNationality || null,
      position: formPosition || null,
      id_number: formIdNumber || null,
      member_number: formMemberNumber || null,
      emergency_contact_name: formEmergencyName || null,
      emergency_contact_phone: formEmergencyPhone || null,
      medical_notes: formMedicalNotes || null,
      photo_url: photoUrl || null,
      id_document_url: idDocUrl || null,
      insurance_doc_url: insuranceDocUrl || null,
      medical_exam_doc_url: medicalExamDocUrl || null,
    }

    try {
      if (isEditing && formId) {
        const { error } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', formId)

        if (error) throw error
        alert('Ficha de membro atualizada!')
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert([payload])

        if (error) throw error
        alert('Novo membro criado com sucesso!')
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
      const { error } = await supabase.from('profiles').delete().eq('id', id)
      if (error) throw error
      setProfiles(prev => prev.filter(p => p.id !== id))
      if (selectedProfile?.id === id) setIsDetailModalOpen(false)
    } catch (err: any) {
      alert('Erro ao eliminar membro: ' + err.message)
    }
  }

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
            Fichas completas dos atletas, contactos de emergência, registo médico e apólices de seguro.
          </p>
        </div>

        {isCoachOrAdmin && (
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-2 bg-csc-dark text-white px-4 py-2.5 rounded-xl font-bold hover:bg-csc-dark/80 transition-colors shadow-md shrink-0"
          >
            <Plus size={18} />
            <span>Adicionar Membro</span>
          </button>
        )}
      </div>

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

          <div className="flex gap-2">
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
          </div>
        </div>
      </div>

      {/* Profiles Grid */}
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProfiles.map((person) => {
            const age = calculateAge(person.birth_date)
            const hasIdDoc = Boolean(person.id_document_url)
            const hasInsurance = Boolean(person.insurance_doc_url)
            const hasMedical = Boolean(person.medical_exam_doc_url)

            return (
              <div
                key={person.id}
                className={`bg-white rounded-2xl shadow-sm border transition-all hover:shadow-md flex flex-col justify-between overflow-hidden ${
                  person.status === 'injured' ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-150'
                }`}
              >
                <div className="p-5">
                  {/* Top Bar: Number & Status Badge */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      {person.jersey_number ? (
                        <span className="w-8 h-8 rounded-lg bg-csc-dark text-white flex items-center justify-center font-black text-sm shadow-inner">
                          {person.jersey_number}
                        </span>
                      ) : (
                        <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center font-bold text-xs">
                          -
                        </span>
                      )}
                      <div>
                        <span className="text-xs font-bold text-gray-700">{person.position || 'Jogador'}</span>
                        {person.member_number && (
                          <p className="text-[10px] text-gray-400 font-semibold">Sócio nº {person.member_number}</p>
                        )}
                      </div>
                    </div>

                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                      person.status === 'active' ? 'bg-green-100 text-green-800' :
                      person.status === 'injured' ? 'bg-red-100 text-red-800 animate-pulse' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {person.status === 'active' ? <CheckCircle2 size={12}/> :
                       person.status === 'injured' ? <HeartPulse size={12}/> :
                       <XCircle size={12}/>}
                      {person.status === 'active' ? 'Ativo' :
                       person.status === 'injured' ? 'Lesionado' : 'Inativo'}
                    </span>
                  </div>

                  {/* Player Main Info */}
                  <div className="flex items-center gap-3.5 my-3">
                    {person.photo_url ? (
                      <img
                        src={person.photo_url}
                        alt={person.name}
                        className="w-14 h-14 rounded-full object-cover border-2 border-csc-dark/20 shadow-sm"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-csc-dark to-csc-light/60 text-white flex items-center justify-center font-black text-xl shadow-sm">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-extrabold text-gray-900 text-base leading-tight truncate">
                        {person.name}
                      </h3>
                      {person.nickname && (
                        <p className="text-xs font-bold text-csc-dark italic truncate">
                          "{person.nickname}"
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {person.nationality || 'Portuguesa'} {age ? `• ${age} anos` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Contact Shortcuts */}
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                    {person.phone && (
                      <a
                        href={`tel:${person.phone}`}
                        className="flex items-center gap-2 hover:text-csc-dark truncate"
                      >
                        <Phone size={13} className="text-gray-400 shrink-0" />
                        <span className="font-medium">{person.phone}</span>
                      </a>
                    )}
                    <a
                      href={`mailto:${person.email}`}
                      className="flex items-center gap-2 hover:text-csc-dark truncate"
                    >
                      <Mail size={13} className="text-gray-400 shrink-0" />
                      <span className="truncate">{person.email}</span>
                    </a>
                  </div>

                  {/* Documents Pills */}
                  <div className="mt-3 pt-2 flex flex-wrap gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                      hasIdDoc ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                    }`}>
                      <FileText size={10} /> CC {hasIdDoc ? '✓' : '✗'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                      hasInsurance ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                    }`}>
                      <Shield size={10} /> Seguro {hasInsurance ? '✓' : '✗'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                      hasMedical ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
                    }`}>
                      <HeartPulse size={10} /> Atestado {hasMedical ? '✓' : '✗'}
                    </span>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="bg-gray-50 px-4 py-2.5 border-t border-gray-150 flex items-center justify-between">
                  <button
                    onClick={() => openDetailModal(person)}
                    className="text-xs font-bold text-csc-dark hover:underline flex items-center gap-1"
                  >
                    <span>Ver Ficha Completa</span>
                  </button>

                  {isCoachOrAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(person)}
                        className="p-1.5 text-gray-500 hover:text-csc-dark rounded-lg hover:bg-white transition-colors"
                        title="Editar Ficha"
                      >
                        <Edit2 size={15} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteMember(person.id, person.name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors"
                          title="Eliminar Membro"
                        >
                          <Trash2 size={15} />
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
              Preencha os dados cadastrais, contactos e anexe a respetiva documentação legal/desportiva.
            </p>

            <form onSubmit={handleSaveMember} className="space-y-6">
              
              {/* 1. DADOS PESSOAIS & IDENTIFICAÇÃO */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={14} className="text-csc-dark" />
                  <span>1. Identificação Pessoal</span>
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
                      placeholder="Ex: Cristiano Ronaldo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Alcunha / Nome Desportivo</label>
                    <input
                      type="text"
                      value={formNickname}
                      onChange={(e) => setFormNickname(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Ex: CR7 / O Mágico"
                    />
                  </div>
                </div>

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
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nº CC / Passaporte</label>
                    <input
                      type="text"
                      value={formIdNumber}
                      onChange={(e) => setFormIdNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="12345678"
                    />
                  </div>
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

              {/* 2. DADOS DESPORTIVOS & PAPEL */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={14} className="text-csc-dark" />
                  <span>2. Dados Desportivos & Função</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Posição no Campo</label>
                    <select
                      value={formPosition}
                      onChange={(e) => setFormPosition(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    >
                      {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Número da Camisola</label>
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Papel no Sistema</label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-semibold"
                    >
                      <option value="player">Jogador</option>
                      <option value="coach">Treinador</option>
                      <option value="admin">Administrador / Direção</option>
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

              {/* 3. SAÚDE & EMERGÊNCIA */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <HeartPulse size={14} className="text-red-600" />
                  <span>3. Saúde & Contacto de Emergência</span>
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

              {/* 4. UPLOAD DE DOCUMENTOS */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-csc-dark" />
                  <span>4. Documentos & Fotografia (Upload)</span>
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
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingDoc !== null}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-csc-dark hover:bg-csc-dark/80 transition-colors shadow-md text-sm flex items-center justify-center gap-2"
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
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl space-y-6">
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1"
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
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-gray-900 truncate">{selectedProfile.name}</h2>
                  {selectedProfile.jersey_number && (
                    <span className="bg-csc-dark text-white text-xs font-black px-2 py-0.5 rounded">
                      #{selectedProfile.jersey_number}
                    </span>
                  )}
                </div>
                {selectedProfile.nickname && (
                  <p className="text-xs font-bold text-csc-dark italic">"{selectedProfile.nickname}"</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold text-gray-600">{selectedProfile.position || 'Jogador'}</span>
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

            {/* General Info Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <p className="text-gray-400 font-bold uppercase">Nº de Sócio</p>
                <p className="font-extrabold text-gray-800 mt-0.5">{selectedProfile.member_number || 'Não atribuído'}</p>
              </div>
              <div>
                <p className="text-gray-400 font-bold uppercase">Nº Identificação (CC)</p>
                <p className="font-extrabold text-gray-800 mt-0.5">{selectedProfile.id_number || 'Não registado'}</p>
              </div>
              <div>
                <p className="text-gray-400 font-bold uppercase">Idade / Nascimento</p>
                <p className="font-extrabold text-gray-800 mt-0.5">
                  {selectedProfile.birth_date ? (
                    `${calculateAge(selectedProfile.birth_date)} anos (${new Date(selectedProfile.birth_date).toLocaleDateString('pt-PT')})`
                  ) : 'Não registada'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 font-bold uppercase">Nacionalidade</p>
                <p className="font-extrabold text-gray-800 mt-0.5">{selectedProfile.nationality || 'Portuguesa'}</p>
              </div>
            </div>

            {/* Contactos */}
            <div className="space-y-2">
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

            {/* Saúde & Emergência */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <HeartPulse size={14} className="text-red-600" />
                <span>Saúde & Emergência</span>
              </h4>
              <div className="p-3 bg-red-50/60 border border-red-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-semibold">Contacto Emergência:</span>
                  <span className="font-bold text-gray-900">
                    {selectedProfile.emergency_contact_name || 'Nenhum'} 
                    {selectedProfile.emergency_contact_phone ? ` (${selectedProfile.emergency_contact_phone})` : ''}
                  </span>
                </div>
                {selectedProfile.medical_notes && (
                  <div className="pt-2 border-t border-red-200/60">
                    <span className="text-gray-600 font-semibold block mb-0.5">Notas Médicas:</span>
                    <p className="text-gray-800 font-medium">{selectedProfile.medical_notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Documentos Anexados */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={14} className="text-csc-dark" />
                <span>Documentação Anexada</span>
              </h4>

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
              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false)
                    openEditModal(selectedProfile)
                  }}
                  className="px-4 py-2 bg-csc-dark text-white rounded-lg text-xs font-bold hover:bg-csc-dark/80 transition-colors flex items-center gap-1.5 shadow"
                >
                  <Edit2 size={14} />
                  <span>Editar Ficha</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamManagementPage
