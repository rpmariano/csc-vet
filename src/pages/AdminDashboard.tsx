import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Shield, MapPin, Trophy, Trash2, Building2, Upload, Save, Edit2, X, ExternalLink } from 'lucide-react'
import { useClub } from '../context/ClubContext'

// Interfaces
interface Field {
  id: string
  name: string
  address: string
}

interface Opponent {
  id: string
  name: string
  initials?: string
  logo_url?: string
  contact_name: string
  contact_phone: string
  home_field_id: string | null
}

interface Tournament {
  id: string
  name: string
  season: string
  status: 'agendado' | 'ativo' | 'terminado'
}

type TabType = 'club' | 'fields' | 'opponents' | 'tournaments'

const AdminDashboard: React.FC = () => {
  const { clubSettings, refreshSettings } = useClub()
  const [activeTab, setActiveTab] = useState<TabType>('club')
  
  // Club states
  const [clubName, setClubName] = useState('')
  const [clubInitials, setClubInitials] = useState('')
  const [clubHomeField, setClubHomeField] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Data states
  const [fields, setFields] = useState<Field[]>([])
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  // Field Edit/Create states
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [fieldName, setFieldName] = useState('')
  const [fieldAddress, setFieldAddress] = useState('')

  // Opponent Edit/Create states
  const [editingOppId, setEditingOppId] = useState<string | null>(null)
  const [oppName, setOppName] = useState('')
  const [oppInitials, setOppInitials] = useState('')
  const [oppLogo, setOppLogo] = useState<File | null>(null)
  const [oppContact, setOppContact] = useState('')
  const [oppPhone, setOppPhone] = useState('')
  const [oppField, setOppField] = useState('')
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null)
  const [uploadingOppLogo, setUploadingOppLogo] = useState(false)

  // Tournament Edit/Create states
  const [editingTourId, setEditingTourId] = useState<string | null>(null)
  const [tourName, setTourName] = useState('')
  const [tourSeason, setTourSeason] = useState('')
  const [tourStatus, setTourStatus] = useState<'agendado' | 'ativo' | 'terminado'>('agendado')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    
    const [resFields, resOpps, resTours] = await Promise.all([
      supabase.from('fields').select('*').order('name'),
      supabase.from('opponents').select('*').order('name'),
      supabase.from('tournaments').select('*').order('created_at', { ascending: false })
    ])

    if (resFields.data) setFields(resFields.data)
    if (resOpps.data) setOpponents(resOpps.data)
    if (resTours.data) setTournaments(resTours.data)
    
    setLoading(false)
  }

  useEffect(() => {
    if (clubSettings) {
      setClubName(clubSettings.name)
      setClubInitials(clubSettings.initials)
      setClubHomeField(clubSettings.home_field_id || localStorage.getItem('csc_club_home_field_id') || '')
    }
  }, [clubSettings])

  // --- GOOGLE MAPS HELPER ---
  const getGoogleMapsUrl = (query: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  }

  // --- CLUB ---
  const handleUpdateClub = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clubName || !clubInitials) return
    localStorage.setItem('csc_club_home_field_id', clubHomeField)
    try {
      const { error } = await supabase
        .from('club_settings')
        .update({ 
          name: clubName, 
          initials: clubInitials,
          home_field_id: clubHomeField || null
        })
        .eq('id', 1)

      if (!error) {
        alert('Definições do clube atualizadas com sucesso!')
        refreshSettings()
      } else {
        // Fallback se a coluna home_field_id ainda nao existir no supabase
        await supabase.from('club_settings').update({ name: clubName, initials: clubInitials }).eq('id', 1)
        alert('Definições do clube atualizadas!')
        refreshSettings()
      }
    } catch {
      alert('Definições do clube atualizadas!')
      refreshSettings()
    }
  }

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingLogo(true)
      if (!e.target.files || e.target.files.length === 0) return
      
      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `logo_${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('club_assets')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('club_assets')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('club_settings')
        .update({ logo_url: publicUrl })
        .eq('id', 1)

      if (updateError) throw updateError

      alert('Símbolo atualizado com sucesso!')
      refreshSettings()
    } catch (error: any) {
      alert('Erro ao fazer upload do símbolo: ' + error.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  // --- FIELDS ---
  const handleStartEditField = (f: Field) => {
    setEditingFieldId(f.id)
    setFieldName(f.name)
    setFieldAddress(f.address || '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEditField = () => {
    setEditingFieldId(null)
    setFieldName('')
    setFieldAddress('')
  }

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fieldName) return

    if (editingFieldId) {
      // Update
      const { error } = await supabase
        .from('fields')
        .update({ name: fieldName, address: fieldAddress })
        .eq('id', editingFieldId)

      if (error) {
        alert('Erro ao atualizar campo: ' + error.message)
      } else {
        handleCancelEditField()
        fetchData()
      }
    } else {
      // Insert
      const { error } = await supabase.from('fields').insert([{ name: fieldName, address: fieldAddress }])
      if (error) {
        alert('Erro ao criar campo: ' + error.message)
      } else {
        setFieldName('')
        setFieldAddress('')
        fetchData()
      }
    }
  }

  const handleDeleteField = async (id: string) => {
    if (!confirm('Eliminar este campo?')) return
    await supabase.from('fields').delete().eq('id', id)
    if (editingFieldId === id) handleCancelEditField()
    fetchData()
  }

  // --- OPPONENTS ---
  const handleStartEditOpponent = (o: Opponent) => {
    setEditingOppId(o.id)
    setOppName(o.name)
    setOppInitials(o.initials || '')
    setOppContact(o.contact_name || '')
    setOppPhone(o.contact_phone || '')
    setOppField(o.home_field_id || '')
    setExistingLogoUrl(o.logo_url || null)
    setOppLogo(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEditOpponent = () => {
    setEditingOppId(null)
    setOppName('')
    setOppInitials('')
    setOppContact('')
    setOppPhone('')
    setOppField('')
    setExistingLogoUrl(null)
    setOppLogo(null)
  }

  const handleSaveOpponent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oppName) return

    setUploadingOppLogo(true)
    let publicLogoUrl: string | null = existingLogoUrl

    try {
      if (oppLogo) {
        const fileExt = oppLogo.name.split('.').pop()
        const fileName = `opp_${Math.random()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from('club_assets')
          .upload(fileName, oppLogo, { upsert: true })

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('club_assets').getPublicUrl(fileName)
        publicLogoUrl = data.publicUrl
      }

      const payload = {
        name: oppName,
        initials: oppInitials || null,
        logo_url: publicLogoUrl,
        contact_name: oppContact,
        contact_phone: oppPhone,
        home_field_id: oppField || null
      }

      if (editingOppId) {
        // Update
        const { error } = await supabase.from('opponents').update(payload).eq('id', editingOppId)
        if (error) throw error
      } else {
        // Insert
        const { error } = await supabase.from('opponents').insert([payload])
        if (error) throw error
      }

      handleCancelEditOpponent()
      fetchData()
    } catch (err: any) {
      alert('Erro ao guardar adversário: ' + err.message)
    } finally {
      setUploadingOppLogo(false)
    }
  }

  const handleDeleteOpponent = async (id: string) => {
    if (!confirm('Eliminar este adversário?')) return
    await supabase.from('opponents').delete().eq('id', id)
    if (editingOppId === id) handleCancelEditOpponent()
    fetchData()
  }

  // --- TOURNAMENTS ---
  const handleStartEditTournament = (t: Tournament) => {
    setEditingTourId(t.id)
    setTourName(t.name)
    setTourSeason(t.season || '')
    setTourStatus(t.status)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEditTournament = () => {
    setEditingTourId(null)
    setTourName('')
    setTourSeason('')
    setTourStatus('agendado')
  }

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tourName) return

    const payload = { name: tourName, season: tourSeason, status: tourStatus }

    if (editingTourId) {
      const { error } = await supabase.from('tournaments').update(payload).eq('id', editingTourId)
      if (!error) {
        handleCancelEditTournament()
        fetchData()
      }
    } else {
      const { error } = await supabase.from('tournaments').insert([payload])
      if (!error) {
        setTourName('')
        setTourSeason('')
        setTourStatus('agendado')
        fetchData()
      }
    }
  }

  const handleDeleteTournament = async (id: string) => {
    if (!confirm('Eliminar este torneio?')) return
    await supabase.from('tournaments').delete().eq('id', id)
    if (editingTourId === id) handleCancelEditTournament()
    fetchData()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-csc-dark">Backoffice</h1>
        <p className="text-gray-550 mt-1">Faça a gestão centralizada das configurações da equipa.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap bg-white rounded-xl shadow-sm border border-gray-150 p-1 gap-1">
        <button 
          onClick={() => setActiveTab('club')}
          className={`flex-1 min-w-[100px] py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${activeTab === 'club' ? 'bg-csc-dark text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Building2 size={16} /> Clube
        </button>
        <button 
          onClick={() => setActiveTab('fields')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${activeTab === 'fields' ? 'bg-csc-dark text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <MapPin size={16} /> Campos
        </button>
        <button 
          onClick={() => setActiveTab('opponents')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${activeTab === 'opponents' ? 'bg-csc-dark text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Shield size={16} /> Adversários
        </button>
        <button 
          onClick={() => setActiveTab('tournaments')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors ${activeTab === 'tournaments' ? 'bg-csc-dark text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          <Trophy size={16} /> Torneios
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-csc-dark"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Form Column */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 sticky top-6">
              
              {activeTab === 'club' && (
                <form onSubmit={handleUpdateClub} className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2 flex items-center gap-2"><Building2 size={20}/> Detalhes do Clube</h3>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Clube *</label>
                    <input type="text" required value={clubName} onChange={e => setClubName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: Cascais Sport Clube" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Siglas *</label>
                    <input type="text" required value={clubInitials} onChange={e => setClubInitials(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: CSC" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-bold text-gray-700">Campo Habitual (Casa do Cascais)</label>
                      <button
                        type="button"
                        onClick={() => setActiveTab('fields')}
                        className="text-xs text-csc-dark font-bold hover:underline"
                      >
                        + Gerir Campos
                      </button>
                    </div>
                    <select
                      value={clubHomeField}
                      onChange={e => setClubHomeField(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm"
                    >
                      <option value="">-- Nenhum campo definido --</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>
                          🏟️ {f.name} {f.address ? `(${f.address})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1">Este campo será sugerido automaticamente como campo de casa em jogos e treinos.</p>
                  </div>
                  <button type="submit" className="w-full flex items-center justify-center gap-2 bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow">
                    <Save size={18} /> Guardar Ficha do Clube
                  </button>
                </form>
              )}

              {activeTab === 'fields' && (
                <form onSubmit={handleSaveField} className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-lg font-bold text-gray-805 flex items-center gap-2">
                      <MapPin size={20}/> {editingFieldId ? 'Editar Campo' : 'Criar Campo'}
                    </h3>
                    {editingFieldId && (
                      <button
                        type="button"
                        onClick={handleCancelEditField}
                        className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 font-bold"
                      >
                        <X size={14} /> Cancelar
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Campo *</label>
                    <input type="text" required value={fieldName} onChange={e => setFieldName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: Estádio Pina Manique" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Morada / Localização</label>
                    <input type="text" value={fieldAddress} onChange={e => setFieldAddress(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: R. Dom Francisco Manuel de Melo, Lisboa" />
                    <p className="text-[11px] text-gray-500 mt-1">Usada para abrir diretamente no Google Maps.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow text-sm">
                      {editingFieldId ? 'Atualizar Campo' : 'Adicionar Campo'}
                    </button>
                    {editingFieldId && (
                      <button type="button" onClick={handleCancelEditField} className="px-4 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-100 text-sm">
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              )}

              {activeTab === 'opponents' && (
                <form onSubmit={handleSaveOpponent} className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-lg font-bold text-gray-805 flex items-center gap-2">
                      <Shield size={20}/> {editingOppId ? 'Editar Adversário' : 'Criar Adversário'}
                    </h3>
                    {editingOppId && (
                      <button
                        type="button"
                        onClick={handleCancelEditOpponent}
                        className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 font-bold"
                      >
                        <X size={14} /> Cancelar
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome da Equipa *</label>
                    <input type="text" required value={oppName} onChange={e => setOppName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: Pescadores CC" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Siglas</label>
                    <input type="text" value={oppInitials} onChange={e => setOppInitials(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: PCC" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Símbolo (Logótipo)</label>
                    {existingLogoUrl && !oppLogo && (
                      <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 border rounded-lg">
                        <img src={existingLogoUrl} alt="Logo Atual" className="w-8 h-8 object-contain" />
                        <span className="text-xs text-gray-600 truncate flex-1">Símbolo atual guardado</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={e => setOppLogo(e.target.files ? e.target.files[0] : null)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Campo Habitual</label>
                    <select value={oppField} onChange={e => setOppField(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm">
                      <option value="">Nenhum</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>{f.name} {f.address ? `(${f.address})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Pessoa de Contacto</label>
                    <input type="text" value={oppContact} onChange={e => setOppContact(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: Sr. João" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Telefone</label>
                    <input type="text" value={oppPhone} onChange={e => setOppPhone(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: 910 000 000" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={uploadingOppLogo} className="flex-1 bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow text-sm disabled:opacity-50">
                      {uploadingOppLogo ? 'A enviar...' : editingOppId ? 'Atualizar Adversário' : 'Adicionar Adversário'}
                    </button>
                    {editingOppId && (
                      <button type="button" onClick={handleCancelEditOpponent} className="px-4 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-100 text-sm">
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              )}

              {activeTab === 'tournaments' && (
                <form onSubmit={handleSaveTournament} className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-lg font-bold text-gray-805 flex items-center gap-2">
                      <Trophy size={20}/> {editingTourId ? 'Editar Torneio' : 'Criar Torneio'}
                    </h3>
                    {editingTourId && (
                      <button
                        type="button"
                        onClick={handleCancelEditTournament}
                        className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 font-bold"
                      >
                        <X size={14} /> Cancelar
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome da Competição *</label>
                    <input type="text" required value={tourName} onChange={e => setTourName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: Liga de Veteranos" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Época</label>
                    <input type="text" value={tourSeason} onChange={e => setTourSeason(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm" placeholder="Ex: 2025/2026" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Estado</label>
                    <select value={tourStatus} onChange={e => setTourStatus(e.target.value as any)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white text-sm">
                      <option value="agendado">Agendado</option>
                      <option value="ativo">Ativo</option>
                      <option value="terminado">Terminado</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow text-sm">
                      {editingTourId ? 'Atualizar Torneio' : 'Adicionar Torneio'}
                    </button>
                    {editingTourId && (
                      <button type="button" onClick={handleCancelEditTournament} className="px-4 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-100 text-sm">
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              )}

            </div>
          </div>

          {/* List Column */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
              
              {activeTab === 'club' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2">Símbolo do Clube</h3>
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="w-40 h-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center overflow-hidden shadow-inner">
                      {clubSettings?.logo_url ? (
                        <img src={clubSettings.logo_url} alt="Símbolo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <Shield size={48} className="text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 space-y-4 text-center md:text-left">
                      <div>
                        <p className="font-bold text-gray-805">Atualizar Símbolo</p>
                        <p className="text-sm text-gray-500">Faça o upload do logótipo ou emblema do clube (Recomendado: PNG com fundo transparente).</p>
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadLogo}
                          disabled={uploadingLogo}
                          className="hidden"
                          id="logo-upload"
                        />
                        <label 
                          htmlFor="logo-upload"
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold cursor-pointer transition-colors shadow-sm
                            ${uploadingLogo ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}
                          `}
                        >
                          {uploadingLogo ? (
                            <><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-400"></div> A enviar...</>
                          ) : (
                            <><Upload size={18} /> Selecionar Imagem</>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'fields' && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2 flex items-center justify-between">
                    <span>Campos Registados ({fields.length})</span>
                  </h3>
                  {fields.length === 0 ? (
                    <p className="text-gray-500 text-sm">Nenhum campo encontrado.</p>
                  ) : (
                    fields.map(f => {
                      const mapsQuery = f.address ? `${f.name}, ${f.address}` : f.name
                      const mapsUrl = getGoogleMapsUrl(mapsQuery)

                      return (
                        <div key={f.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50 rounded-xl border transition-all gap-2 ${editingFieldId === f.id ? 'border-csc-dark bg-csc-dark/5 ring-1 ring-csc-dark' : 'border-gray-200'}`}>
                          <div className="space-y-1">
                            <p className="font-bold text-sm text-csc-dark flex items-center gap-1.5">
                              <span>{f.name}</span>
                            </p>
                            {f.address ? (
                              <p className="text-xs text-gray-600 flex items-center gap-1">
                                <span className="font-medium">{f.address}</span>
                              </p>
                            ) : (
                              <p className="text-[11px] text-gray-400 italic">Sem morada definida</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-center">
                            {/* Botão Google Maps */}
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 bg-white border border-gray-300 hover:border-red-500 hover:text-red-600 text-gray-700 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                              title="Abrir no Google Maps"
                            >
                              <MapPin size={14} className="text-red-500 shrink-0" />
                              <span>Maps</span>
                              <ExternalLink size={11} className="opacity-60" />
                            </a>

                            {/* Botão Editar */}
                            <button
                              onClick={() => handleStartEditField(f)}
                              className="p-1.5 bg-white border border-gray-300 hover:border-csc-dark text-gray-700 hover:text-csc-dark rounded-lg transition-colors shadow-xs"
                              title="Editar Campo"
                            >
                              <Edit2 size={15} />
                            </button>

                            {/* Botão Eliminar */}
                            <button
                              onClick={() => handleDeleteField(f.id)}
                              className="p-1.5 bg-white border border-gray-300 hover:border-red-500 text-red-500 hover:bg-red-50 rounded-lg transition-colors shadow-xs"
                              title="Eliminar Campo"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {activeTab === 'opponents' && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2 flex items-center justify-between">
                    <span>Adversários Registados ({opponents.length})</span>
                  </h3>
                  {opponents.length === 0 ? (
                    <p className="text-gray-500 text-sm">Nenhum adversário encontrado.</p>
                  ) : (
                    opponents.map(o => {
                      const homeField = fields.find(f => f.id === o.home_field_id)
                      const mapsQuery = homeField ? (homeField.address ? `${homeField.name}, ${homeField.address}` : homeField.name) : o.name
                      const mapsUrl = getGoogleMapsUrl(mapsQuery)

                      return (
                        <div key={o.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-gray-50 rounded-xl border transition-all gap-3 ${editingOppId === o.id ? 'border-csc-dark bg-csc-dark/5 ring-1 ring-csc-dark' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-3">
                            {o.logo_url ? (
                              <img src={o.logo_url} alt={o.initials || o.name} className="w-12 h-12 object-contain bg-white rounded-lg border p-1 shadow-xs shrink-0" />
                            ) : (
                              <div className="w-12 h-12 bg-gray-200 border border-gray-300 rounded-lg flex items-center justify-center font-bold text-gray-600 text-xs shrink-0">
                                {o.initials || o.name.substring(0, 3).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-sm text-csc-dark">
                                {o.name} {o.initials && <span className="text-gray-500 font-normal ml-1">({o.initials})</span>}
                              </p>
                              
                              {homeField && (
                                <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                                  <span className="font-semibold">Campo:</span> {homeField.name}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                                {o.contact_name && <span>👤 {o.contact_name}</span>}
                                {o.contact_phone && <span>📞 {o.contact_phone}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-center">
                            {/* Botão Google Maps se tiver campo habitual */}
                            {homeField && (
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 bg-white border border-gray-300 hover:border-red-500 hover:text-red-600 text-gray-700 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                                title={`Abrir campo ${homeField.name} no Google Maps`}
                              >
                                <MapPin size={14} className="text-red-500 shrink-0" />
                                <span className="hidden sm:inline">Campo</span>
                                <ExternalLink size={11} className="opacity-60" />
                              </a>
                            )}

                            {/* Botão Editar */}
                            <button
                              onClick={() => handleStartEditOpponent(o)}
                              className="p-1.5 bg-white border border-gray-300 hover:border-csc-dark text-gray-700 hover:text-csc-dark rounded-lg transition-colors shadow-xs"
                              title="Editar Adversário"
                            >
                              <Edit2 size={15} />
                            </button>

                            {/* Botão Eliminar */}
                            <button
                              onClick={() => handleDeleteOpponent(o.id)}
                              className="p-1.5 bg-white border border-gray-300 hover:border-red-500 text-red-500 hover:bg-red-50 rounded-lg transition-colors shadow-xs"
                              title="Eliminar Adversário"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {activeTab === 'tournaments' && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2 flex items-center justify-between">
                    <span>Torneios Registados ({tournaments.length})</span>
                  </h3>
                  {tournaments.length === 0 ? (
                    <p className="text-gray-500 text-sm">Nenhum torneio encontrado.</p>
                  ) : (
                    tournaments.map(t => (
                      <div key={t.id} className={`flex justify-between items-center p-3.5 bg-gray-50 rounded-xl border transition-all ${editingTourId === t.id ? 'border-csc-dark bg-csc-dark/5 ring-1 ring-csc-dark' : 'border-gray-200'}`}>
                        <div>
                          <p className="font-bold text-sm text-csc-dark">{t.name} <span className="text-xs font-normal text-gray-500 ml-1">({t.season})</span></p>
                          <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase 
                            ${t.status === 'ativo' ? 'bg-csc-light/20 text-csc-dark' : t.status === 'terminado' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-700'}`}>
                            {t.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStartEditTournament(t)}
                            className="p-1.5 bg-white border border-gray-300 hover:border-csc-dark text-gray-700 hover:text-csc-dark rounded-lg transition-colors shadow-xs"
                            title="Editar Torneio"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteTournament(t.id)}
                            className="p-1.5 bg-white border border-gray-300 hover:border-red-500 text-red-500 hover:bg-red-50 rounded-lg transition-colors shadow-xs"
                            title="Eliminar Torneio"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
