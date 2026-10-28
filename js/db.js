/**
 * Database Module (Cloud Firestore Interface)
 * Direct client-side Firestore integration with real-time onSnapshot listeners
 * Stores tasks containing: title, description, deadline, and boolean completed status.
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
  orderBy,
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
    createdAt: new Date().toISOString()
  },
  {
    id: "task-sample-2",
    title: "Review code pull requests",
    description: "Check architecture compliance, unit test coverage, and documentation for new features.",
    deadline: `${tomorrowDateStr}T12:30`,
    completed: false,
    createdAt: new Date().toISOString()
  },
  {
    id: "task-sample-3",
    title: "Setup automated backup pipeline",
    description: "Configured scheduled backup routines and verified restoration procedures.",
    deadline: `${pastDateStr}T15:00`,
    completed: true,
    completedAt: pastDate.toISOString(),
    createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString()
  }
];

// In-memory / LocalStorage fallback real-time store for demo mode
class LocalTaskStore {
  constructor() {
    this.storageKey = "personal_task_manager_store_v3";
    this.listeners = new Set();
    this.init();
  }

  init() {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) {
      localStorage.setItem(this.storageKey, JSON.stringify(INITIAL_SAMPLE_TASKS));
    }
  }

  getTasks() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  saveTasks(tasks) {
    localStorage.setItem(this.storageKey, JSON.stringify(tasks));
    this.notify();
  }

  notify() {
    const tasks = this.getTasks();
    this.listeners.forEach(cb => cb([...tasks]));
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getTasks());
    return () => this.listeners.delete(callback);
  }

  addTask(taskData) {
    const tasks = this.getTasks();
    const newTask = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      title: taskData.title.trim(),
      description: (taskData.description || "").trim(),
      deadline: taskData.deadline,
      completed: false,
      userId: taskData.userId || "demo-authorized-user-001",
      createdAt: new Date().toISOString()
    };
    tasks.unshift(newTask);
    this.saveTasks(tasks);
    return newTask;
  }

  toggleComplete(id, completed) {
    const tasks = this.getTasks().map(t => {
      if (t.id === id) {
        return {
          ...t,
          completed: completed,
          completedAt: completed ? new Date().toISOString() : null
        };
      }
      return t;
    });
    this.saveTasks(tasks);
  }

  updateTask(id, fields) {
    const tasks = this.getTasks().map(t => {
      if (t.id === id) {
        return {
          ...t,
          ...fields,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    this.saveTasks(tasks);
  }

  deleteTask(id) {
    const tasks = this.getTasks().filter(t => t.id !== id);
    this.saveTasks(tasks);
  }

  resetDemo() {
    localStorage.setItem(this.storageKey, JSON.stringify(INITIAL_SAMPLE_TASKS));
    this.notify();
  }
}

const localStore = new LocalTaskStore();

/**
 * Subscribe to real-time task updates via Firestore onSnapshot
 * @param {Function} onTasksReceived Callback receiving tasks array
 * @param {Function} onError Callback for error handling
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTasks(onTasksReceived, onError) {
  if (!isFirebaseConfigured() || !db) {
    console.log("Subscribing to reactive local store (Demo Mode)");
    return localStore.subscribe(onTasksReceived);
  }

  const user = getCurrentUser();
  if (!user) {
    onTasksReceived([]);
    return () => {};
  }

  try {
    const tasksCol = collection(db, COLLECTION_NAME);
    // Real-time listener for current user tasks
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
 * Insert a new task into Firestore database
 * @param {Object} taskData { title, description, deadline }
 */
export async function insertTask(taskData) {
  const user = getCurrentUser();
  
  if (!isFirebaseConfigured() || !db) {
    return localStore.addTask({
      ...taskData,
      userId: user ? user.uid : "demo-authorized-user-001"
    });
  }

  if (!user) throw new Error("Authentication required to add tasks.");

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
  if (!isFirebaseConfigured() || !db) {
    return localStore.toggleComplete(taskId, completed);
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
  if (!isFirebaseConfigured() || !db) {
    return localStore.updateTask(taskId, updateData);
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
  if (!isFirebaseConfigured() || !db) {
    return localStore.deleteTask(taskId);
  }

  const taskRef = doc(db, COLLECTION_NAME, taskId);
  await deleteDoc(taskRef);
}

/**
 * Reset demo tasks to initial set
 */
export function resetDemoTasks() {
  localStore.resetDemo();
}
