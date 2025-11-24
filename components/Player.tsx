import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, AppSettings, Note } from '../types';
import { updatePlaybackProgress, saveNote, deleteNote } from '../services/storageService';
import { Button } from './Button';
import { 
  Play, Pause, SkipBack, SkipForward, Settings, 
  X, MessageSquarePlus, Clock, Trash2, ChevronLeft
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { formatTime } from '../services/textUtils';

interface PlayerProps {
  document: Document;
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  onBack: () => void;
}

export const Player: React.FC<PlayerProps> = ({ 
  document: initialDoc, 
  settings, 
  onUpdateSettings, 
  onBack 
}) => {
  const [doc, setDoc] = useState(initialDoc);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(doc.playback.currentTime || 0);
  const [duration, setDuration] = useState(doc.audio.duration);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(
    doc.playback.currentParagraphIndex || 0
  );
  
  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [isLoadingAudio, setIsLoadingAudio] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get current paragraph based on time
  const getCurrentParagraph = useCallback((time: number) => {
    return doc.content.paragraphs.find(
      p => time >= p.startTime && time < p.endTime
    );
  }, [doc.content.paragraphs]);

  // Initialize audio element
  useEffect(() => {
    console.log('[Player] Initializing audio with URL:', doc.audio.downloadURL);
    
    if (!doc.audio.downloadURL) {
      setAudioError('Audio file not found. The document may not have been processed correctly.');
      setIsLoadingAudio(false);
      return;
    }

    const audio = new Audio();
    audio.src = doc.audio.downloadURL;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous'; // Enable CORS
    
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoadingAudio(false);
      console.log('[Player] Audio loaded, duration:', audio.duration);
    });

    audio.addEventListener('error', (e) => {
      console.error('[Player] Audio error:', e);
      console.error('[Player] Audio URL:', audio.src);
      console.error('[Player] Audio error code:', audio.error?.code);
      console.error('[Player] Audio error message:', audio.error?.message);
      
      let errorMsg = 'Failed to load audio. ';
      if (audio.error?.code === 4) {
        errorMsg += 'Audio format not supported or file is corrupted.';
      } else if (audio.error?.code === 2) {
        errorMsg += 'Network error. Check your internet connection.';
      } else if (audio.error?.code === 3) {
        errorMsg += 'Audio decoding failed.';
      } else {
        errorMsg += 'Please check Firebase Storage CORS settings.';
      }
      
      setAudioError(errorMsg);
      setIsLoadingAudio(false);
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      
      // Update active paragraph
      const activePara = getCurrentParagraph(audio.currentTime);
      if (activePara && activePara.index !== currentParagraphIndex) {
        setCurrentParagraphIndex(activePara.index);
      }
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(duration);
    });

    audio.playbackRate = settings.playbackSpeed;
    audioRef.current = audio;

    // Set initial time
    if (doc.playback.currentTime > 0) {
      audio.currentTime = doc.playback.currentTime;
    }

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [doc.audio.downloadURL, doc.playback.currentTime]);

  // Update playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = settings.playbackSpeed;
    }
  }, [settings.playbackSpeed]);

  // Auto-scroll to active paragraph
  useEffect(() => {
    const paragraphElement = paragraphRefs.current[currentParagraphIndex];
    if (paragraphElement) {
      paragraphElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentParagraphIndex]);

  // Save progress periodically
  useEffect(() => {
    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
    }

    progressSaveTimerRef.current = setTimeout(() => {
      if (currentTime > 0) {
        updatePlaybackProgress(doc.id, currentTime, currentParagraphIndex).catch(err => {
          console.error('[Player] Failed to save progress:', err);
        });
      }
    }, 2000); // Save every 2 seconds

    return () => {
      if (progressSaveTimerRef.current) {
        clearTimeout(progressSaveTimerRef.current);
      }
    };
  }, [currentTime, currentParagraphIndex, doc.id]);

  // Playback controls
  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => {
        console.error('[Player] Play error:', err);
        setAudioError('Failed to play audio. Please try again.');
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.min(1, Math.max(0, x / rect.width));
    const newTime = percent * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const seekToParagraph = (paragraphIndex: number) => {
    if (!audioRef.current) return;

    const paragraph = doc.content.paragraphs[paragraphIndex];
    if (paragraph) {
      audioRef.current.currentTime = paragraph.startTime;
      setCurrentTime(paragraph.startTime);
      setCurrentParagraphIndex(paragraphIndex);
    }
  };

  const handleSkipBack = () => {
    if (currentParagraphIndex > 0) {
      seekToParagraph(currentParagraphIndex - 1);
    } else {
      // Go to start
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
    }
  };

  const handleSkipForward = () => {
    if (currentParagraphIndex < doc.content.paragraphs.length - 1) {
      seekToParagraph(currentParagraphIndex + 1);
    }
  };

  // Notes
  const handleAddNote = async () => {
    if (!noteContent.trim()) {
      setShowNoteModal(false);
      return;
    }

    const newNote: Note = {
      id: uuidv4(),
      timestamp: currentTime,
      paragraphIndex: currentParagraphIndex,
      content: noteContent.trim(),
      createdAt: new Date().toISOString(),
    };

    try {
      await saveNote(doc.id, newNote);
      setDoc({
        ...doc,
        notes: [...doc.notes, newNote],
      });
      setNoteContent('');
      setShowNoteModal(false);
    } catch (error) {
      console.error('[Player] Failed to save note:', error);
      alert('Failed to save note. Please try again.');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(doc.id, noteId);
      setDoc({
        ...doc,
        notes: doc.notes.filter(n => n.id !== noteId),
      });
    } catch (error) {
      console.error('[Player] Failed to delete note:', error);
      alert('Failed to delete note. Please try again.');
    }
  };

  const jumpToNote = (note: Note) => {
    if (!audioRef.current) return;

    audioRef.current.currentTime = note.timestamp;
    setCurrentTime(note.timestamp);
    setCurrentParagraphIndex(note.paragraphIndex);
  };

  const currentParaNotes = doc.notes.filter(
    n => n.paragraphIndex === currentParagraphIndex
  );

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{doc.title}</h1>
            <p className="text-sm text-slate-500">
              {doc.content.totalParagraphs} paragraphs • {formatTime(duration)}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-slate-600 hover:text-slate-900"
        >
          <Settings className="w-6 h-6" />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        {isLoadingAudio && (
          <div className="text-center py-20 text-slate-500">
            Loading audio...
          </div>
        )}

        {audioError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3">
            <div className="flex-1 text-sm">
              <p className="font-bold">Playback Error</p>
              <p>{audioError}</p>
            </div>
          </div>
        )}

        {/* Paragraphs */}
        {!isLoadingAudio && (
          <div className="max-w-3xl mx-auto space-y-4">
            {doc.content.paragraphs.map((para, idx) => (
              <div
                key={para.id}
                ref={el => paragraphRefs.current[idx] = el}
                onClick={() => seekToParagraph(idx)}
                className={`p-4 rounded-xl text-lg leading-relaxed transition-all cursor-pointer ${
                  idx === currentParagraphIndex
                    ? 'bg-indigo-50 border-l-4 border-indigo-500 text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <p>{para.text}</p>
                
                {/* Notes for this paragraph */}
                {currentParaNotes.length > 0 && idx === currentParagraphIndex && (
                  <div className="mt-4 space-y-2">
                    {currentParaNotes.map(note => (
                      <div
                        key={note.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpToNote(note);
                        }}
                        className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm cursor-pointer hover:bg-yellow-100"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-xs text-yellow-600 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(note.timestamp)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNote(note.id);
                            }}
                            className="text-yellow-600 hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-yellow-900">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* All Notes Section */}
            {doc.notes.length > 0 && (
              <div className="mt-8 border-t border-slate-200 pt-8">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                  All Notes ({doc.notes.length})
                </h3>
                <div className="grid gap-3">
                  {doc.notes.map(note => (
                    <div
                      key={note.id}
                      onClick={() => jumpToNote(note)}
                      className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 cursor-pointer hover:bg-yellow-100"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-xs text-yellow-600">
                          Para {note.paragraphIndex + 1} • {formatTime(note.timestamp)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note.id);
                          }}
                          className="text-yellow-600 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-sm text-yellow-900">{note.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player Controls */}
      <div className="bg-white border-t border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Timeline */}
          <div
            className="relative h-2 bg-slate-200 rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="absolute h-2 bg-indigo-600 rounded-full"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
            <div
              className="absolute w-4 h-4 bg-indigo-600 rounded-full -mt-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${(currentTime / duration) * 100}%`, marginLeft: '-8px' }}
            />
          </div>

          {/* Time Display */}
          <div className="flex justify-between text-xs text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={handleSkipBack}
              disabled={currentParagraphIndex === 0}
              className="text-slate-400 hover:text-indigo-600 disabled:opacity-30"
            >
              <SkipBack className="w-8 h-8" />
            </button>

            <button
              onClick={handlePlayPause}
              disabled={isLoadingAudio}
              className="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
            </button>

            <button
              onClick={handleSkipForward}
              disabled={currentParagraphIndex === doc.content.paragraphs.length - 1}
              className="text-slate-400 hover:text-indigo-600 disabled:opacity-30"
            >
              <SkipForward className="w-8 h-8" />
            </button>
          </div>

          {/* Progress Text */}
          <div className="text-center text-xs text-slate-400 font-medium">
            Paragraph {currentParagraphIndex + 1} of {doc.content.totalParagraphs}
          </div>

          {/* Add Note Button */}
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowNoteModal(true)}
            >
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">Playback Settings</h3>
              <button onClick={() => setShowSettings(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Playback Speed: {settings.playbackSpeed}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={settings.playbackSpeed}
                  onChange={(e) => onUpdateSettings({
                    ...settings,
                    playbackSpeed: parseFloat(e.target.value),
                  })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0.5x</span>
                  <span>2.0x</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Add Note</h3>
              <button onClick={() => setShowNoteModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              At {formatTime(currentTime)} • Paragraph {currentParagraphIndex + 1}
            </p>

            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Enter your note..."
              className="w-full px-4 py-3 border border-slate-300 rounded-xl resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
              rows={4}
              autoFocus
            />

            <div className="flex gap-3 mt-4">
              <Button
                variant="secondary"
                onClick={() => setShowNoteModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button onClick={handleAddNote} className="flex-1">
                Save Note
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
