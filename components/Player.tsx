import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, AppSettings, Note, VoiceGender } from '../types';
import { generateSpeech } from '../services/geminiService';
import { saveDocument, uploadAudioCache } from '../services/storageService';
import { storage } from '../services/firebase';
import { ref, getBytes } from 'firebase/storage';
import { Button } from './Button';
import { 
  Play, Pause, SkipBack, SkipForward, Settings, 
  Mic, X, Share2, MessageSquarePlus, Clock, AlertTriangle
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Use Web Speech API Recognition for "Pause" command
const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// --- Audio Helpers for Gemini Raw PCM ---

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array): string {
  // Convert Uint8Array to base64 in chunks to avoid stack overflow
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface PlayerProps {
  document: Document;
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  onBack: () => void;
}

export const Player: React.FC<PlayerProps> = ({ document: initialDoc, settings, onUpdateSettings, onBack }) => {
  const [doc, setDoc] = useState(initialDoc);
  const [currentParaIndex, setCurrentParaIndex] = useState(doc.progressIndex || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  
  // Time Tracking State
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const recognitionRef = useRef<any>(null);
  
  // Web Audio API Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const isManualStopRef = useRef<boolean>(false);
  
  // Time Tracking Refs
  const startTimeRef = useRef<number>(0); // AudioContext time when playback started
  const currentBufferOffsetRef = useRef<number>(0); // Offset in seconds within current buffer
  const rafRef = useRef<number | null>(null); // Request Animation Frame

  // Initialize AudioContext
  useEffect(() => {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    // Gemini TTS uses 24000Hz
    audioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });

    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Save progress whenever index changes
  useEffect(() => {
    const persistProgress = async () => {
      const updatedDoc = { ...doc, progressIndex: currentParaIndex };
      try {
        await saveDocument(updatedDoc);
        setDoc(updatedDoc);
      } catch (error) {
        console.error('Failed to save listening progress:', error);
      }
    };

    void persistProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParaIndex]);

  // Animation Loop for Progress Bar
  const updateProgress = useCallback(() => {
    if (audioCtxRef.current && isPlaying && duration > 0) {
       const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
       // Calculate current position in buffer: startOffset + (elapsed * speed)
       const currentPos = currentBufferOffsetRef.current + (elapsed * settings.playbackSpeed);
       setPlaybackTime(Math.min(currentPos, duration));
       
       rafRef.current = requestAnimationFrame(updateProgress);
    }
  }, [isPlaying, settings.playbackSpeed, duration]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, updateProgress]);


  // Helper to play current buffer
  const playBufferedAudio = (startOffset: number = currentBufferOffsetRef.current) => {
    if (!audioCtxRef.current || !audioBufferRef.current) return;
    
    // Resume context if suspended (browser policy)
    if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
    }

    // Stop previous if running
    if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch(e) {}
    }

    isManualStopRef.current = false;
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = settings.playbackSpeed;
    source.connect(audioCtxRef.current.destination);
    
    source.onended = () => {
        if (!isManualStopRef.current) {
            handleAudioEnded();
        }
    };

    // Handle boundary check
    if (startOffset >= audioBufferRef.current.duration) {
        startOffset = 0;
    }

    currentBufferOffsetRef.current = startOffset;
    startTimeRef.current = audioCtxRef.current.currentTime;
    
    source.start(0, startOffset);
    sourceRef.current = source;
    setIsPlaying(true);
    
    // Ensure voice command listening matches state
    if (voiceListening && recognitionRef.current) {
       try { recognitionRef.current.start(); } catch(e) {}
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.min(1, Math.max(0, x / rect.width));
      const newTime = percent * duration;

      currentBufferOffsetRef.current = newTime;
      setPlaybackTime(newTime);

      if (isPlaying) {
          playBufferedAudio(newTime);
      }
  };

  // Load Audio for current paragraph
  const loadAudioForParagraph = useCallback(async (index: number, autoPlay: boolean, initialOffset: number = 0) => {
    if (index >= doc.paragraphs.length) {
        setIsPlaying(false);
        return;
    }
    
    setIsLoadingAudio(true);
    setAudioError(null);
    setPlaybackTime(0);
    setDuration(0);
    
    // Stop current playback while loading next
    if (sourceRef.current) {
        isManualStopRef.current = true;
        try { sourceRef.current.stop(); } catch(e) {}
    }

    try {
      let base64: string;
      
      // Check if audio is already cached
      if (doc.audioPaths && doc.audioPaths[index]) {
        console.log(`[Player] Using cached audio for paragraph ${index}`);
        // Fetch cached audio from Firebase Storage using SDK (no CORS issues)
        const storageRef = ref(storage, doc.audioPaths[index]);
        const arrayBuffer = await getBytes(storageRef);
        base64 = encode(new Uint8Array(arrayBuffer));
      } else {
        console.log(`[Player] Generating new audio for paragraph ${index}`);
        const text = doc.paragraphs[index];
        base64 = await generateSpeech(text, settings.voiceGender);
        
        // Cache the audio in Firebase Storage
        const pcmBytes = decode(base64);
        const audioBlob = new Blob([pcmBytes], { type: 'application/octet-stream' });
        const { storagePath, downloadURL } = await uploadAudioCache(doc.userId, doc.id, index, audioBlob);
        
        // Update document with cached audio path and URL
        const updatedAudioPaths = [...(doc.audioPaths || [])];
        const updatedAudioUrls = [...(doc.audioUrls || [])];
        updatedAudioPaths[index] = storagePath;
        updatedAudioUrls[index] = downloadURL;
        const updatedDoc = { ...doc, audioPaths: updatedAudioPaths, audioUrls: updatedAudioUrls };
        await saveDocument(updatedDoc);
        setDoc(updatedDoc);
        console.log(`[Player] Cached audio for paragraph ${index}`);
      }
      
      if (!audioCtxRef.current) return;

      // Decode Raw PCM
      const pcmBytes = decode(base64);
      const audioBuffer = await decodeAudioData(pcmBytes, audioCtxRef.current, 24000, 1);
      
      audioBufferRef.current = audioBuffer;
      setDuration(audioBuffer.duration);
      
      currentBufferOffsetRef.current = initialOffset;
      setPlaybackTime(initialOffset);
      
      if (autoPlay) {
        playBufferedAudio(initialOffset);
      } else {
        setIsPlaying(false);
      }

    } catch (error: any) {
      console.error("Failed to load audio", error);
      setIsPlaying(false);
      setAudioError(error.message || "Failed to generate audio for this section.");
    } finally {
      setIsLoadingAudio(false);
    }
  }, [doc, settings.voiceGender]);

  // Initial load and Paragraph change handling
  useEffect(() => {
    // Only trigger load if we aren't manually seeking via the jumpToNote function
    // (jumpToNote calls loadAudioForParagraph directly)
    if (!audioBufferRef.current && !isLoadingAudio) {
         loadAudioForParagraph(currentParaIndex, isPlaying);
    }
  }, [currentParaIndex]); 
  
  // Reload if voice gender changes
  useEffect(() => {
       // Reset buffer so it reloads
       audioBufferRef.current = null;
       loadAudioForParagraph(currentParaIndex, isPlaying, playbackTime);
  }, [settings.voiceGender]);


  // Update Playback Speed on the fly
  useEffect(() => {
    if (sourceRef.current) {
      sourceRef.current.playbackRate.value = settings.playbackSpeed;
    }
  }, [settings.playbackSpeed]);

  // Voice Command Recognition Setup
  useEffect(() => {
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.trim().toLowerCase();
        
        if (command.includes('pause') || command.includes('stop')) {
          handlePause();
          setShowNoteModal(true);
          setVoiceListening(false);
          recognition.stop();
        }
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceControl = () => {
    if (!recognitionRef.current) return;
    if (voiceListening) {
      recognitionRef.current.stop();
      setVoiceListening(false);
    } else {
      try { recognitionRef.current.start(); } catch(e) {}
      setVoiceListening(true);
    }
  };

  const handlePlay = () => {
    if (audioBufferRef.current) {
      playBufferedAudio();
    } else {
      loadAudioForParagraph(currentParaIndex, true);
    }
  };

  const handlePause = () => {
    if (sourceRef.current && audioCtxRef.current) {
      // Calculate elapsed time since start of this segment
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      // Precise tracking including speed
      currentBufferOffsetRef.current += elapsed * settings.playbackSpeed;
      
      // Clamp to duration
      if (audioBufferRef.current) {
          currentBufferOffsetRef.current = Math.min(currentBufferOffsetRef.current, audioBufferRef.current.duration);
      }

      isManualStopRef.current = true;
      sourceRef.current.stop();
      setIsPlaying(false);
      
      // Update UI state immediately
      setPlaybackTime(currentBufferOffsetRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  };

  const handleAudioEnded = () => {
    // If we hit the end of the buffer naturally
    currentBufferOffsetRef.current = 0; 
    setPlaybackTime(duration); // Show full bar
    
    if (currentParaIndex < doc.paragraphs.length - 1) {
      setCurrentParaIndex(prev => prev + 1);
      // Trigger load for next para
      // Reset buffer so effect triggers load
      audioBufferRef.current = null;
      // Small delay to allow React to update index state
      setTimeout(() => loadAudioForParagraph(currentParaIndex + 1, true), 0);
    } else {
      setIsPlaying(false);
    }
  };

  const saveNote = () => {
    if (!noteContent.trim()) {
        setShowNoteModal(false);
        return;
    }

    // Calculate current timestamp
    let timestamp = currentBufferOffsetRef.current;
    // If playing, we need to add the elapsed time since last "start"
    if (isPlaying && audioCtxRef.current) {
         const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
         timestamp += elapsed * settings.playbackSpeed;
    }

    const newNote: Note = {
      id: uuidv4(),
      paragraphIndex: currentParaIndex,
      timestamp: Math.max(0, timestamp),
      content: noteContent,
      createdAt: new Date().toISOString(),
    };
    const updatedDoc = { ...doc, notes: [...doc.notes, newNote] };
    void saveDocument(updatedDoc)
      .then(() => setDoc(updatedDoc))
      .catch((error) => console.error('Failed to save note:', error));
    setNoteContent('');
    setShowNoteModal(false);
  };

  const jumpToNote = (note: Note) => {
      // If note is in a different paragraph
      if (note.paragraphIndex !== currentParaIndex) {
          // Force buffer clear to trigger reload
          audioBufferRef.current = null;
          setCurrentParaIndex(note.paragraphIndex);
          loadAudioForParagraph(note.paragraphIndex, true, note.timestamp);
      } else {
          // Same paragraph, just seek
          if (audioBufferRef.current) {
              currentBufferOffsetRef.current = note.timestamp;
              setPlaybackTime(note.timestamp);
              playBufferedAudio(note.timestamp);
          }
      }
  };

  const handleShare = () => {
      if (navigator.share) {
          navigator.share({
              title: `Listening to ${doc.title}`,
              text: `I'm listening to ${doc.title} on Audify!`,
              url: window.location.href
          }).catch(console.error);
      } else {
          alert("Sharing not supported on this browser, but you can copy the URL!");
      }
  }
  
  const currentParaNotes = doc.notes.filter(n => n.paragraphIndex === currentParaIndex);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-full">
            <SkipBack className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-semibold truncate max-w-[200px]">{doc.title}</h2>
        <div className="flex gap-2">
             <button onClick={handleShare} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full">
                <Share2 className="w-5 h-5" />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full">
                <Settings className="w-6 h-6" />
            </button>
        </div>
      </div>

      {/* Main Content - Text Display */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-2xl mx-auto space-y-4">
          {audioError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <div className="flex-1 text-sm">
                      <p className="font-bold">Playback Error</p>
                      <p>{audioError}</p>
                      <button onClick={() => loadAudioForParagraph(currentParaIndex, true)} className="text-red-800 underline mt-1">Retry</button>
                  </div>
              </div>
          )}

          {doc.paragraphs.map((para, idx) => (
            <p 
              key={idx} 
              onClick={() => {
                  if (idx !== currentParaIndex) {
                      audioBufferRef.current = null;
                      setCurrentParaIndex(idx);
                      // Effect will trigger load
                  }
              }}
              className={`p-4 rounded-xl text-lg leading-relaxed transition-all cursor-pointer ${
                idx === currentParaIndex 
                  ? 'bg-white shadow-md border-l-4 border-indigo-500 text-slate-900' 
                  : 'text-slate-500 hover:bg-white hover:shadow-sm'
              }`}
            >
              {para}
            </p>
          ))}
          
          {/* Notes Section Inline */}
           {doc.notes.length > 0 && (
              <div className="mt-8 border-t border-slate-200 pt-8">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Your Notes</h3>
                  <div className="grid gap-3">
                      {doc.notes.map(note => (
                          <div 
                            key={note.id} 
                            onClick={() => jumpToNote(note)}
                            className="group bg-yellow-50 p-4 rounded-lg border border-yellow-100 text-yellow-900 text-sm cursor-pointer hover:bg-yellow-100 hover:shadow-sm transition-all"
                          >
                              <div className="flex justify-between items-start mb-1">
                                  <span className="font-bold text-xs text-yellow-600 flex items-center gap-1">
                                      Paragraph {note.paragraphIndex + 1}
                                  </span>
                                  <span className="flex items-center text-xs font-mono bg-yellow-200/50 px-2 py-0.5 rounded text-yellow-700">
                                      <Clock className="w-3 h-3 mr-1" />
                                      {formatTime(note.timestamp)}
                                  </span>
                              </div>
                              <p>{note.content}</p>
                          </div>
                      ))}
                  </div>
              </div>
           )}
        </div>
      </div>

      {/* Floating Action for Notes */}
      <button 
        onClick={() => { handlePause(); setShowNoteModal(true); }}
        className="absolute bottom-36 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-300 flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-transform"
      >
        <MessageSquarePlus className="w-6 h-6" />
      </button>

      {/* Player Controls */}
      <div className="bg-white border-t border-slate-200 p-6 pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="max-w-2xl mx-auto">
           {/* Audio Scrubber (Time) */}
           <div className="mb-6 relative group">
               <div 
                 className="h-2 bg-slate-200 rounded-full cursor-pointer relative overflow-visible"
                 onClick={handleSeek}
               >
                  {/* Fill */}
                  <div className="h-full bg-indigo-500 rounded-full relative pointer-events-none" style={{width: `${duration ? (playbackTime/duration)*100 : 0}%`}}>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  {/* Note Markers */}
                  {currentParaNotes.map(note => (
                      <div 
                         key={note.id}
                         className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-yellow-400 rounded-full border border-white shadow-sm z-20 transition-transform hover:scale-150 cursor-pointer"
                         style={{ left: `${duration ? (note.timestamp / duration) * 100 : 0}%` }}
                         title={`Note: ${note.content}`}
                         onClick={(e) => { e.stopPropagation(); jumpToNote(note); }}
                      />
                  ))}
               </div>
               
               {/* Time Labels */}
               <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium font-mono">
                   <span>{formatTime(playbackTime)}</span>
                   <span>{formatTime(duration)}</span>
               </div>
           </div>

           {/* Controls */}
           <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-4">
                   <button 
                      onClick={toggleVoiceControl}
                      className={`p-3 rounded-full transition-colors ${voiceListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-500'}`}
                      title="Voice Control: Say 'Pause' to add a note"
                   >
                       <Mic className="w-5 h-5" />
                   </button>
                   {voiceListening && <span className="text-xs text-red-500 font-medium">Listening...</span>}
               </div>

               <div className="flex items-center gap-6">
                   <button 
                     onClick={() => {
                         if (currentParaIndex > 0) {
                            audioBufferRef.current = null;
                            setCurrentParaIndex(Math.max(0, currentParaIndex - 1));
                         }
                     }}
                     disabled={currentParaIndex === 0}
                     className="text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                   >
                       <SkipBack className="w-8 h-8" />
                   </button>
                   
                   <button 
                     onClick={isPlaying ? handlePause : handlePlay}
                     disabled={isLoadingAudio}
                     className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-70"
                   >
                       {isLoadingAudio ? (
                           <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                       ) : isPlaying ? (
                           <Pause className="w-8 h-8 fill-current" />
                       ) : (
                           <Play className="w-8 h-8 fill-current ml-1" />
                       )}
                   </button>

                   <button 
                     onClick={() => {
                         if (currentParaIndex < doc.paragraphs.length - 1) {
                            audioBufferRef.current = null;
                            setCurrentParaIndex(currentParaIndex + 1);
                         }
                     }}
                     disabled={currentParaIndex === doc.paragraphs.length - 1}
                     className="text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                   >
                       <SkipForward className="w-8 h-8" />
                   </button>
               </div>

               <div className="w-12" /> {/* Spacer for balance */}
           </div>

           {/* Global Progress Text */}
           <div className="text-center text-xs text-slate-300 font-medium">
               Paragraph {currentParaIndex + 1} of {doc.paragraphs.length}
           </div>
        </div>
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setShowSettings(false)}>
            <div className="bg-white w-full max-w-sm mx-auto p-6 rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg">Audio Settings</h3>
                    <button onClick={() => setShowSettings(false)}><X className="w-5 h-5 text-slate-400"/></button>
                </div>
                
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">Voice</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => onUpdateSettings({...settings, voiceGender: VoiceGender.MALE})}
                                className={`py-3 rounded-xl border font-medium transition-all ${settings.voiceGender === VoiceGender.MALE ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
                            >
                                Male (Fenrir)
                            </button>
                            <button 
                                onClick={() => onUpdateSettings({...settings, voiceGender: VoiceGender.FEMALE})}
                                className={`py-3 rounded-xl border font-medium transition-all ${settings.voiceGender === VoiceGender.FEMALE ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
                            >
                                Female (Kore)
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">Speed ({settings.playbackSpeed}x)</label>
                        <input 
                            type="range" 
                            min="0.5" 
                            max="2.0" 
                            step="0.25"
                            value={settings.playbackSpeed}
                            onChange={(e) => onUpdateSettings({...settings, playbackSpeed: parseFloat(e.target.value)})}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-2">
                            <span>0.5x</span>
                            <span>1.0x</span>
                            <span>2.0x</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
           <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100">
                   <div className="bg-indigo-600 p-4 flex justify-between items-center">
                       <h3 className="text-white font-semibold flex items-center gap-2">
                           <Mic className="w-4 h-4" /> Add a Note
                       </h3>
                       <button onClick={() => setShowNoteModal(false)} className="text-indigo-200 hover:text-white">
                           <X className="w-5 h-5" />
                       </button>
                   </div>
                   <div className="p-6">
                       <div className="mb-4 text-xs text-indigo-500 font-medium bg-indigo-50 inline-block px-2 py-1 rounded">
                           Timestamp: {formatTime(currentBufferOffsetRef.current)}
                       </div>
                       <textarea 
                           autoFocus
                           value={noteContent}
                           onChange={(e) => setNoteContent(e.target.value)}
                           placeholder="Type your thought here..."
                           className="w-full h-32 resize-none p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none mb-4 text-slate-700"
                       />
                       <div className="flex justify-end gap-3">
                           <Button variant="outline" onClick={() => setShowNoteModal(false)}>Cancel</Button>
                           <Button onClick={saveNote}>Save Note</Button>
                       </div>
                   </div>
               </div>
           </div>
      )}
    </div>
  );
};