// ===== USER & AUTH =====

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface AppSettings {
  voiceGender: VoiceGender;
  playbackSpeed: number; // 0.5x to 2.0x
}

export enum VoiceGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export type ViewState = 'AUTH' | 'DASHBOARD' | 'SCANNER' | 'PLAYER' | 'PROFILE';

// ===== NEW REFACTORED DATA MODEL =====

export interface Document {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  
  // Source images
  sourceImages: SourceImage[];
  
  // Processed content
  content: ProcessedContent;
  
  // Audio
  audio: AudioData;
  
  // Playback state
  playback: PlaybackState;
  
  // User annotations
  notes: Note[];
}

export interface SourceImage {
  id: string;
  storagePath: string;
  downloadURL: string;
  uploadedAt: string;
  order: number; // For multi-image documents
}

export interface ProcessedContent {
  fullText: string; // Raw OCR output
  paragraphs: Paragraph[];
  totalParagraphs: number;
  totalCharacters: number;
  language?: string;
  processedAt: string;
}

export interface Paragraph {
  id: string;
  index: number;
  text: string;
  startTime: number; // Start time in audio (seconds)
  endTime: number;   // End time in audio (seconds)
  characterStart: number; // Character position in fullText
  characterEnd: number;
}

export interface AudioData {
  storagePath: string;
  downloadURL: string;
  duration: number; // Total duration in seconds
  format: 'pcm' | 'mp3' | 'wav';
  sampleRate: number;
  generatedAt: string;
  voiceGender: VoiceGender;
}

export interface PlaybackState {
  currentTime: number; // Current playback position in seconds
  currentParagraphIndex: number;
  lastPlayedAt: string;
  isCompleted: boolean;
  completionPercentage: number;
}

export interface Note {
  id: string;
  timestamp: number; // Time in audio (seconds)
  paragraphIndex: number;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

// ===== PROCESSING =====

export interface ProcessingStatus {
  stage: 'uploading' | 'ocr' | 'audio' | 'saving' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  currentStep?: number;
  totalSteps?: number;
}
