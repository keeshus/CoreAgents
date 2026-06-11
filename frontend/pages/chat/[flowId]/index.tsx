import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, MessageCircle, Trash2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function ChatSessionList() {
  const router = useRouter();
  const { flowId } = router.query;
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!flowId) return;
    fetch(`${API_URL}/chat/${flowId}/sessions`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [flowId]);

  const startNewChat = async () => {
    if (!flowId) return;
    const res = await fetch(`${API_URL}/chat/${flowId}/sessions`, { method: 'POST' });
    const session = await res.json();
    router.push(`/chat/${flowId}/${session.id}`);
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Delete this chat?')) return;
    await fetch(`${API_URL}/chat/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions(sessions.filter(s => s.id !== sessionId));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/flows" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Chat Sessions</h1>
            <p className="text-sm text-gray-500">Conversations with this agent</p>
          </div>
          <button
            onClick={startNewChat}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-3">No conversations yet</p>
            <button onClick={startNewChat} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              Start a new chat
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="bg-white rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                <Link href={`/chat/${flowId}/${s.id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 hover:text-blue-600 truncate">
                    {s.title || 'Untitled Chat'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(s.updated_at).toLocaleString()}
                  </p>
                </Link>
                <button
                  onClick={() => deleteSession(s.id)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
