import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { AppSettings, Document, VoiceGender } from '../types';

// File size limit: 10MB per image
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

const DEFAULT_SETTINGS: AppSettings = {
  voiceGender: VoiceGender.FEMALE,
  playbackSpeed: 1.0,
};

const sanitize = <T>(data: T): T => JSON.parse(JSON.stringify(data));

export const saveDocument = async (document: Document): Promise<void> => {
  const documentRef = doc(db, 'documents', document.id);
  const payload: Document = {
    ...document,
    pages: document.pages ?? [],
    notes: document.notes ?? [],
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
      pages: (data.pages as any[] | undefined) ?? [],
      notes: (data.notes as any[] | undefined) ?? [],
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

export const uploadSourceAsset = async (
  userId: string,
  file: File
): Promise<{ storagePath: string; downloadURL: string }> => {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
  }

  const storagePath = `users/${userId}/uploads/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  return { storagePath, downloadURL };
};

export const uploadAudioCache = async (
  userId: string,
  documentId: string,
  paragraphIndex: number,
  audioBlob: Blob
): Promise<{ storagePath: string; downloadURL: string }> => {
  const storagePath = `users/${userId}/audio/${documentId}/paragraph-${paragraphIndex}.pcm`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, audioBlob);
  const downloadURL = await getDownloadURL(storageRef);
  return { storagePath, downloadURL };
};
