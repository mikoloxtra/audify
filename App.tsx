import React, { useState, useEffect } from 'react';
import { User, Document, ViewState, AppSettings, VoiceGender } from './types';
import { getSettings, saveSettings } from './services/storageService';
import { listenToAuthChanges, logout as firebaseLogout } from './services/authService';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Scanner } from './components/Scanner';
import { Player } from './components/Player';
import { FeedbackModal } from './components/FeedbackModal';
import { HelpCircle } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('AUTH');
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>({ voiceGender: VoiceGender.FEMALE, playbackSpeed: 1.0 });
  const [showFeedback, setShowFeedback] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToAuthChanges(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setView('DASHBOARD');
        try {
          const userSettings = await getSettings(firebaseUser.id);
          setSettingsState(userSettings);
        } catch (error) {
          console.error('Failed to load settings:', error);
        }
      } else {
        setUser(null);
        setView('AUTH');
        setSettingsState({ voiceGender: VoiceGender.FEMALE, playbackSpeed: 1.0 });
      }
      setInitializing(false);
    });

    return unsubscribe;
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setView('DASHBOARD');
  };

  const handleLogout = async () => {
    await firebaseLogout();
    setUser(null);
    setView('AUTH');
  };

  const handleScanComplete = () => {
    setView('DASHBOARD');
  };

  const handleOpenDoc = (doc: Document) => {
    setActiveDoc(doc);
    setView('PLAYER');
  };

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettingsState(newSettings);
    if (user) {
      try {
        await saveSettings(user.id, newSettings);
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <span>Loading Audify...</span>
      </div>
    );
  }

  if (!user || view === 'AUTH') {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Global Feedback Trigger */}
      {view === 'DASHBOARD' && (
          <button 
            onClick={() => setShowFeedback(true)}
            className="fixed bottom-6 left-6 p-3 bg-white text-slate-400 hover:text-indigo-600 rounded-full shadow-lg border border-slate-100 z-40 transition-colors"
            title="Feedback"
          >
              <HelpCircle className="w-6 h-6" />
          </button>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}

      {view === 'DASHBOARD' && (
        <Dashboard 
          user={user} 
          onScanNew={() => setView('SCANNER')} 
          onOpenDoc={handleOpenDoc}
          onLogout={handleLogout}
        />
      )}

      {view === 'SCANNER' && (
        <Scanner 
          user={user}
          voiceGender={settings.voiceGender}
          onComplete={handleScanComplete} 
          onCancel={() => setView('DASHBOARD')}
        />
      )}

      {view === 'PLAYER' && activeDoc && (
        <Player 
          document={activeDoc}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onBack={() => setView('DASHBOARD')}
        />
      )}
    </div>
  );
};

export default App;