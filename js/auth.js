/**
 * Authentication Module
 * Manages Firebase Authentication and single authorized user validation
 */

import { auth, isFirebaseConfigured, getStoredConfig } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let currentUser = null;
let isAuthorized = false;

// Demo user session state when live Firebase is not configured
const DEMO_USER = {
  uid: "demo-authorized-user-001",
  email: "student@university.edu",
  displayName: "Authorized Student",
  isDemo: true
};

/**
 * Initialize Authentication Listener
 * @param {Function} onStateChanged Callback invoked with ({ user, isAuthorized, isDemo })
 */
export function initAuth(onStateChanged) {
  const { authorizedEmail } = getStoredConfig();

  if (!isFirebaseConfigured() || !auth) {
    // Live Firebase not yet configured: Use local demo authentication state
    const demoLoggedIn = localStorage.getItem("demo_user_logged_in") !== "false";
    if (demoLoggedIn) {
      currentUser = DEMO_USER;
      isAuthorized = true;
    } else {
      currentUser = null;
      isAuthorized = false;
    }
    onStateChanged({ user: currentUser, isAuthorized, isDemo: true, authorizedEmail });
    return () => {};
  }

  // Live Firebase Auth Listener
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      const config = getStoredConfig();
      const targetEmail = (config.authorizedEmail || "").trim().toLowerCase();
      const userEmail = (user.email || "").trim().toLowerCase();
      
      // Strict single authorized user check
      isAuthorized = Boolean(targetEmail && userEmail === targetEmail);
      
      onStateChanged({ 
        user, 
        isAuthorized, 
        isDemo: false, 
        authorizedEmail: config.authorizedEmail 
      });
    } else {
      isAuthorized = false;
      onStateChanged({ 
        user: null, 
        isAuthorized: false, 
        isDemo: false, 
        authorizedEmail: getStoredConfig().authorizedEmail 
      });
    }
  });

  return unsubscribe;
}

/**
 * Sign in with Email and Password
 */
export async function loginWithEmail(email, password) {
  if (!isFirebaseConfigured() || !auth) {
    const config = getStoredConfig();
    const targetEmail = (config.authorizedEmail || DEMO_USER.email).trim().toLowerCase();
    
    if (email.trim().toLowerCase() === targetEmail) {
      currentUser = { ...DEMO_USER, email: email.trim() };
      isAuthorized = true;
      localStorage.setItem("demo_user_logged_in", "true");
      return { user: currentUser, isAuthorized: true };
    } else {
      // Simulate unauthorized account rejection
      currentUser = { uid: "unauthorized-demo-user", email: email.trim(), isDemo: true };
      isAuthorized = false;
      localStorage.setItem("demo_user_logged_in", "true");
      throw new Error(`Access restricted: Account "${email}" is not the authorized user. Authorized email is: ${config.authorizedEmail}`);
    }
  }

  return await signInWithEmailAndPassword(auth, email, password);
}

/**
 * Sign up a new user account
 */
export async function registerWithEmail(email, password) {
  if (!isFirebaseConfigured() || !auth) {
    return loginWithEmail(email, password);
  }
  return await createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  if (!isFirebaseConfigured() || !auth) {
    currentUser = null;
    isAuthorized = false;
    localStorage.setItem("demo_user_logged_in", "false");
    window.location.reload();
    return;
  }
  return await signOut(auth);
}

/**
 * Get the current user
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Check if the current user is authorized
 */
export function isUserAuthorized() {
  return isAuthorized;
}
