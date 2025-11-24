export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface Note {
  id: string;
  pageNumber: number; // Which page this note belongs to
  paragraphIndex: number; // The index of the paragraph within the page
  timestamp: number; // Seconds relative to the start of the paragraph
  content: string;
  createdAt: string;
}

export interface Page {
  pageNumber: number; // 1-indexed page number
  imageUrl: string; // Download URL for the page image
  imagePath: string; // Storage path for the page image
  text: string; // Full OCR text for this page
  paragraphs: string[]; // Split paragraphs for this page
  audioPaths: string[]; // Storage paths for cached audio per paragraph
  audioUrls: string[]; // Download URLs for cached audio per paragraph
}

export interface Document {
  id: string;
  userId: string;
  title: string;
  pages: Page[]; // Array of pages in the document
  currentPage: number; // Current page number (1-indexed)
  currentParagraph: number; // Current paragraph index within current page
  createdAt: string;
  updatedAt?: string;
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
