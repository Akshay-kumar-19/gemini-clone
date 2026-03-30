import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAi6v8HU1WVZfzwzH2KF6RGXyqjze0tPyE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gemini-clone-40b75.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gemini-clone-40b75',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gemini-clone-40b75.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '506108403891',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:506108403891:web:b03773db3aca064f2950c6',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-J4XC36047F',
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

let auth = null;
let provider = null;

if (hasFirebaseConfig) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {});
}

export { auth, hasFirebaseConfig, onAuthStateChanged };

export async function loginWithGoogle() {
  if (!auth || !provider) {
    throw new Error('Firebase is not initialized correctly.');
  }

  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function logoutUser() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}
