import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { User } from '../types';

type AuthUnsubscribe = () => void;

const mapFirebaseUser = (firebaseUser: FirebaseUser): User => ({
  id: firebaseUser.uid,
  email: firebaseUser.email ?? '',
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
});

export const listenToAuthChanges = (callback: (user: User | null) => void): AuthUnsubscribe => {
  return onAuthStateChanged(auth, (firebaseUser) => {
    callback(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
  });
};

export const registerWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<User> => {
  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credentials.user, { displayName });
  }
  return mapFirebaseUser(credentials.user);
};

export const loginWithEmail = async (email: string, password: string): Promise<User> => {
  const credentials = await signInWithEmailAndPassword(auth, email, password);
  return mapFirebaseUser(credentials.user);
};

export const loginWithGoogle = async (): Promise<User> => {
  const credentials = await signInWithPopup(auth, googleProvider);
  return mapFirebaseUser(credentials.user);
};

export const logout = async (): Promise<void> => {
  await signOut(auth);
};
