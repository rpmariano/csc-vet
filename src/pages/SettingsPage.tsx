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
  Lock,
  LogOut,
  ChevronLeft,
  Bell,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth, cleanNotesFromRolesTag } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { CLUBE_NOME, CLUBE_SIGLA } from '../lib/clube'
import { supabase } from '../lib/supabaseClient'
import { RELACOES_EMERGENCIA } from './TeamManagementPage'
import { useEstadoPagamentos } from '../hooks/useEstadoPagamentos'

/** Euros em português — a mesma notação do Financeiro. */
const EUROS_PERFIL = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
import SoccerPitchSelector, { parsePositions } from '../components/SoccerPitchSelector'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { OsMeusPagamentos } from '../components/OsMeusPagamentos'
import { PreferenciasAvisos } from '../components/PreferenciasAvisos'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { useGuardaDeSaida } from '../context/SaidaGuardadaContext'

/** Um submit sem evento a sério — o formulário só lhe chama `preventDefault`. */
const EVENTO_FALSO = { preventDefault: () => {} } as React.FormEvent

/** Campo branco de 44px do handoff (ecrã 5b). */
const CAMPO =
  'w-full h-11 px-3 rounded-[13px] bg-white text-csc-tinta font-display font-bold text-xs ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold'

/** Etiqueta pequena, em maiúsculas, por cima do campo. */
const ETIQUETA =
  'block font-display font-bold text-[9px] tracking-[0.1em] uppercase text-white/60 mb-1'

/** Cabeçalho numerado de secção ("1 · IDENTIFICAÇÃO…"). */
const SECCAO =
  'font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 ' +
  'flex items-center gap-2 mb-2.5'

const SettingsPage: React.FC = () => {
  const { profile, assignedRoles, actualRole, setSimulatedRole, toggleClinicalStatus, refreshProfile, signOut } = useAuth()
  const { clubSettings } = useClub()
  const navegar = useNavigate()
  
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
  const [formPreferredFoot, setFormPreferredFoot] = useState('')

  // 6. Dados Bancários & Quotas
  const [formIban, setFormIban] = useState('')
  const [formMemberNumber, setFormMemberNumber] = useState('')

  // 7. Saúde & Contacto de Emergência
  const [formEmergencyName, setFormEmergencyName] = useState('')
  const [formEmergencyPhone, setFormEmergencyPhone] = useState('')
  const [formEmergencyRelation, setFormEmergencyRelation] = useState('')
  const [formMedicalNotes, setFormMedicalNotes] = useState('')

  // 8. Documentos & RGPD
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [idDocUrl, setIdDocUrl] = useState<string | null>(null)
  const [insuranceDocUrl, setInsuranceDocUrl] = useState<string | null>(null)
  const [medicalExamDocUrl, setMedicalExamDocUrl] = useState<string | null>(null)
  const [formGdprConsent, setFormGdprConsent] = useState(false)

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [pagamentosAbertos, setPagamentosAbertos] = useState(false)
  /* O estado de pagamentos pinta o cartão; a persiana refaz as contas quando
     abre, e são as mesmas contas — o `useEstadoPagamentos` é um só. */
  const pagamentos = useEstadoPagamentos(profile, Boolean(profile?.id))
  const [avisosAbertos, setAvisosAbertos] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  /*
    O Perfil é um formulário que ocupa a página: não se fecha, sai-se dele a
    navegar. A barra de baixo e o avatar do cabeçalho perguntam antes de levar
    o utilizador embora — quem escrevia o IBAN e tocava em "Hoje" perdia-o sem
    uma palavra.

    O `perfilCarregado` diz ao guarda quando o formulário já representa a
    ficha: a fotografia não pode ser tirada quando `profile` chega, porque os
    campos só são preenchidos no efeito a seguir, e esse preenchimento contaria
    como alteração — o Perfil abria já a avisar.
  */
  const [perfilCarregado, setPerfilCarregado] = useState(false)

  const guardaPerfil = useAlteracoesPorGravar({
    aberto: true,
    pronto: perfilCarregado,
    valores: [
      formName, formShirtName, formBirthDate, formNationality, formNif, formIdNumber,
      formIdCardExpiry, formAddress, formPostalCode, formCity, formEmail, formPhone,
      formPositions, formJerseyNumber, formKitSize, formPreferredFoot, formIban,
      formMemberNumber, formEmergencyName, formEmergencyPhone, formEmergencyRelation,
      formMedicalNotes, formGdprConsent, photoUrl, idDocUrl, insuranceDocUrl, medicalExamDocUrl,
    ],
    aoGravar: () => handleSave(EVENTO_FALSO),
    // Não há para onde "sair": a navegação é que segue. O formulário fica como
    // está, e a página vai desmontar de qualquer forma.
    aoSair: () => {},
    descricao: 'As alterações ao teu perfil ainda não foram gravadas. Se saíres agora, perdem-se.',
  })

  useGuardaDeSaida({
    sujo: guardaPerfil.sujo,
    gravar: () => handleSave(EVENTO_FALSO),
    descricao: 'As alterações ao teu perfil ainda não foram gravadas. Se saíres agora, perdem-se.',
  })

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
      setFormPreferredFoot(profile.preferred_foot || '')

      setFormIban(profile.iban || '')
      setFormMemberNumber(profile.member_number || '')

      setFormEmergencyName(profile.emergency_contact_name || '')
      setFormEmergencyPhone(profile.emergency_contact_phone || '')
      setFormEmergencyRelation(profile.emergency_contact_relation || '')
      setFormMedicalNotes(cleanNotesFromRolesTag(profile.medical_notes) || '')

      setPhotoUrl(profile.photo_url || null)
      setIdDocUrl(profile.id_document_url || null)
      setInsuranceDocUrl(profile.insurance_doc_url || null)
      setMedicalExamDocUrl(profile.medical_exam_doc_url || null)
      setFormGdprConsent(Boolean(profile.gdpr_consent))
      /*
        Só a partir daqui é que o formulário representa a ficha. O guarda de
        alterações espera por este sinal: sem ele tirava a fotografia no render
        em que `profile` chega — com os campos ainda vazios — e o preenchimento
        que se segue contava como alteração do utilizador. O Perfil abria já a
        avisar que tinha coisas por gravar.
      */
      setPerfilCarregado(true)
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
      emergency_contact_relation: formEmergencyRelation ? sanitizeText(formEmergencyRelation) : null,
      medical_notes: medicalNotesEncoded,
      photo_url: photoUrl || null,
      id_document_url: idDocUrl || null,
      insurance_doc_url: insuranceDocUrl || null,
      medical_exam_doc_url: medicalExamDocUrl || null,
      gdpr_consent: Boolean(formGdprConsent),
      /* O equipamento e o pé são do próprio: quem sabe que tamanho veste e de
         que pé joga é ele. A RLS deixa — a política de UPDATE da própria ficha
         só guarda `role` e `roles`. O que fica travado é o que a equipa técnica
         atribui: posições, funções e número de camisola. */
      kit_size: sanitizeText(formKitSize),
      preferred_foot: formPreferredFoot ? sanitizeText(formPreferredFoot) : null,
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', profile.id)

      if (error) throw error

      await refreshProfile()
      /* O Perfil não fecha ao gravar: sem uma fotografia nova ficava sujo para
         sempre, e a barra de baixo passava a perguntar em todos os toques. */
      guardaPerfil.marcarComoGravado()
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
    <div className="space-y-4 pb-2">
      
      {/* Voltar: o Perfil abre-se da fotografia de qualquer ecrã, e o caminho
          de volta é sempre para trás — não para um destino fixo. */}
      <button
        type="button"
        onClick={() => navegar(-1)}
        className="flex items-center gap-3 min-h-11 -ml-1 pr-3 cursor-pointer
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        <span className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white flex-none">
          <ChevronLeft size={18} />
        </span>
        <span className="font-display font-bold text-xs text-white/60">Voltar</span>
      </button>

      {/* Quem sou eu, em grande. */}
      <div className="flex items-center gap-4 pt-1">
        <span
          className="relative w-[74px] h-[74px] rounded-full border-[2.5px] border-csc-gold/55 flex items-center justify-center
            font-display font-extrabold text-[22px] text-csc-gold flex-none"
          style={{ background: photoUrl ? undefined : 'linear-gradient(140deg,#3a4143,#1b1f20)' }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span>{formJerseyNumber || (formName ? formName.charAt(0).toUpperCase() : 'U')}</span>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-black text-[26px] leading-[1.05] text-white tracking-[-0.02em] truncate">
            {profile?.nickname?.trim() || formShirtName?.trim() || formName?.split(' ')[0] || 'O meu perfil'}
          </p>
          <p className="text-[11px] text-white/62 mt-1 truncate">{formName}</p>
          <p className="text-[10px] leading-snug text-white/62 mt-1">
            Ficha cadastral de atleta · {clubSettings?.initials ?? CLUBE_SIGLA}
          </p>
        </div>
      </div>

      {/* Atividade e estado físico: um é da direção, o outro é do próprio. */}
      <div className="flex gap-2.5">
        <div className="cartao-simples flex-1 flex items-center gap-2.5 px-3.5 py-3">
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-[8.5px] tracking-[0.12em] uppercase text-white/62">
              Atividade
            </span>
            <span className="block font-display font-extrabold text-[12.5px] text-white mt-1.5">
              {isInactive ? 'Inativo' : 'Ativo'}
            </span>
          </span>
          <Lock size={13} className="text-white/30 shrink-0" />
        </div>

        <button
          type="button"
          onClick={() => toggleClinicalStatus()}
          aria-pressed={isInjured}
          className={`flex-1 flex flex-col items-start gap-1.5 px-3.5 py-3 rounded-[18px] border text-left cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
              isInjured
                ? 'bg-csc-red/14 border-csc-red/35'
                : 'bg-csc-light/14 border-csc-light/35'
            }`}
        >
          <span
            className={`font-display font-bold text-[8.5px] tracking-[0.12em] uppercase ${
              isInjured ? 'text-csc-vermelho-texto' : 'text-csc-verde-texto'
            }`}
          >
            Estado físico
          </span>
          <span className="font-display font-extrabold text-[12.5px] text-white">
            {isInjured ? 'Lesionado' : 'Apto'}
          </span>
        </button>
      </div>

      <p className="text-[10px] leading-snug text-white/62 px-1 -mt-1">
        A atividade é gerida pela direção. O estado físico alternas tu, entre apto e lesionado.
      </p>

      {/*
        As duas coisas da conta que não são a ficha: o que devo, e o que quero
        que a app me avise (ecrãs 12c e 12b). Ficam aqui em cima, antes do
        formulário, porque são consulta e não preenchimento — quem vem ver
        quanto deve não devia ter de passar por sete secções de dados
        pessoais.
      */}
      <div className="flex gap-2.5">
        {/* A mesma cor do sinal de € do cabeçalho: vermelho com alguma coisa
            vencida, laranja a menos de oito dias, neutro em dia. Duas cores
            diferentes para o mesmo estado, em dois sítios do mesmo ecrã, era
            deixar o atleta a decidir em qual acreditar. */}
        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setPagamentosAbertos(true) }}
          className={`cartao-simples flex-1 min-h-14 flex items-center gap-2.5 px-3.5 py-3 text-left cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
              pagamentos.cor === 'vermelho'
                ? 'bg-csc-red/12 border-csc-red/32'
                : pagamentos.cor === 'laranja'
                  ? 'bg-amber-500/12 border-amber-400/32'
                  : ''
            }`}
        >
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-display font-black text-[14px] ${
            pagamentos.cor === 'vermelho'
              ? 'bg-csc-red/22 text-csc-vermelho-texto'
              : pagamentos.cor === 'laranja'
                ? 'bg-amber-500/22 text-amber-300'
                : 'bg-csc-gold/18 text-csc-gold'
          }`}>
            €
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-extrabold text-[12.5px] text-white">
              Os meus pagamentos
            </span>
            <span className={`block text-[10px] mt-0.5 ${
              pagamentos.cor === 'vermelho'
                ? 'text-csc-vermelho-texto'
                : pagamentos.cor === 'laranja'
                  ? 'text-amber-300'
                  : 'text-white/62'
            }`}>
              {pagamentos.cor === 'vermelho'
                ? `${pagamentos.emAtraso.length} em atraso · ${EUROS_PERFIL.format(pagamentos.emAtraso.reduce((t, i) => t + i.valor, 0))}`
                : pagamentos.cor === 'laranja'
                  ? `${pagamentos.aVencer.length} a vencer · ${EUROS_PERFIL.format(pagamentos.totalEmAviso)}`
                  : 'Quotas e encargos'}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setAvisosAbertos(true) }}
          className="cartao-simples flex-1 min-h-14 flex items-center gap-2.5 px-3.5 py-3 text-left cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
        >
          <span className="w-8 h-8 rounded-xl bg-white/10 text-csc-gold flex items-center justify-center shrink-0">
            <Bell size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-extrabold text-[12.5px] text-white">
              Avisos
            </span>
            <span className="block text-[10px] text-white/62 mt-0.5">O que quero saber</span>
          </span>
        </button>
      </div>

      <OsMeusPagamentos
        aberto={pagamentosAbertos}
        aoFechar={() => setPagamentosAbertos(false)}
        jogador={profile}
      />

      <PreferenciasAvisos
        aberto={avisosAbertos}
        aoFechar={() => setAvisosAbertos(false)}
        perfilId={profile?.id}
        eEquipaTecnica={profile?.role === 'coach' || profile?.role === 'admin'}
      />

      {/*
        Alternar entre os perfis atribuídos. Vivia na pílula de cargo do
        cabeçalho da app, que o redesenho eliminou — e o sítio certo é este: é
        uma definição da conta, não uma ação de todos os ecrãs. Só aparece a
        quem tem mais do que um perfil.
      */}
      {(assignedRoles?.length ?? 1) > 1 && (
        <div className="cartao-simples p-4">
          <p className="font-display font-extrabold uppercase text-[9.5px] tracking-[0.18em] text-white/62">
            Ver a app como
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {(['admin', 'coach', 'player'] as const)
              .filter(papel => assignedRoles?.includes(papel))
              .map(papel => {
                const escolhido = profile?.role === papel
                return (
                  <button
                    key={papel}
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium')
                      setSimulatedRole(papel === actualRole ? null : papel)
                    }}
                    aria-pressed={escolhido}
                    className={`min-h-11 px-4 rounded-[22px] border font-display font-bold text-xs cursor-pointer
                      transition-transform duration-150 active:scale-97 ${
                        escolhido
                          ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                          : 'bg-white/5 border-white/12 text-white/70'
                      }`}
                  >
                    {papel === 'admin' ? 'Direção' : papel === 'coach' ? 'Treinador' : 'Jogador'}
                    {papel === actualRole && ' (real)'}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="cartao-simples bg-csc-light/12 border-csc-light/30 p-4 text-[11px] font-bold text-white flex items-center gap-2 animate-fade-in">
          <Check size={16} className="text-csc-verde-texto shrink-0" />
          <span>Ficha de membro atualizada com sucesso na base de dados!</span>
        </div>
      )}

      {saveError && (
        <div className="cartao-simples bg-csc-red/12 border-csc-red/30 p-4 text-[11px] font-bold text-csc-vermelho-suave flex items-center gap-2">
          <AlertCircle size={16} className="text-csc-vermelho-texto shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* 1. DADOS PESSOAIS & IDENTIFICAÇÃO FISCAL */}
        <div className="space-y-3.5">
          <h3 className={SECCAO}>
            <UserIcon size={16} className="text-csc-gold" />
            <span>1. Identificação Pessoal & Fiscal</span>
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
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
              <label className={ETIQUETA}>Nome na Camisola / Alcunha</label>
              <input
                type="text"
                value={formShirtName}
                onChange={(e) => setFormShirtName(e.target.value)}
                className={CAMPO}
                placeholder="Ex: A. COUTO"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
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
                className={`${CAMPO} font-mono`}
                placeholder="000 000 000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={ETIQUETA}>Nº Cartão de Cidadão / Passaporte</label>
              <input
                type="text"
                value={formIdNumber}
                onChange={(e) => setFormIdNumber(e.target.value)}
                className={`${CAMPO} font-mono`}
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
        <div className="space-y-3.5">
          <h3 className={SECCAO}>
            <FileText size={16} className="text-csc-gold" />
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

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={ETIQUETA}>Código Postal</label>
              <input
                type="text"
                value={formPostalCode}
                onChange={(e) => setFormPostalCode(e.target.value)}
                className={`${CAMPO} font-mono`}
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
        <div className="space-y-3.5">
          <h3 className={SECCAO}>
            <Phone size={16} className="text-csc-gold" />
            <span>3. Contactos</span>
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={ETIQUETA}>Email de Acesso (Apenas Leitura)</label>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white/70 font-medium font-mono">
                <Mail size={15} className="mr-2 text-white/60" />
                <span>{formEmail}</span>
              </div>
            </div>
            <div>
              <label className={ETIQUETA}>Telemóvel</label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className={`${CAMPO} font-mono`}
                placeholder="912 345 678"
              />
            </div>
          </div>
        </div>

        {/* 4. O QUE A EQUIPA TÉCNICA ATRIBUI — SÓ DE LEITURA */}
        <div className="bg-csc-dark p-5 sm:p-6 rounded-3xl border-2 border-amber-400/40 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-amber-400/20 pb-3">
            <h3 className="text-xs font-black text-amber-200 uppercase tracking-wider flex items-center gap-2">
              <Shield size={16} className="text-amber-400" />
              <span>4. Posições, Funções & Camisola</span>
            </h3>
            <span className="text-[11px] font-bold text-amber-200 bg-amber-500/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
              <Lock size={12} />
              <span>Atribuído pelo clube</span>
            </span>
          </div>

          {/* Banner explicativo obrigatório */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-400/30 rounded-2xl flex items-start gap-2.5 text-xs text-amber-100 font-medium">
            <AlertCircle size={17} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-amber-200">Nota da Equipa Técnica:</p>
              <p className="mt-0.5">
                As posições no campo, as funções no clube e o número de camisola são atribuídos pelo <strong>treinador / equipa técnica</strong>. O tamanho de equipamento e o pé preferido são teus — estão mais abaixo e podes mudá-los.
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
                      ? 'bg-csc-gold/15 text-csc-gold border-csc-gold/35'
                      : r === 'coach'
                      ? 'bg-csc-blue/20 text-csc-azul-texto border-csc-blue/40'
                      : 'bg-csc-light/15 text-csc-verde-texto border-csc-light/35'
                  }`}
                >
                  <span>{r === 'admin' ? 'Administrador / Direção' : r === 'coach' ? 'Treinador' : 'Jogador'}</span>
                </span>
              ))}
            </div>
          </div>

          {/* O número da camisola é atribuído: fica de leitura, com o resto. */}
          <div className="pt-3 border-t border-amber-400/20">
            <label className={ETIQUETA}>Nº da Camisola (Dorsal)</label>
            <div className="px-3.5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-xs sm:text-sm font-extrabold text-white">
              {formJerseyNumber ? `#${formJerseyNumber}` : 'Não atribuído'}
            </div>
          </div>
        </div>

        {/*
          O que o atleta sabe melhor do que o clube: que tamanho veste e de que
          pé joga. Estavam no bloco travado, junto com as posições e o número —
          e para mudar de tamanho era preciso pedir a alguém da direção.
        */}
        <div className="space-y-3.5">
          <h3 className={SECCAO}>
            <Shield size={16} className="text-csc-gold" />
            <span>5. Equipamento & Jogo</span>
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={ETIQUETA} htmlFor="perfil-tamanho">Tamanho de Equipamento</label>
              <select
                id="perfil-tamanho"
                value={formKitSize}
                onChange={(e) => setFormKitSize(e.target.value)}
                className={CAMPO}
              >
                {['S', 'M', 'L', 'XL', 'XXL'].map(t => (
                  <option key={t} value={t} className="bg-csc-superficie text-white">{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="perfil-pe">Pé preferido</label>
              <select
                id="perfil-pe"
                value={formPreferredFoot}
                onChange={(e) => setFormPreferredFoot(e.target.value)}
                className={CAMPO}
              >
                <option value="" className="bg-csc-superficie text-white">Não indicado</option>
                {['Direito', 'Esquerdo', 'Ambos'].map(pe => (
                  <option key={pe} value={pe} className="bg-csc-superficie text-white">{pe}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 6. DADOS BANCÁRIOS & QUOTAS */}
        <div className="space-y-3.5">
          <h3 className={SECCAO}>
            <Shield size={16} className="text-csc-gold" />
            <span>6. Dados Bancários & Quotas</span>
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
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
                className={`${CAMPO} font-mono`}
                placeholder="Ex: 1420"
              />
            </div>
          </div>

          {/* A janela de quota, só de leitura: quem a define é a direção, na
              ficha do atleta. Não aparecia em lado nenhum do lado do próprio,
              e é o que explica desde quando é que se deve quota. */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={ETIQUETA}>Início de atividade</label>
              <div className="px-3.5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-xs sm:text-sm font-extrabold text-white">
                {profile?.quota_start_date
                  ? new Date(profile.quota_start_date).toLocaleDateString('pt-PT')
                  : 'Desde o registo'}
              </div>
            </div>
            <div>
              <label className={ETIQUETA}>Fim de atividade</label>
              <div className="px-3.5 py-2.5 bg-white/10 border border-white/15 rounded-xl text-xs sm:text-sm font-extrabold text-white">
                {profile?.quota_end_date
                  ? new Date(profile.quota_end_date).toLocaleDateString('pt-PT')
                  : 'Sem fim marcado'}
              </div>
            </div>
          </div>
        </div>

        {/* 7. SAÚDE & CONTACTO DE EMERGÊNCIA */}
        <div className="space-y-3.5">
          <h3 className={SECCAO}>
            <HeartPulse size={16} className="text-csc-vermelho-texto" />
            <span>7. Saúde & Contacto de Emergência</span>
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={ETIQUETA} htmlFor="perfil-emerg-nome">Contacto de Emergência (Nome)</label>
              <input
                id="perfil-emerg-nome"
                type="text"
                value={formEmergencyName}
                onChange={(e) => setFormEmergencyName(e.target.value)}
                className={CAMPO}
                placeholder="Ex: Maria Silva"
              />
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="perfil-emerg-relacao">Relação</label>
              <select
                id="perfil-emerg-relacao"
                value={formEmergencyRelation}
                onChange={(e) => setFormEmergencyRelation(e.target.value)}
                className={CAMPO}
              >
                <option value="">Por indicar</option>
                {RELACOES_EMERGENCIA.map(r => (
                  <option key={r} value={r} className="bg-csc-superficie text-white">{r}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={ETIQUETA} htmlFor="perfil-emerg-tel">Telefone de Emergência</label>
            <input
              id="perfil-emerg-tel"
              type="tel"
              value={formEmergencyPhone}
              onChange={(e) => setFormEmergencyPhone(e.target.value)}
              className={`${CAMPO} font-mono`}
              placeholder="960 000 000"
            />
          </div>

          <div>
            <label className={ETIQUETA}>Notas Médicas / Alergias / Grupo Sanguíneo</label>
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
        <div className="space-y-3.5">
          <h3 className={SECCAO}>
            <FileText size={16} className="text-csc-gold" />
            <span>8. Documentos & Proteção de Dados (RGPD)</span>
          </h3>

          <div className="grid grid-cols-2 gap-2.5">
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
                  <span className="text-[11px] text-csc-verde-texto font-bold">Foto anexada</span>
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
                <a href={idDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-csc-azul-texto font-bold hover:underline flex items-center gap-1">
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
                <a href={insuranceDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-csc-azul-texto font-bold hover:underline flex items-center gap-1">
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
                <a href={medicalExamDocUrl} target="_blank" rel="noreferrer" className="text-[11px] text-csc-verde-texto font-bold hover:underline flex items-center gap-1">
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
                className="mt-0.5 w-4 h-4 rounded text-csc-dark border-white/15 cursor-pointer"
              />
              <span className="text-xs text-white/70 leading-relaxed font-medium">
                Declaro que autorizo o <strong>{clubSettings?.name ?? CLUBE_NOME}</strong> a tratar os meus dados pessoais, contactos, médicos e de imagem para efeitos desportivos, seguros e gestão associativa ao abrigo do RGPD.
              </span>
            </label>
          </div>
        </div>

        {/* BOTÃO SUBMIT */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full min-h-12 flex items-center justify-center gap-2 px-6 rounded-3xl bg-csc-gold text-csc-tinta font-display font-extrabold text-[12.5px] cursor-pointer transition-transform duration-150 active:scale-97 disabled:opacity-45"
          >
            <Save size={16} />
            <span>{isSaving ? 'A guardar…' : 'Guardar a minha ficha'}</span>
          </button>
        </div>
      </form>

      {/*
        Terminar sessão vivia na gaveta do menu, que o redesenho eliminou. O
        sítio certo é aqui, no Perfil — é o ecrã da conta, e é onde o handoff
        o põe (5b). Fica separado do formulário: sair não é guardar nada, e
        não deve parecer mais uma ação da ficha.
      */}
      <div className="mt-8 pt-5 border-t border-white/10">
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full min-h-11 flex items-center justify-center gap-2 px-4 rounded-2xl
            bg-csc-red/15 border border-csc-red/35 text-csc-vermelho-texto
            font-display font-extrabold text-xs cursor-pointer transition-transform duration-150 active:scale-97"
        >
          <LogOut size={16} />
          <span>Terminar Sessão</span>
        </button>
      </div>
    </div>
  )
}

export default SettingsPage
