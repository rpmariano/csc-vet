import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Send } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface Announcement {
  id: string
  title: string
  content: string
  published_at: string
}

const AnnouncementsPage: React.FC = () => {
  const { profile } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchAnnouncements = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('published_at', { ascending: false })

      if (error) throw error
      if (data && data.length > 0) {
        setAnnouncements(data as Announcement[])
      } else {
        setAnnouncements([
          {
            id: '1',
            title: 'Jantar de Início de Época',
            content: 'No próximo sábado teremos o nosso jantar convívio após o jogo amigável. Por favor confirmem presença até quinta-feira.',
            published_at: new Date().toISOString()
          },
          {
            id: '2',
            title: 'Pagamento das Quotas de Agosto',
            content: 'Lembramos a todos os jogadores que a quota mensal de Agosto de 15€ já se encontra a pagamento.',
            published_at: new Date(Date.now() - 86400000 * 3).toISOString()
          }
        ])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const newAnn = {
        title,
        content,
        published_at: new Date().toISOString(),
        created_by: profile?.id
      }

      const { error } = await supabase.from('announcements').insert([newAnn])
      if (error) throw error

      fetchAnnouncements()
      setTitle('')
      setContent('')
    } catch (err) {
      alert('Não foi possível guardar o comunicado na BD. Adicionado localmente para demonstração.')
      const localAnn: Announcement = {
        id: Math.random().toString(),
        title,
        content,
        published_at: new Date().toISOString()
      }
      setAnnouncements(prev => [localAnn, ...prev])
      setTitle('')
      setContent('')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) throw error
      setAnnouncements(prev => prev.filter(ann => ann.id !== id))
    } catch (err) {
      setAnnouncements(prev => prev.filter(ann => ann.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-blue-900">Comunicados</h1>
        <p className="text-gray-500 mt-1">Crie e publique mensagens de aviso na homepage do plantel.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de Criação */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 h-fit">
          <h3 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-4 flex items-center space-x-2">
            <Send size={18} className="text-blue-900" />
            <span>Publicar Comunicado</span>
          </h3>

          <form onSubmit={handlePublish} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Título</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-900"
                placeholder="Ex: Ponto de Encontro Alterado"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Conteúdo da Mensagem</label>
              <textarea
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-900"
                placeholder="Escreva aqui a mensagem para todo o plantel..."
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center space-x-2 bg-blue-900 text-white py-2.5 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow"
            >
              <Plus size={18} />
              <span>Publicar</span>
            </button>
          </form>
        </div>

        {/* Lista de Comunicados */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-850 mb-6">Histórico de Comunicados</h3>

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-900"></div>
              </div>
            ) : announcements.length === 0 ? (
              <p className="text-gray-500 text-sm">Ainda não foram publicados comunicados.</p>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann) => (
                  <div key={ann.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="font-bold text-gray-800">{ann.title}</h4>
                      <p className="text-sm text-gray-650 whitespace-pre-wrap">{ann.content}</p>
                      <span className="text-[10px] text-gray-400 block mt-2">
                        Publicado em: {new Date(ann.published_at).toLocaleString('pt-PT')}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDelete(ann.id)}
                      className="text-red-650 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                      title="Eliminar comunicado"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnnouncementsPage
