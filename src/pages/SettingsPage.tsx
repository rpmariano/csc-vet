import React, { useState, useEffect } from 'react'
import { 
  Save, 
  User as UserIcon, 
  Phone, 
  Mail, 
  Shield, 
  HeartPulse, 
  FileText, 
  ExternalLink,
  Check,
  AlertCircle,
  Lock
} from 'lucide-react'
import { useAuth, cleanNotesFromRolesTag } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import SoccerPitchSelector, { parsePositions } from '../components/SoccerPitchSelector'
import { toast } from '../context/ToastContext'

const SettingsPage: React.FC = () => {
  const { profile, assignedRoles, toggleClinicalStatus, refreshProfile } = useAuth()
  
  // 1. Identificação Pessoal & Fiscal
  const [formName, setFormName] = useState('')
  const [formShirtName, setFormShirtName] = useState('')
  const [formBirthDate, setFormBirthDate] = useState('')
  const [formNationality, setFormNationality] = useState('Portuguesa')
  const [formNif, setFormNif] = useState('')
  const [formIdNumber, setFormIdNumber] = useState('')
  const [formIdCardExpiry, setFormIdCardExpiry] = useState('')

  // 2. Morada & Residência
  const [formAddress, setFormAddress] = useState('')
  const [formPostalCode, setFormPostalCode] = useState('')
  const [formCity, setFormCity] = useState('')

  // 3. Contactos
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')

  // 4. Dados Desportivos & Função (Somente Leitura para Jogador)
  const [formPositions, setFormPositions] = useState<string[]>(['Médio Centro'])
  const [formJerseyNumber, setFormJerseyNumber] = useState<number | ''>('')
  const [formKitSize, setFormKitSize] = useState('L')

  // 5. Dados Bancários & Quotas
  const [formIban, setFormIban] = useState('')
  const [formMemberNumber, setFormMemberNumber] = useState('')

  // 6. Saúde & Contacto de Emergência
  const [formEmergencyName, setFormEmergencyName] = useState('')
  const [formEmergencyPhone, setFormEmergencyPhone] = useState('')
  const [formMedicalNotes, setFormMedicalNotes] = useState('')

  // 7. Documentos & RGPD
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null)
  const [insuranceDocUrl, setInsuranceDocUrl] = useState<string | null>(null)
  const [medicalExamDocUrl, setMedicalExamDocUrl] = useState<string | null>(null)
  const [formGdprConsent, setFormGdprConsent] = useState(false)

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setFormName(profile.name || '')
      setFormShirtName(profile.shirt_name || profile.nickname || '')
      setFormBirthDate(profile.birth_date ? profile.birth_date.substring(0, 10) : '')
      setFormNationality(profile.nationality || 'Portuguesa')
      setFormNif(profile.nif || '')
      setFormIdNumber(profile.id_number || '')
      setFormIdCardExpiry(profile.id_card_expiry ? profile.id_card_expiry.substring(0, 10) : '')

      setFormAddress(profile.address || '')
      setFormPostalCode(profile.postal_code || '')
      setFormCity(profile.city || '')

      setFormEmail(profile.email || '')
      setFormPhone(profile.phone || '')

      setFormPositions(parsePositions(profile.position))
      setFormJerseyNumber(profile.jersey_number !== null && profile.jersey_number !== undefined ? profile.jersey_number : '')
      setFormKitSize(profile.kit_size || 'L')

      setFormIban(profile.iban || '')
      setFormMemberNumber(profile.member_number || '')

      setFormEmergencyName(profile.emergency_contact_name || '')
      setFormEmergencyPhone(profile.emergency_contact_phone || '')
      setFormMedicalNotes(cleanNotesFromRolesTag(profile.medical_notes) || '')

      setPhotoUrl(profile.photo_url || null)
      setIdDocUrl(profile.id_document_url || null)
      setInsuranceDocUrl(profile.insurance_doc_url || null)
      setMedicalExamDocUrl(profile.medical_exam_doc_url || null)
      setFormGdprConsent(Boolean(profile.gdpr_consent))
    }
  }, [profile])

  const handleUploadFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'photo' | 'idDoc' | 'insurance' | 'medical'
  ) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    const ext = file.name.split('.').pop()
    const fileName = `profile_${field}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveSuccess(false)
    setSaveError(null)
    if (!profile) return

    if (!formName.trim()) {
      setSaveError('O Nome Completo é obrigatório.')
      toast.warning('O Nome Completo é obrigatório.')
      return
    }

    setIsSaving(true)

    const sanitizeDate = (val?: string | null) => (val && val.trim() ? val.trim() : null)
    const sanitizeText = (val?: string | null) => (val && val.trim() ? val.trim() : null)
    // Os papéis já não viajam escondidos dentro das notas médicas: vivem na coluna
    // `roles`, que só um administrador pode escrever. Aqui guardamos apenas o texto.
    const medicalNotesEncoded = sanitizeText(formMedicalNotes)

    const payload = {
      name: formName.trim(),
      shirt_name: sanitizeText(formShirtName),
      nickname: sanitizeText(formShirtName),
      phone: sanitizeText(formPhone),
      birth_date: sanitizeDate(formBirthDate),
      nationality: sanitizeText(formNationality) || 'Portuguesa',
      address: sanitizeText(formAddress),
      postal_code: sanitizeText(formPostalCode),
      city: sanitizeText(formCity),
      nif: sanitizeText(formNif),
      id_number: sanitizeText(formIdNumber),
      id_card_expiry: sanitizeDate(formIdCardExpiry),
      iban: sanitizeText(formIban),
      member_number: sanitizeText(formMemberNumber),
      emergency_contact_name: sanitizeText(formEmergencyName),
      emergency_contact_phone: sanitizeText(formEmergencyPhone),
      medical_notes: medicalNotesEncoded,
      photo_url: photoUrl || null,
      id_document_url: idDocUrl || null,
      insurance_doc_url: insuranceDocUrl || null,
      medical_exam_doc_url: medicalExamDocUrl || null,
      gdpr_consent: Boolean(formGdprConsent),
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', profile.id)

      if (error) throw error

      await refreshProfile()
      setSaveSuccess(true)
      toast.success('Alterações guardadas com sucesso!')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      const errTxt = 'Erro ao guardar alterações: ' + (err.message || 'Verifique os dados')
      setSaveError(errTxt)
      toast.error(errTxt)
    } finally {
      setIsSaving(false)
    }
  }

  const isInjured = profile?.status === 'injured'
  const isInactive = profile?.status === 'inactive'

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      
      {/* CABEÇALHO DA FICHA DE MEMBRO */}
      <div className="bg-csc-dark text-white rounded-3xl p-6 sm:p-7 border border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <img src={photoUrl} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover border-2 border-csc-gold shadow-sm" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-csc-dark text-csc-gold flex items-center justify-center font-black text-2xl shadow-sm">
              {formName ? formName.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
                {formName || 'O Meu Perfil'}
              </h1>
              {formJerseyNumber && (
                <span className="bg-csc-dark text-csc-gold font-black text-xs px-2 py-0.5 rounded-lg shadow-2xs">
                  #{formJerseyNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Ficha cadastral de atleta • Grupo Dramático e Sportivo de Cascais
            </p>
          </div>
        </div>

        {/* ESTADO DE ATIVIDADE & TOGGLE CLÍNICO */}
        <div className="flex items-center flex-wrap gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
          {/* Badge de Atividade (Apenas Leitura para o Jogador) */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10" title="O estado de filiação/atividade é gerido pela direção do clube">
            <span className="text-[11px] font-bold text-white/50">Atividade:</span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
              isInactive ? 'bg-gray-300 text-gray-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {isInactive ? '⚪ Inativo' : '🟢 Ativo'}
            </span>
          </div>

          {/* Toggle Clínico: Apto / Lesionado */}
          <button
            type="button"
            onClick={() => toggleClinicalStatus()}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-xs cursor-pointer border active:scale-95 ${
              isInjured
                ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 animate-pulse ring-2 ring-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 ring-2 ring-emerald-150'
            }`}
            title="Clique para alternar o seu estado físico entre Apto e Lesionado"
          >
            <span>{isInjured ? '🔴' : '🟢'}</span>
            <span>{isInjured ? 'Lesionado' : 'Apto'}</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border-2 border-emerald-300 text-xs font-bold flex items-center gap-2 shadow-xs animate-fade-in">
          <Check size={18} className="text-emerald-600 shrink-0" />
          <span>Ficha de membro atualizada com sucesso na base de dados!</span>
        </div>
      )}

      {saveError && (
        <div className="bg-red-50 text-red-800 p-4 rounded-2xl border-2 border-red-300 text-xs font-bold flex items-center gap-2 shadow-xs">
          <AlertCircle size={18} className="text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* 1. DADOS PESSOAIS & IDENTIFICAÇÃO FISCAL */}
        <div className="bg-csc-dark text-white p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xs space-y-4">
          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <UserIcon size={16} className="text-csc-gold" />
            <span>1. Identificação Pessoal & Fiscal</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Nome Completo *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
                placeholder="Ex: André Gomes Marques do Couto"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Nome na Camisola / Alcunha</label>
              <input
                type="text"
                value={formShirtName}
                onChange={(e) => setFormShirtName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
                placeholder="Ex: A. COUTO"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Data de Nascimento</label>
              <input
                type="date"
                value={formBirthDate}
                onChange={(e) => setFormBirthDate(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Nacionalidade</label>
              <input
                type="text"
                value={formNationality}
                onChange={(e) => setFormNationality(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
                placeholder="Portuguesa"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Nº de Contribuinte (NIF)</label>
              <input
                type="text"
                value={formNif}
                onChange={(e) => setFormNif(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium font-mono text-gray-900"
                placeholder="000 000 000"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Nº Cartão de Cidadão / Passaporte</label>
              <input
                type="text"
                value={formIdNumber}
                onChange={(e) => setFormIdNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium font-mono text-gray-900"
                placeholder="00000000"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Validade do Cartão de Cidadão</label>
              <input
                type="date"
                value={formIdCardExpiry}
                onChange={(e) => setFormIdCardExpiry(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* 2. MORADA & RESIDÊNCIA */}
        <div className="bg-csc-dark text-white p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xs space-y-4">
          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <FileText size={16} className="text-csc-gold" />
            <span>2. Morada & Residência</span>
          </h3>

          <div>
            <label className="block text-xs font-bold text-white/70 mb-1">Morada (Rua, Nº e Andar)</label>
            <input
              type="text"
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
              placeholder="Rua e número da morada"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Código Postal</label>
              <input
                type="text"
                value={formPostalCode}
                onChange={(e) => setFormPostalCode(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium font-mono text-gray-900"
                placeholder="0000-000"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Localidade</label>
              <input
                type="text"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
                placeholder="Cascais / Alcabideche"
              />
            </div>
          </div>
        </div>

        {/* 3. CONTACTOS */}
        <div className="bg-csc-dark text-white p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xs space-y-4">
          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <Phone size={16} className="text-csc-gold" />
            <span>3. Contactos</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Email de Acesso (Apenas Leitura)</label>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white/50 font-medium font-mono">
                <Mail size={15} className="mr-2 text-white/30" />
                <span>{formEmail}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Telemóvel</label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium font-mono text-gray-900"
                placeholder="912 345 678"
              />
            </div>
          </div>
        </div>

        {/* 4. DADOS DESPORTIVOS, EQUIPAMENTO & FUNÇÃO (SÓ DE VISUALIZAÇÃO COM AVISO DO TREINADOR) */}
        <div className="bg-csc-dark p-5 sm:p-6 rounded-3xl border-2 border-amber-400/40 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-amber-400/20 pb-3">
            <h3 className="text-xs font-black text-amber-200 uppercase tracking-wider flex items-center gap-2">
              <Shield size={16} className="text-amber-400" />
              <span>4. Dados Desportivos, Equipamento & Função</span>
            </h3>
            <span className="text-[11px] font-bold text-amber-200 bg-amber-500/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
              <Lock size={12} />
              <span>Só de Visualização</span>
            </span>
          </div>

          {/* Banner explicativo obrigatório */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-400/30 rounded-2xl flex items-start gap-2.5 text-xs text-amber-100 font-medium">
            <AlertCircle size={17} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-amber-200">Nota da Equipa Técnica:</p>
              <p className="mt-0.5">
                Os dados desta secção (posições no campo, funções no clube, número de camisola e tamanho de equipamento) são atribuídos e geridos exclusivamente pelo <strong>treinador / equipa técnica</strong>.
              </p>
            </div>
          </div>

          {/* Visualização de Posições no Campo */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-white/70">
              Posições Táticas Atribuídas:
            </label>
            <div className="pointer-events-none opacity-95">
              <SoccerPitchSelector
                selectedPositions={formPositions}
                onChange={() => {}}
              />
            </div>
          </div>

          {/* Funções e Atribuições */}
          <div className="pt-3 border-t border-amber-400/20 space-y-2">
            <label className="block text-xs font-bold text-white/70">
              Funções Atribuídas no Clube:
            </label>
            <div className="flex flex-wrap gap-2">
              {(assignedRoles || ['player']).map(r => (
                <span
                  key={r}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs border flex items-center gap-1.5 shadow-2xs ${
                    r === 'admin'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : r === 'coach'
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  }`}
                >
                  <span>{r === 'admin' ? '🛡️ Administrador / Direção' : r === 'coach' ? '📋 Treinador' : '⚽ Jogador'}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Camisola e Equipamento (Read-only) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-amber-400/20">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Nº da Camisola (Dorsal)</label>
              <div className="px-3.5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-xs sm:text-sm font-extrabold text-white">
                {formJerseyNumber ? `#${formJerseyNumber}` : 'Não atribuído'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Tamanho de Equipamento</label>
              <div className="px-3.5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-xs sm:text-sm font-extrabold text-white">
                {formKitSize || 'L'}
              </div>
            </div>
          </div>
        </div>

        {/* 5. DADOS BANCÁRIOS & QUOTAS */}
        <div className="bg-csc-dark text-white p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xs space-y-4">
          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <Shield size={16} className="text-csc-gold" />
            <span>5. Dados Bancários & Quotas</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">IBAN (Débito Direto / Quotas)</label>
              <input
                type="text"
                value={formIban}
                onChange={(e) => setFormIban(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium font-mono text-gray-900"
                placeholder="PT50 0000 0000 0000 0000 0"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Nº de Sócio do Clube</label>
              <input
                type="text"
                value={formMemberNumber}
                onChange={(e) => setFormMemberNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium font-mono text-gray-900"
                placeholder="Ex: 1420"
              />
            </div>
          </div>
        </div>

        {/* 6. SAÚDE & CONTACTO DE EMERGÊNCIA */}
        <div className="bg-csc-dark text-white p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xs space-y-4">
          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <HeartPulse size={16} className="text-red-600" />
            <span>6. Saúde & Contacto de Emergência</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Contacto de Emergência (Nome / Relação)</label>
              <input
                type="text"
                value={formEmergencyName}
                onChange={(e) => setFormEmergencyName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
                placeholder="Ex: Maria (Esposa)"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Telefone de Emergência</label>
              <input
                type="tel"
                value={formEmergencyPhone}
                onChange={(e) => setFormEmergencyPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium font-mono text-gray-900"
                placeholder="960 000 000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-white/70 mb-1">Notas Médicas / Alergias / Grupo Sanguíneo</label>
            <textarea
              value={formMedicalNotes}
              onChange={(e) => setFormMedicalNotes(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium text-gray-900"
              placeholder="Ex: Alergia a anti-inflamatórios, Tipo O+, histórico de lesão no joelho direito..."
            />
          </div>
        </div>

        {/* 7. UPLOAD DE DOCUMENTOS & RGPD */}
        <div className="bg-csc-dark text-white p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xs space-y-4">
          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
            <FileText size={16} className="text-csc-gold" />
            <span>7. Documentos & Proteção de Dados (RGPD)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Foto de Perfil */}
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl space-y-2">
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
                  <img src={photoUrl} alt="Preview" className="w-8 h-8 rounded-full object-cover border border-csc-gold" />
                  <span className="text-[11px] text-green-700 font-bold">✓ Foto anexada</span>
                </div>
              )}
            </div>

            {/* Documento de Identificação */}
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl space-y-2">
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
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl space-y-2">
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
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl space-y-2">
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
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-400/30 rounded-2xl">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formGdprConsent}
                onChange={(e) => setFormGdprConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-csc-dark border-gray-300 cursor-pointer"
              />
              <span className="text-xs text-white/70 leading-relaxed font-medium">
                Declaro que autorizo o <strong>Grupo Dramático e Sportivo de Cascais</strong> a tratar os meus dados pessoais, contactos, médicos e de imagem para efeitos desportivos, seguros e gestão associativa ao abrigo do RGPD.
              </span>
            </label>
          </div>
        </div>

        {/* BOTÃO SUBMIT */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-csc-dark hover:bg-black text-white px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <Save size={18} className="text-csc-gold" />
            <span>{isSaving ? 'A guardar alterações...' : '💾 Guardar o Meu Perfil'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

export default SettingsPage
