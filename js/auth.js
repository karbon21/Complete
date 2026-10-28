/**
 * Authentication Module
 * Manages Firebase Authentication for valid users
 */

import { auth, isFirebaseConfigured } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let currentUser = null;
let isAuthorized = false;

// Demo user session state when live Firebase is not configured
const DEFAULT_DEMO_USER = {
  uid: "demo-authorized-user-001",
  email: "student@university.edu",
  displayName: "Authorized Student",
  isDemo: true
};

function getDemoUser() {
  const storedEmail = localStorage.getItem("demo_user_email");
  if (storedEmail) {
    return {
      uid: "demo-user-" + btoa(storedEmail.toLowerCase()).replace(/=/g, ""),
      email: storedEmail,
      displayName: storedEmail.split("@")[0],
      isDemo: true
    };
  }
  return DEFAULT_DEMO_USER;
}

/**
 * Initialize Authentication Listener
 * @param {Function} onStateChanged Callback invoked with ({ user, isAuthorized, isDemo })
 */
export function initAuth(onStateChanged) {
  if (!isFirebaseConfigured() || !auth) {
    // Live Firebase not yet configured: Use local demo authentication state
    const demoLoggedIn = localStorage.getItem("demo_user_logged_in") !== "false";
    if (demoLoggedIn) {
      currentUser = getDemoUser();
      isAuthorized = true;
    } else {
      currentUser = null;
      isAuthorized = false;
    }
    onStateChanged({ user: currentUser, isAuthorized, isDemo: true });
    return () => {};
  }

  // Live Firebase Auth Listener: Any successfully authenticated Firebase user is valid and authorized
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    currentUser = user;
    isAuthorized = Boolean(user);
    onStateChanged({ 
      user, 
      isAuthorized, 
      isDemo: false 
    });
  });

  return unsubscribe;
}

/**
 * Sign in with Email and Password
 */
export async function loginWithEmail(email, password) {
  if (!isFirebaseConfigured() || !auth) {
    const cleanEmail = (email || "").trim();
    currentUser = {
      uid: "demo-user-" + btoa(cleanEmail.toLowerCase()).replace(/=/g, ""),
      email: cleanEmail,
      displayName: cleanEmail.split("@")[0],
      isDemo: true
    };
    isAuthorized = true;
    localStorage.setItem("demo_user_logged_in", "true");
    localStorage.setItem("demo_user_email", cleanEmail);
    return { user: currentUser, isAuthorized: true };
  }

  return await signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Sign up a new user account (Disabled: accounts are managed directly in console)
 */
export async function registerWithEmail() {
  throw new Error("Registration is disabled. Accounts are managed directly by administrator.");
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  if (!isFirebaseConfigured() || !auth) {
    currentUser = null;
    isAuthorized = false;
    localStorage.setItem("demo_user_logged_in", "false");
    localStorage.removeItem("demo_user_email");
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
