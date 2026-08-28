import React, { useEffect, useState } from 'react'
import { Mail, Phone, Shield, Edit2, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import type { Profile, UserRole } from '../context/AuthContext'

const TeamManagementPage: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('player')
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active')

  const fetchProfiles = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      if (data && data.length > 0) {
        setProfiles(data as Profile[])
      } else {
        setProfiles([
          { id: '1', name: 'Rui Costa', email: 'rui@veteranos.pt', phone: '912345678', photo_url: null, role: 'player', status: 'active' },
          { id: '2', name: 'Mário Silva (Treinador)', email: 'mario@veteranos.pt', phone: '923456789', photo_url: null, role: 'coach', status: 'active' },
          { id: '3', name: 'António Ferreira (Presidente)', email: 'antonio@veteranos.pt', phone: '934567890', photo_url: null, role: 'admin', status: 'active' },
          { id: '4', name: 'Vítor Paneira', email: 'vitor@veteranos.pt', phone: '965432100', photo_url: null, role: 'player', status: 'inactive' }
        ])
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

  const startEdit = (profile: Profile) => {
    setEditingId(profile.id)
    setEditRole(profile.role)
    setEditStatus(profile.status)
  }

  const saveEdit = async (id: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: editRole, status: editStatus })
        .eq('id', id)

      if (error) throw error

      setProfiles(prev =>
        prev.map(p => (p.id === id ? { ...p, role: editRole, status: editStatus } : p))
      )
      setEditingId(null)
    } catch (err) {
      // Offline fallback
      setProfiles(prev =>
        prev.map(p => (p.id === id ? { ...p, role: editRole, status: editStatus } : p))
      )
      setEditingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-csc-dark">Gestão de Equipa</h1>
        <p className="text-gray-550 mt-1">Gira as fichas dos jogadores, perfis de acesso e contactos rápidos.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {profiles.map((person) => {
            const isEditing = editingId === person.id
            return (
              <div key={person.id} className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-csc-light/20 rounded-full flex items-center justify-center font-bold text-csc-dark text-lg">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">{person.name}</h4>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${person.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {person.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>

                    {!isEditing && (
                      <button
                        onClick={() => startEdit(person)}
                        className="text-csc-dark hover:bg-gray-50 p-1.5 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="mt-6 space-y-2.5 text-sm text-gray-650">
                    <div className="flex items-center space-x-2">
                      <Mail size={16} className="text-gray-400" />
                      <a href={`mailto:${person.email}`} className="hover:underline">{person.email}</a>
                    </div>
                    {person.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone size={16} className="text-gray-400" />
                        <a href={`tel:${person.phone}`} className="hover:underline">{person.phone}</a>
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <Shield size={16} className="text-gray-400" />
                      <span className="capitalize font-semibold text-csc-dark">
                        {person.role === 'admin' ? 'Administrador' : person.role === 'coach' ? 'Treinador' : 'Jogador'}
                      </span>
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-6 pt-4 border-t border-gray-100 space-y-4 bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Cargo / Role</label>
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as UserRole)}
                          className="w-full text-xs p-2 border border-gray-300 rounded bg-white"
                        >
                          <option value="player">Jogador</option>
                          <option value="coach">Treinador</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Estado</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as any)}
                          className="w-full text-xs p-2 border border-gray-300 rounded bg-white"
                        >
                          <option value="active">Ativo</option>
                          <option value="inactive">Inativo</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center space-x-1 bg-gray-250 text-gray-700 px-3 py-1.5 rounded text-xs font-semibold"
                      >
                        <X size={14} />
                        <span>Cancelar</span>
                      </button>
                      <button
                        onClick={() => saveEdit(person.id)}
                        className="flex items-center space-x-1 bg-green-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-green-700"
                      >
                        <Check size={14} />
                        <span>Guardar</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TeamManagementPage
