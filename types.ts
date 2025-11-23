export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface Note {
  id: string;
  paragraphIndex: number; // The index of the paragraph
  timestamp: number; // Seconds relative to the start of the paragraph
  content: string;
  createdAt: string;
}

export interface Document {
  id: string;
  userId: string;
  title: string;
  content: string; // Full text content
  paragraphs: string[]; // Split content for easier TTS chunking
  progressIndex: number; // Current paragraph index
  createdAt: string;
  updatedAt?: string;
  sourceImagePath?: string; // Path in Firebase Storage
  sourceImageUrl?: string; // Download URL for display
  notes: Note[];
}

export enum VoiceGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export interface AppSettings {
  voiceGender: VoiceGender;
  playbackSpeed: number; // 0.5x to 2.0x
}

export type ViewState = 'AUTH' | 'DASHBOARD' | 'SCANNER' | 'PLAYER' | 'PROFILE';
