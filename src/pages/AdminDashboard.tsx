import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Shield, MapPin, Trophy, Trash2, Building2, Upload, Save } from 'lucide-react'
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
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Data states
  const [fields, setFields] = useState<Field[]>([])
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  // Form states
  const [fieldName, setFieldName] = useState('')
  const [fieldAddress, setFieldAddress] = useState('')

  const [oppName, setOppName] = useState('')
  const [oppContact, setOppContact] = useState('')
  const [oppPhone, setOppPhone] = useState('')
  const [oppField, setOppField] = useState('')

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
    }
  }, [clubSettings])

  // --- CLUB ---
  const handleUpdateClub = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clubName || !clubInitials) return
    const { error } = await supabase.from('club_settings').update({ name: clubName, initials: clubInitials }).eq('id', 1)
    if (!error) {
      alert('Definições do clube atualizadas!')
      refreshSettings()
    } else {
      alert('Erro ao atualizar: ' + error.message)
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
      alert('Erro ao fazer upload do símbolo (verifica se o bucket "club_assets" existe e é público): ' + error.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  // --- FIELDS ---
  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fieldName) return
    const { error } = await supabase.from('fields').insert([{ name: fieldName, address: fieldAddress }])
    if (!error) {
      setFieldName(''); setFieldAddress(''); fetchData()
    }
  }

  const handleDeleteField = async (id: string) => {
    if (!confirm('Eliminar este campo?')) return
    await supabase.from('fields').delete().eq('id', id)
    fetchData()
  }

  // --- OPPONENTS ---
  const handleCreateOpponent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oppName) return
    const payload = {
      name: oppName,
      contact_name: oppContact,
      contact_phone: oppPhone,
      home_field_id: oppField || null
    }
    const { error } = await supabase.from('opponents').insert([payload])
    if (!error) {
      setOppName(''); setOppContact(''); setOppPhone(''); setOppField(''); fetchData()
    }
  }

  const handleDeleteOpponent = async (id: string) => {
    if (!confirm('Eliminar este adversário?')) return
    await supabase.from('opponents').delete().eq('id', id)
    fetchData()
  }

  // --- TOURNAMENTS ---
  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tourName) return
    const payload = { name: tourName, season: tourSeason, status: tourStatus }
    const { error } = await supabase.from('tournaments').insert([payload])
    if (!error) {
      setTourName(''); setTourSeason(''); setTourStatus('agendado'); fetchData()
    }
  }

  const handleDeleteTournament = async (id: string) => {
    if (!confirm('Eliminar este torneio?')) return
    await supabase.from('tournaments').delete().eq('id', id)
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
                  <button type="submit" className="w-full flex items-center justify-center gap-2 bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow">
                    <Save size={18} /> Guardar
                  </button>
                </form>
              )}

              {activeTab === 'fields' && (
                <form onSubmit={handleCreateField} className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2 flex items-center gap-2"><MapPin size={20}/> Criar Campo</h3>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Campo *</label>
                    <input type="text" required value={fieldName} onChange={e => setFieldName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: Estádio Pina Manique" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Morada</label>
                    <input type="text" value={fieldAddress} onChange={e => setFieldAddress(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: Lisboa" />
                  </div>
                  <button type="submit" className="w-full bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow">Adicionar Campo</button>
                </form>
              )}

              {activeTab === 'opponents' && (
                <form onSubmit={handleCreateOpponent} className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2 flex items-center gap-2"><Shield size={20}/> Criar Adversário</h3>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome da Equipa *</label>
                    <input type="text" required value={oppName} onChange={e => setOppName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: Pescadores CC" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Campo Habitual</label>
                    <select value={oppField} onChange={e => setOppField(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white">
                      <option value="">Nenhum</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Pessoa de Contacto</label>
                    <input type="text" value={oppContact} onChange={e => setOppContact(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: Sr. João" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Telefone</label>
                    <input type="text" value={oppPhone} onChange={e => setOppPhone(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: 910 000 000" />
                  </div>
                  <button type="submit" className="w-full bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow">Adicionar Adversário</button>
                </form>
              )}

              {activeTab === 'tournaments' && (
                <form onSubmit={handleCreateTournament} className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2 flex items-center gap-2"><Trophy size={20}/> Criar Torneio</h3>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nome da Competição *</label>
                    <input type="text" required value={tourName} onChange={e => setTourName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: Liga de Veteranos" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Época</label>
                    <input type="text" value={tourSeason} onChange={e => setTourSeason(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none" placeholder="Ex: 2025/2026" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Estado</label>
                    <select value={tourStatus} onChange={e => setTourStatus(e.target.value as any)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-csc-dark outline-none bg-white">
                      <option value="agendado">Agendado</option>
                      <option value="ativo">Ativo</option>
                      <option value="terminado">Terminado</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 shadow">Adicionar Torneio</button>
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
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2">Campos Registados ({fields.length})</h3>
                  {fields.length === 0 ? <p className="text-gray-500 text-sm">Nenhum campo encontrado.</p> : fields.map(f => (
                    <div key={f.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div>
                        <p className="font-bold text-sm text-csc-dark">{f.name}</p>
                        {f.address && <p className="text-xs text-gray-500">{f.address}</p>}
                      </div>
                      <button onClick={() => handleDeleteField(f.id)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'opponents' && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2">Adversários Registados ({opponents.length})</h3>
                  {opponents.length === 0 ? <p className="text-gray-500 text-sm">Nenhum adversário encontrado.</p> : opponents.map(o => (
                    <div key={o.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div>
                        <p className="font-bold text-sm text-csc-dark">{o.name}</p>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500">
                          {o.contact_name && <span>👤 {o.contact_name}</span>}
                          {o.contact_phone && <span>📞 {o.contact_phone}</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteOpponent(o.id)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'tournaments' && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-gray-805 mb-4 border-b pb-2">Torneios Registados ({tournaments.length})</h3>
                  {tournaments.length === 0 ? <p className="text-gray-500 text-sm">Nenhum torneio encontrado.</p> : tournaments.map(t => (
                    <div key={t.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div>
                        <p className="font-bold text-sm text-csc-dark">{t.name} <span className="text-xs font-normal text-gray-500 ml-1">({t.season})</span></p>
                        <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase 
                          ${t.status === 'ativo' ? 'bg-csc-light/20 text-csc-dark' : t.status === 'terminado' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-700'}`}>
                          {t.status}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteTournament(t.id)} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={16} /></button>
                    </div>
                  ))}
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
