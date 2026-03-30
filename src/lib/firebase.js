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
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
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
    throw new Error('Firebase config is missing. Add your Vite Firebase keys in .env.');
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
