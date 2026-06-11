import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, BookOpen, Upload, ChevronRight, AlertCircle, Cpu, Server
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Collection {
  collection_name: string;
  document_count: number;
}

interface Document {
  id: string;
  name: string;
  collection_name: string;
  content: string;
  created_at: string;
}

export default function KnowledgePage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadCollection, setUploadCollection] = useState('default');
  const [uploading, setUploading] = useState(false);
  const [embeddingEndpointId, setEmbeddingEndpointId] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-ada-002');
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [qdrantUrl, setQdrantUrl] = useState('');
  const [qdrantApiKey, setQdrantApiKey] = useState('');
  const [qdrantStatus, setQdrantStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/llm-endpoints`)
      .then(r => r.json())
      .then(setEndpoints)
      .catch(() => {});
    fetch(`${API_URL}/vector-stores`)
      .then(r => r.json())
      .then((stores: any[]) => {
        const qdrant = stores.find((s: any) => s.type === 'qdrant');
        if (qdrant) setQdrantStatus('connected');
      })
      .catch(() => {});
  }, []);

  const connectQdrant = async () => {
    if (!qdrantUrl) return;
    setQdrantStatus('connecting');
    try {
      const res = await fetch(`${API_URL}/vector-stores/qdrant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: qdrantUrl, apiKey: qdrantApiKey || undefined }),
      });
      if (res.ok) setQdrantStatus('connected');
      else setQdrantStatus('error');
    } catch { setQdrantStatus('error'); }
  };

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/knowledge/collections`);
      setCollections(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCollections(); }, []);

  const fetchDocuments = async (name: string) => {
    setSelectedCollection(name);
    try {
      const res = await fetch(`${API_URL}/knowledge/collections/${encodeURIComponent(name)}`);
      setDocuments(await res.json());
    } catch {}
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadName || !uploadContent) return;
    setUploading(true);
    try {
      await fetch(`${API_URL}/knowledge/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadName,
          content: uploadContent,
          collectionName: uploadCollection,
          embeddingEndpointId,
          embeddingModel,
        }),
      });
      setUploadName('');
      setUploadContent('');
      setShowUpload(false);
      fetchCollections();
      if (selectedCollection) fetchDocuments(selectedCollection);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    await fetch(`${API_URL}/knowledge/documents/${id}`, { method: 'DELETE' });
    fetchCollections();
    if (selectedCollection) fetchDocuments(selectedCollection);
  };

  const handleDeleteCollection = async (name: string) => {
    if (!confirm(`Delete entire collection "${name}" and all its documents?`)) return;
    await fetch(`${API_URL}/knowledge/collections/${encodeURIComponent(name)}`, { method: 'DELETE' });
    setSelectedCollection(null);
    setDocuments([]);
    fetchCollections();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Knowledge Bases</h1>
            <p className="text-sm text-gray-500 mt-1">Manage document collections for RAG retrieval</p>
          </div>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Document
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Upload form */}
        {showUpload && (
          <form onSubmit={handleUpload} className="mb-6 bg-white rounded-lg border p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Upload Document</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Document Name</span>
                <input required className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm" value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="product-docs.txt" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Collection</span>
                <input required className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm" value={uploadCollection} onChange={e => setUploadCollection(e.target.value)} placeholder="default" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Content</span>
              <textarea required className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y min-h-[120px]" value={uploadContent} onChange={e => setUploadContent(e.target.value)} placeholder="Paste document text here..." rows={6} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={uploading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{uploading ? 'Uploading...' : 'Upload'}</button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <div className="mb-6 bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-500" /> Embedding Provider
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Endpoint</span>
                <select
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm bg-white"
                  value={embeddingEndpointId}
                  onChange={e => setEmbeddingEndpointId(e.target.value)}
                >
                  <option value="">Select endpoint...</option>
                  {endpoints.map(ep => (
                    <option key={ep.id} value={ep.id}>{ep.name} ({ep.provider_type})</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Embedding Model</span>
                <input
                  className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                  value={embeddingModel}
                  onChange={e => setEmbeddingModel(e.target.value)}
                  placeholder="text-embedding-ada-002"
                />
              </label>
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              Select an OpenAI-compatible endpoint for generating embeddings.
            </p>
          </div>
        )}

        {/* Qdrant config */}
        <div className="mb-6 bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-purple-500" /> External Vector Store (Qdrant)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-xs font-medium text-gray-700">Qdrant URL</span>
              <input
                className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                value={qdrantUrl}
                onChange={e => setQdrantUrl(e.target.value)}
                placeholder="http://localhost:6333"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">API Key <span className="text-gray-400">(optional)</span></span>
              <input
                type="password"
                className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm"
                value={qdrantApiKey}
                onChange={e => setQdrantApiKey(e.target.value)}
                placeholder="qdrant-api-key"
              />
            </label>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={connectQdrant}
              disabled={!qdrantUrl || qdrantStatus === 'connecting'}
              className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {qdrantStatus === 'connecting' ? 'Connecting...' : 'Connect Qdrant'}
            </button>
            {qdrantStatus === 'connected' && <span className="text-xs text-green-600 font-medium">✓ Connected</span>}
            {qdrantStatus === 'error' && <span className="text-xs text-red-600">Connection failed</span>}
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            Connect an external Qdrant vector database for faster, scalable vector search. Falls back to built-in pgvector if not configured.
          </p>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : collections.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 mb-1">No knowledge bases yet</p>
            <p className="text-xs text-gray-400">Upload documents to create collections for RAG</p>
          </div>
        ) : (
          <div className="space-y-3">
            {collections.map(c => (
              <div key={c.collection_name} className="bg-white rounded-lg border">
                <button
                  onClick={() => selectedCollection === c.collection_name ? setSelectedCollection(null) : fetchDocuments(c.collection_name)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-medium text-gray-900">{c.collection_name}</p>
                      <p className="text-xs text-gray-500">{c.document_count} document{c.document_count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCollection(c.collection_name); }} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${selectedCollection === c.collection_name ? 'rotate-90' : ''}`} />
                  </div>
                </button>
                {selectedCollection === c.collection_name && (
                  <div className="border-t">
                    {documents.length === 0 ? (
                      <p className="p-4 text-sm text-gray-400">No documents in this collection</p>
                    ) : (
                      documents.map(d => (
                        <div key={d.id} className="px-4 py-3 border-b last:border-b-0 flex items-center justify-between hover:bg-gray-50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                            <p className="text-[10px] text-gray-400">{new Date(d.created_at).toLocaleString()} · {(d.content || '').length} chars</p>
                          </div>
                          <button onClick={() => handleDeleteDoc(d.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
