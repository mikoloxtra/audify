import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import { AppSettings, Document, VoiceGender, SourceImage, Note, PlaybackState } from '../types';

// File size limit: 10MB per image
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

const DEFAULT_SETTINGS: AppSettings = {
  voiceGender: VoiceGender.FEMALE,
  playbackSpeed: 1.0,
};

const sanitize = <T>(data: T): T => JSON.parse(JSON.stringify(data));

export const saveDocument = async (document: Document): Promise<void> => {
  const documentRef = doc(db, 'documents', document.id);
  const payload = {
    ...document,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(documentRef, sanitize(payload), { merge: true });
};

export const getUserDocuments = async (userId: string): Promise<Document[]> => {
  const documentsQuery = query(collection(db, 'documents'), where('userId', '==', userId));
  const snapshot = await getDocs(documentsQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
    } as Document;
  });
};

export const deleteDocument = async (documentId: string): Promise<void> => {
  await deleteDoc(doc(db, 'documents', documentId));
};

export const getSettings = async (userId: string): Promise<AppSettings> => {
  const settingsRef = doc(db, 'settings', userId);
  const snapshot = await getDoc(settingsRef);
  if (!snapshot.exists()) {
    return DEFAULT_SETTINGS;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...snapshot.data(),
  } as AppSettings;
};

export const saveSettings = async (userId: string, settings: AppSettings): Promise<void> => {
  const settingsRef = doc(db, 'settings', userId);
  await setDoc(settingsRef, sanitize(settings), { merge: true });
};

// ===== NEW REFACTORED FUNCTIONS =====

/**
 * Upload multiple source images for a document
 */
export const uploadSourceImages = async (
  userId: string,
  documentId: string,
  files: File[]
): Promise<SourceImage[]> => {
  const sourceImages: SourceImage[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File "${file.name}" exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }

    const storagePath = `users/${userId}/documents/${documentId}/images/${i + 1}-${file.name}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    sourceImages.push({
      id: uuidv4(),
      storagePath,
      downloadURL,
      uploadedAt: new Date().toISOString(),
      order: i + 1,
    });
  }

  return sourceImages;
};

/**
 * Upload processed audio file for a document
 */
export const uploadAudio = async (
  userId: string,
  documentId: string,
  audioBlob: Blob
): Promise<{ storagePath: string; downloadURL: string }> => {
  const storagePath = `users/${userId}/documents/${documentId}/audio/full-audio.wav`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, audioBlob);
  const downloadURL = await getDownloadURL(storageRef);
  return { storagePath, downloadURL };
};

/**
 * Load a single document by ID
 */
export const loadDocument = async (
  userId: string,
  documentId: string
): Promise<Document> => {
  const documentRef = doc(db, 'documents', documentId);
  const snapshot = await getDoc(documentRef);
  
  if (!snapshot.exists()) {
    throw new Error('Document not found');
  }

  const data = snapshot.data();
  
  if (data.userId !== userId) {
    throw new Error('Unauthorized access to document');
  }

  return {
    id: snapshot.id,
    ...data,
  } as Document;
};

/**
 * Update playback progress
 */
export const updatePlaybackProgress = async (
  documentId: string,
  currentTime: number,
  currentParagraphIndex: number
): Promise<void> => {
  const documentRef = doc(db, 'documents', documentId);
  const completionPercentage = 0; // Will be calculated based on currentTime/duration
  
  await updateDoc(documentRef, {
    'playback.currentTime': currentTime,
    'playback.currentParagraphIndex': currentParagraphIndex,
    'playback.lastPlayedAt': new Date().toISOString(),
    'playback.completionPercentage': completionPercentage,
    updatedAt: new Date().toISOString(),
  });
};

/**
 * Save a note to a document
 */
export const saveNote = async (
  documentId: string,
  note: Note
): Promise<void> => {
  const documentRef = doc(db, 'documents', documentId);
  const docSnap = await getDoc(documentRef);
  
  if (!docSnap.exists()) {
    throw new Error('Document not found');
  }

  const document = docSnap.data() as Document;
  const existingNotes = document.notes || [];
  
  // Check if note exists (update) or is new (add)
  const noteIndex = existingNotes.findIndex(n => n.id === note.id);
  
  if (noteIndex >= 0) {
    existingNotes[noteIndex] = { ...note, updatedAt: new Date().toISOString() };
  } else {
    existingNotes.push(note);
  }

  await updateDoc(documentRef, {
    notes: existingNotes,
    updatedAt: new Date().toISOString(),
  });
};

/**
 * Delete a note from a document
 */
export const deleteNote = async (
  documentId: string,
  noteId: string
): Promise<void> => {
  const documentRef = doc(db, 'documents', documentId);
  const docSnap = await getDoc(documentRef);
  
  if (!docSnap.exists()) {
    throw new Error('Document not found');
  }

  const document = docSnap.data() as Document;
  const updatedNotes = (document.notes || []).filter(n => n.id !== noteId);

  await updateDoc(documentRef, {
    notes: updatedNotes,
    updatedAt: new Date().toISOString(),
  });
};
