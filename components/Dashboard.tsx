import React from 'react';
import { User, Document } from '../types';
import { getUserDocuments, deleteDocument } from '../services/storageService';
import { Button } from './Button';
import { Plus, PlayCircle, Trash2, Clock, Book } from 'lucide-react';

interface DashboardProps {
  user: User;
  onScanNew: () => void;
  onOpenDoc: (doc: Document) => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onScanNew, onOpenDoc, onLogout }) => {
  const [docs, setDocs] = React.useState<Document[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadDocs = React.useCallback(async () => {
    try {
      setLoading(true);
      const documents = await getUserDocuments(user.id);
      setDocs(documents);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  React.useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this audiobook?')) {
      try {
        await deleteDocument(id);
        await loadDocs();
      } catch (error) {
        console.error('Failed to delete document:', error);
      }
    }
  };

  const userInitial = (user.displayName || user.email || '?')[0]?.toUpperCase() ?? '?';

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-900">My Library</h1>
          <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                  {userInitial}
              </div>
              <button onClick={onLogout} className="text-sm text-slate-500 hover:text-red-600 font-medium">
                  Logout
              </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-slate-500">Loading your audiobooks...</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-20">
             <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Book className="w-10 h-10 text-slate-300" />
             </div>
             <h2 className="text-xl font-semibold text-slate-900 mb-2">No Audiobooks Yet</h2>
             <p className="text-slate-500 mb-8 max-w-xs mx-auto">Scan a document to convert it into your first AI-narrated audiobook.</p>
             <Button onClick={onScanNew} size="lg" className="shadow-xl shadow-indigo-200">
                <Plus className="w-5 h-5 mr-2" /> Create New Audiobook
             </Button>
          </div>
        ) : (
          <div className="grid gap-4">
             {docs.map((doc) => (
               <div 
                 key={doc.id} 
                 onClick={() => onOpenDoc(doc)}
                 className="group bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer flex items-center justify-between"
               >
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <PlayCircle className="w-6 h-6" />
                    </div>
                    <div>
                       <h3 className="font-semibold text-slate-900 mb-1">{doc.title}</h3>
                       <div className="flex items-center gap-3 text-xs text-slate-400">
                           <span className="flex items-center"><Clock className="w-3 h-3 mr-1"/> {new Date(doc.createdAt).toLocaleDateString()}</span>
                           <span>•</span>
                           <span>{doc.content.totalParagraphs} paragraphs</span>
                           <span>•</span>
                           <span>{Math.round((doc.playback.currentTime / doc.audio.duration) * 100)}% complete</span>
                       </div>
                   </div>
                 </div>
                 
                 <button 
                    onClick={(e) => handleDelete(e, doc.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                 >
                     <Trash2 className="w-5 h-5" />
                 </button>
               </div>
             ))}
          </div>
        )}
      </main>

      <button 
        onClick={onScanNew}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-300 flex items-center justify-center hover:bg-indigo-700 hover:scale-105 transition-all"
      >
          <Plus className="w-8 h-8" />
      </button>
    </div>
  );
};