/**
 * Firebase Configuration & Initialization
 * 
 * You can configure your Firebase project credentials here, or enter them
 * directly in the application's "Firebase Settings" modal at runtime.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Default Firebase Configuration
// Replace these with your actual Firebase project credentials from the Firebase Console
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD5ruaz-OXp-JixPyoFfiaBLuviFxEoU54",
  authDomain: "complete-tasklist.firebaseapp.com",
  projectId: "complete-tasklist",
  storageBucket: "complete-tasklist.firebasestorage.app",
  messagingSenderId: "681124214785",
  appId: "1:681124214785:web:67092336f90e16ae896800"
};

/**
 * Retrieve current active configuration (local storage override or default)
 */
export function getStoredConfig() {
  try {
    const stored = localStorage.getItem("firebase_task_manager_config");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        firebaseConfig: parsed.firebaseConfig || DEFAULT_FIREBASE_CONFIG
      };
    }
  } catch (e) {
    console.warn("Could not read stored Firebase config:", e);
  }
  return {
    firebaseConfig: DEFAULT_FIREBASE_CONFIG
  };
}

/**
 * Save configuration to local storage
 */
export function saveStoredConfig(firebaseConfig) {
  localStorage.setItem(
    "firebase_task_manager_config",
    JSON.stringify({ firebaseConfig })
  );
}

/**
 * Check if current config has valid non-placeholder keys
 */
export function isFirebaseConfigured() {
  const { firebaseConfig } = getStoredConfig();
  return (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID"
  );
}

// Initialize Firebase instances if configured
let app = null;
let db = null;
let auth = null;

try {
  const { firebaseConfig } = getStoredConfig();
  if (isFirebaseConfigured()) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase initialized successfully with project:", firebaseConfig.projectId);
  } else {
    console.log("Firebase not configured with live credentials. Running in Demo Mode.");
  }
} catch (error) {
  console.warn("Firebase initialization error:", error);
}

export { app, db, auth };
