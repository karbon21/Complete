/**
 * Database Module (Cloud Firestore Interface)
 * Direct client-side Firestore integration with real-time onSnapshot listeners
 * Stores tasks containing: title, description, deadline, boolean completed status, and userId.
 * Ensures strict multi-user task isolation.
 */

import { db, isFirebaseConfigured } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLLECTION_NAME = "tasks";

// Clean initial sample data for offline preview & testing
const now = new Date();
const todayDateStr = now.toISOString().slice(0, 10);
const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);
const pastDate = new Date(now.getTime() - 48 * 3600 * 1000);
const pastDateStr = pastDate.toISOString().slice(0, 10);

const INITIAL_SAMPLE_TASKS = [
  {
    id: "task-sample-1",
    title: "Finish quarterly project presentation",
    description: "Prepare slides covering key milestones, sprint outcomes, and next quarter roadmap.",
    deadline: `${todayDateStr}T17:00`,
    completed: false,
    userId: "demo-authorized-user-001",
    createdAt: new Date().toISOString()
  },
  {
    id: "task-sample-2",
    title: "Review code pull requests",
    description: "Check architecture compliance, unit test coverage, and documentation for new features.",
    deadline: `${tomorrowDateStr}T12:30`,
    completed: false,
    userId: "demo-authorized-user-001",
    createdAt: new Date().toISOString()
  },
  {
    id: "task-sample-3",
    title: "Setup automated backup pipeline",
    description: "Configured scheduled backup routines and verified restoration procedures.",
    deadline: `${pastDateStr}T15:00`,
    completed: true,
    completedAt: pastDate.toISOString(),
    userId: "demo-authorized-user-001",
    createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString()
  }
];

// In-memory / LocalStorage fallback real-time store for demo mode with multi-user isolation
class LocalTaskStore {
  constructor() {
    this.storageKey = "personal_task_manager_store_v3";
    this.listeners = new Map();
    this.nextListenerId = 1;
    this.init();
  }

  init() {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) {
      localStorage.setItem(this.storageKey, JSON.stringify(INITIAL_SAMPLE_TASKS));
    }
  }

  getAllTasks() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  getUserTasks(userId) {
    if (!userId) return [];
    return this.getAllTasks().filter(t => t.userId === userId);
  }

  saveTasks(tasks) {
    localStorage.setItem(this.storageKey, JSON.stringify(tasks));
    this.notify();
  }

  notify() {
    this.listeners.forEach(({ callback, userId }) => {
      callback(this.getUserTasks(userId));
    });
  }

  subscribe(callback, userId) {
    const id = this.nextListenerId++;
    this.listeners.set(id, { callback, userId });
    callback(this.getUserTasks(userId));
    return () => this.listeners.delete(id);
  }

  addTask(taskData) {
    const allTasks = this.getAllTasks();
    const newTask = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      title: taskData.title.trim(),
      description: (taskData.description || "").trim(),
      deadline: taskData.deadline,
      completed: false,
      userId: taskData.userId || "demo-authorized-user-001",
      createdAt: new Date().toISOString()
    };
    allTasks.unshift(newTask);
    this.saveTasks(allTasks);
    return newTask;
  }

  toggleComplete(id, completed, userId) {
    const allTasks = this.getAllTasks().map(t => {
      if (t.id === id && (!userId || t.userId === userId)) {
        return {
          ...t,
          completed: Boolean(completed),
          completedAt: completed ? new Date().toISOString() : null
        };
      }
      return t;
    });
    this.saveTasks(allTasks);
  }

  updateTask(id, fields, userId) {
    const allTasks = this.getAllTasks().map(t => {
      if (t.id === id && (!userId || t.userId === userId)) {
        return {
          ...t,
          ...fields,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    this.saveTasks(allTasks);
  }

  deleteTask(id, userId) {
    const allTasks = this.getAllTasks().filter(t => !(t.id === id && (!userId || t.userId === userId)));
    this.saveTasks(allTasks);
  }

  resetDemo(userId) {
    const targetUserId = userId || "demo-authorized-user-001";
    const otherTasks = this.getAllTasks().filter(t => t.userId !== targetUserId);
    const userSamples = INITIAL_SAMPLE_TASKS.map(t => ({
      ...t,
      id: "sample-" + Math.random().toString(36).substring(2, 7),
      userId: targetUserId
    }));
    this.saveTasks([...userSamples, ...otherTasks]);
  }
}

const localStore = new LocalTaskStore();

/**
 * Subscribe to real-time task updates via Firestore onSnapshot
 * Strictly isolates tasks so only the current user's tasks are fetched.
 * @param {Function} onTasksReceived Callback receiving tasks array
 * @param {Function} onError Callback for error handling
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTasks(onTasksReceived, onError) {
  const user = getCurrentUser();
  if (!user) {
    onTasksReceived([]);
    return () => {};
  }

  if (!isFirebaseConfigured() || !db) {
    console.log("Subscribing to reactive local store (Demo Mode) for user:", user.uid);
    return localStore.subscribe(onTasksReceived, user.uid);
  }

  try {
    const tasksCol = collection(db, COLLECTION_NAME);
    // Real-time listener strictly querying documents matching current user's UID
    const q = query(
      tasksCol, 
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const tasks = [];
        snapshot.forEach((docSnapshot) => {
          tasks.push({
            id: docSnapshot.id,
            ...docSnapshot.data()
          });
        });
        onTasksReceived(tasks);
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error("Failed to setup Firestore listener:", err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Insert a new task into Firestore database with current user UID
 * @param {Object} taskData { title, description, deadline }
 */
export async function insertTask(taskData) {
  const user = getCurrentUser();
  if (!user) throw new Error("Authentication required to add tasks.");

  if (!isFirebaseConfigured() || !db) {
    return localStore.addTask({
      ...taskData,
      userId: user.uid
    });
  }

  const payload = {
    title: taskData.title.trim(),
    description: (taskData.description || "").trim(),
    deadline: taskData.deadline, // ISO string or datetime
    completed: false,
    userId: user.uid,
    createdAt: serverTimestamp()
  };

  const tasksCol = collection(db, COLLECTION_NAME);
  const docRef = await addDoc(tasksCol, payload);
  return { id: docRef.id, ...payload };
}

/**
 * Toggle task completion status
 * @param {string} taskId Task Document ID
 * @param {boolean} completed Target status (true = completed, false = active)
 */
export async function toggleTaskCompletion(taskId, completed) {
  const user = getCurrentUser();
  if (!user) throw new Error("Authentication required.");

  if (!isFirebaseConfigured() || !db) {
    return localStore.toggleComplete(taskId, completed, user.uid);
  }

  const taskRef = doc(db, COLLECTION_NAME, taskId);
  const updatePayload = {
    completed: Boolean(completed),
    completedAt: completed ? serverTimestamp() : null
  };

  await updateDoc(taskRef, updatePayload);
}

/**
 * Update an existing task document
 * @param {string} taskId Task Document ID
 * @param {Object} updateData Fields to update (title, description, deadline)
 */
export async function updateTask(taskId, updateData) {
  const user = getCurrentUser();
  if (!user) throw new Error("Authentication required.");

  if (!isFirebaseConfigured() || !db) {
    return localStore.updateTask(taskId, updateData, user.uid);
  }

  const taskRef = doc(db, COLLECTION_NAME, taskId);
  const payload = {
    ...updateData,
    updatedAt: serverTimestamp()
  };

  await updateDoc(taskRef, payload);
}

/**
 * Delete a task document from Firestore
 * @param {string} taskId Task Document ID
 */
export async function removeTask(taskId) {
  const user = getCurrentUser();
  if (!user) throw new Error("Authentication required.");

  if (!isFirebaseConfigured() || !db) {
    return localStore.deleteTask(taskId, user.uid);
  }

  const taskRef = doc(db, COLLECTION_NAME, taskId);
  await deleteDoc(taskRef);
}

/**
 * Reset demo tasks for current user
 */
export function resetDemoTasks() {
  const user = getCurrentUser();
  localStore.resetDemo(user ? user.uid : "demo-authorized-user-001");
}
