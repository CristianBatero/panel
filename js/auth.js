// /js/auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// ⚙️ Tu proyecto HTTP Conexión
const firebaseConfig = {
  apiKey: "AIzaSyBdV3vmyeDWv1rImwxHTTFm4uwczdKlmL0",
  authDomain: "http-conexion.firebaseapp.com",
  databaseURL: "https://http-conexion-default-rtdb.firebaseio.com",
  projectId: "http-conexion",
  storageBucket: "http-conexion.firebasestorage.app",
  messagingSenderId: "149721662763",
  appId: "1:149721662763:web:e6055ec5eef1f73216b16e"
};

// Correos con acceso al panel
export const ALLOW = ["elcris1823@gmail.com"]; // añade más si quieres

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = "es";

export const db = getFirestore(app);

// Guarda/actualiza datos del usuario en Firestore (idempotente)
export async function upsertUserProfile(user, extra = {}) {
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  try {
    await setDoc(
      ref,
      {
        uid: user.uid,
        email: user.email || null,
        provider: (user.providerData?.[0]?.providerId) || "password",
        lastLoginAt: serverTimestamp(),
        loginCount: increment(1),
        userAgent: navigator.userAgent || null,
        ...extra
      },
      { merge: true }
    );
  } catch (err) {
    // No bloqueamos el flujo si falla la escritura por reglas/red
    console.warn("[upsertUserProfile] fallo:", err?.code || err);
  }
}

// Guards
export function requireAuth(redirectTo = "/view/login.html") {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      const ok = user && ALLOW.includes(user.email || "");
      if (ok) resolve(user);
      else location.replace(redirectTo);
    });
  });
}

export function requireAnon(redirectTo = "/view/admin.html") {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      const ok = user && ALLOW.includes(user.email || "");
      if (ok) location.replace(redirectTo);
      else resolve();
    });
  });
}

// Login / Logout
export function loginWithEmail(email, pass) {
  return signInWithEmailAndPassword(auth, email, pass);
}

export async function logoutAndGo(redirectTo = "/view/login.html") {
  await signOut(auth);
  location.replace(redirectTo);
}

// Helpers “recordarme”
const LS_KEY_EMAIL = "panel_email";
export function rememberEmail(email) {
  try { localStorage.setItem(LS_KEY_EMAIL, email || ""); } catch {}
}
export function getSavedEmail() {
  try { return localStorage.getItem(LS_KEY_EMAIL) || ""; } catch { return ""; }
}
