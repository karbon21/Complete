/**
 * Application Main Controller
 * Tasks have title, description, deadline, and completed status.
 * All tasks are grouped strictly by deadline day, matching the reference design.
 */

import {
  subscribeToTasks,
  insertTask,
  toggleTaskCompletion,
  updateTask,
  removeTask,
  resetDemoTasks
} from "./db.js";
import {
  initAuth,
  loginWithEmail,
  logoutUser,
  getCurrentUser,
  isUserAuthorized
} from "./auth.js";
import {
  getStoredConfig,
  saveStoredConfig,
  isFirebaseConfigured
} from "./firebase-config.js";

// Global Application State
const state = {
  tasks: [],
  currentPage: "active", // 'active' | 'past'
  isEditMode: false,
  expandedTaskIds: new Set(), // Set of task IDs that are currently expanded
  user: null,
  isAuthorized: false,
  isDemo: true,
  editingTaskId: null,
  unsubscribeTasks: null
};

// DOM Elements Cache
const elements = {
  pageTitle: document.getElementById("page-title"),
  connectionIndicator: document.getElementById("connection-indicator"),
  connectionLabel: document.getElementById("connection-label"),
  btnOpenAdd: document.getElementById("btn-open-add"),
  btnToggleEdit: document.getElementById("btn-toggle-edit"),
  btnEditText: document.getElementById("btn-edit-text"),
  btnPageNav: document.getElementById("btn-page-nav"),
  navBtnText: document.getElementById("nav-btn-text"),
  btnOpenSettings: document.getElementById("btn-open-settings"),
  btnUserAuth: document.getElementById("btn-user-auth"),
  userDisplayEmail: document.getElementById("user-display-email"),
  editBanner: document.getElementById("edit-banner"),
  btnDoneEditingBanner: document.getElementById("btn-done-editing-banner"),
  unauthorizedCard: document.getElementById("unauthorized-card"),
  unauthCurrentEmail: document.getElementById("unauth-current-email"),
  unauthTargetEmail: document.getElementById("unauth-target-email"),
  btnSignoutUnauth: document.getElementById("btn-signout-unauth"),
  tasksContainer: document.getElementById("tasks-container"),
  emptyState: document.getElementById("empty-state"),
  emptyTitle: document.getElementById("empty-title"),
  emptyDesc: document.getElementById("empty-desc"),
  btnEmptyAdd: document.getElementById("btn-empty-add"),

  // Task Modal
  taskModal: document.getElementById("task-modal"),
  taskModalTitle: document.getElementById("task-modal-title"),
  taskForm: document.getElementById("task-form"),
  taskTitleInput: document.getElementById("task-title-input"),
  taskDescriptionInput: document.getElementById("task-description-input"),
  taskDeadlineInput: document.getElementById("task-deadline-input"),
  btnCloseTaskModal: document.getElementById("btn-close-task-modal"),
  btnCancelTask: document.getElementById("btn-cancel-task"),

  // Config Modal
  configModal: document.getElementById("config-modal"),
  configForm: document.getElementById("config-form"),
  cfgApiKey: document.getElementById("cfg-api-key"),
  cfgProjectId: document.getElementById("cfg-project-id"),
  cfgAuthDomain: document.getElementById("cfg-auth-domain"),
  cfgStorageBucket: document.getElementById("cfg-storage-bucket"),
  cfgSenderId: document.getElementById("cfg-sender-id"),
  cfgAppId: document.getElementById("cfg-app-id"),
  btnCloseConfigModal: document.getElementById("btn-close-config-modal"),
  btnCancelConfig: document.getElementById("btn-cancel-config"),
  btnResetDemo: document.getElementById("btn-reset-demo"),

  // Auth Modal
  authModal: document.getElementById("auth-modal"),
  authModalTitle: document.getElementById("auth-modal-title"),
  authForm: document.getElementById("auth-form"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authSubmitBtn: document.getElementById("auth-submit-btn"),
  authErrorMsg: document.getElementById("auth-error-msg"),
  btnCloseAuthModal: document.getElementById("btn-close-auth-modal"),
  btnQuickAuthDemo: document.getElementById("btn-quick-auth-demo")
};

/**
 * Initialize Application
 */
export function initApp() {
  setupEventListeners();
  populateConfigFields();
  updateConnectionStatusUI();

  // Initialize Auth state observer
  initAuth(({ user, isAuthorized, isDemo }) => {
    state.user = user;
    state.isAuthorized = isAuthorized;
    state.isDemo = isDemo;

    updateAuthHeaderUI(user);

    // Clean up previous subscription and clear tasks from memory
    if (state.unsubscribeTasks) {
      state.unsubscribeTasks();
      state.unsubscribeTasks = null;
    }
    state.tasks = [];
    state.expandedTaskIds.clear();

    if (user && isAuthorized) {
      if (elements.unauthorizedCard) elements.unauthorizedCard.classList.add("hidden");
      elements.tasksContainer.classList.remove("hidden");
      startTasksSubscription();
    } else {
      if (elements.unauthorizedCard) elements.unauthorizedCard.classList.add("hidden");
      renderTasks();
    }
  });
}

/**
 * Setup Real-time Firestore Subscription
 */
function startTasksSubscription() {
  if (state.unsubscribeTasks) {
    state.unsubscribeTasks();
  }

  state.unsubscribeTasks = subscribeToTasks(
    (tasks) => {
      state.tasks = tasks;
      // Expand first task by default if none are explicitly expanded
      if (state.expandedTaskIds.size === 0 && tasks.length > 0) {
        const activeTasks = tasks.filter(t => !t.completed);
        if (activeTasks.length > 0) {
          state.expandedTaskIds.add(activeTasks[0].id);
        }
      }
      renderTasks();
    },
    (err) => {
      console.error("Firestore subscription error:", err);
    }
  );
}

/**
 * Update Header Auth UI
 */
function updateAuthHeaderUI(user) {
  if (user) {
    elements.userDisplayEmail.textContent = user.email || "Account";
    elements.btnUserAuth.title = `Signed in as ${user.email} (Click to sign out)`;
  } else {
    elements.userDisplayEmail.textContent = "Sign In";
    elements.btnUserAuth.title = "Click to sign in";
  }
}

/**
 * Format Deadline String to match reference picture exactly:
 * "Deadline: Oct 30 · 12:30"
 */
export function formatDeadlineText(isoDateStr) {
  if (!isoDateStr) return "";
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return "";

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const day = d.getDate();

  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `Deadline: ${month} ${day} · ${hours}:${minutes}`;
}

/**
 * Group tasks strictly by deadline day
 */
export function groupTasksByDeadlineDay(tasks) {
  const dayGroupsMap = new Map();

  tasks.forEach(task => {
    let dayKey = "no-deadline";
    let sortValue = 9999999999999;

    if (task.deadline) {
      const d = new Date(task.deadline);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dayKey = `${year}-${month}-${day}`;
        sortValue = new Date(year, d.getMonth(), d.getDate()).getTime();
      }
    }

    if (!dayGroupsMap.has(dayKey)) {
      dayGroupsMap.set(dayKey, {
        dayKey,
        sortValue,
        tasks: []
      });
    }

    dayGroupsMap.get(dayKey).tasks.push(task);
  });

  // Sort Day Groups chronologically
  const sortedDayGroups = Array.from(dayGroupsMap.values()).sort((a, b) => a.sortValue - b.sortValue);

  return sortedDayGroups.map(group => {
    // Sort tasks within the day by their deadline time
    group.tasks.sort((x, y) => (x.deadline || "").localeCompare(y.deadline || ""));

    return {
      dayKey: group.dayKey,
      dayTitle: formatDayTitle(group.dayKey),
      dayBadge: getDayBadgeInfo(group.dayKey),
      tasks: group.tasks
    };
  });
}

function formatDayTitle(dayKey) {
  if (dayKey === "no-deadline") return "No Deadline Set";

  const [year, month, day] = dayKey.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const options = { weekday: "long", month: "short", day: "numeric", year: "numeric" };
  const formatted = targetDate.toLocaleDateString(undefined, options);

  if (diffDays === 0) return `Today · ${targetDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  if (diffDays === 1) return `Tomorrow · ${targetDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  if (diffDays === -1) return `Yesterday · ${targetDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  if (diffDays < -1) return `${formatted} (${Math.abs(diffDays)} days ago)`;
  return formatted;
}

function getDayBadgeInfo(dayKey) {
  if (dayKey === "no-deadline") return { text: "Flexible", type: "neutral" };

  const [year, month, day] = dayKey.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: "Overdue", type: "overdue" };
  if (diffDays === 0) return { text: "Due Today", type: "today" };
  if (diffDays === 1) return { text: "Due Tomorrow", type: "tomorrow" };
  return { text: `${diffDays} days left`, type: "neutral" };
}

/**
 * Render Tasks Grouped by Deadline Day
 */
export function renderTasks() {
  const { tasks, currentPage, isEditMode, user, isAuthorized } = state;

  // Header Title and Page Switcher Text
  if (currentPage === "active") {
    elements.pageTitle.textContent = "To-Do List";
    elements.navBtnText.textContent = "Past →";
    elements.btnPageNav.title = "Go to Past completed tasks";
  } else {
    elements.pageTitle.textContent = "Past";
    elements.navBtnText.textContent = "← To-Do List";
    elements.btnPageNav.title = "Return to active To-Do List";
  }

  // Edit Mode UI Toggle
  if (isEditMode) {
    elements.btnToggleEdit.classList.add("edit-active");
    elements.btnEditText.textContent = "Done";
    elements.editBanner.classList.remove("hidden");
  } else {
    elements.btnToggleEdit.classList.remove("edit-active");
    elements.btnEditText.textContent = "Edit";
    elements.editBanner.classList.add("hidden");
  }

  // Not signed in
  if (!user || !isAuthorized) {
    elements.tasksContainer.innerHTML = "";
    elements.emptyState.classList.remove("hidden");
    elements.emptyTitle.textContent = "Sign In Required";
    elements.emptyDesc.textContent = "Please sign in to view and manage your tasks.";
    return;
  }

  // Filter tasks by active vs completed
  const isPast = currentPage === "past";
  const filteredTasks = tasks.filter(t => Boolean(t.completed) === isPast);

  if (filteredTasks.length === 0) {
    elements.tasksContainer.innerHTML = "";
    elements.emptyState.classList.remove("hidden");
    if (currentPage === "active") {
      elements.emptyTitle.textContent = "All Caught Up!";
      elements.emptyDesc.textContent = "No pending tasks. Click '+ Add Task' to plan new work.";
    } else {
      elements.emptyTitle.textContent = "No Completed Tasks";
      elements.emptyDesc.textContent = "When you click 'Complete Task' on an active item, it will move here.";
    }
    return;
  }

  elements.emptyState.classList.add("hidden");

  // Group strictly by deadline day
  const dayGroups = groupTasksByDeadlineDay(filteredTasks);

  let html = "";

  dayGroups.forEach(dayGroup => {
    html += `
      <section class="day-section" data-day="${escapeHTML(dayGroup.dayKey)}">
        <!-- Day Section Header -->
        <div class="day-header">
          <div class="day-header-left">
            <h2 class="day-title">${escapeHTML(dayGroup.dayTitle)}</h2>
            <span class="day-badge badge-${dayGroup.dayBadge.type}">${dayGroup.tasks.length} task${dayGroup.tasks.length === 1 ? "" : "s"}</span>
          </div>

          ${isEditMode ? `
            <button class="btn-day-add-task" data-action="day-add" data-day="${escapeHTML(dayGroup.dayKey)}" type="button">
              + Add Task for this Day
            </button>
          ` : ""}
        </div>

        <!-- Task Cards for this Day (styled identically to reference image) -->
        <div class="day-cards-list">
    `;

    dayGroup.tasks.forEach(task => {
      const isExpanded = state.expandedTaskIds.has(task.id);
      const deadlineText = formatDeadlineText(task.deadline);

      html += `
        <div class="task-card ${isExpanded ? "is-expanded" : ""}" data-task-id="${task.id}">
          <!-- Task Card Header: Title on left, Deadline & Chevron on right -->
          <div class="task-card-header" data-action="toggle-task" data-task-id="${task.id}">
            <div class="task-card-title">${escapeHTML(task.title || "Untitled Task")}</div>
            <div class="task-card-header-right">
              ${deadlineText ? `<span class="task-card-deadline">${escapeHTML(deadlineText)}</span>` : ""}
              <span class="chevron-icon">
                ${isExpanded ? `
                  <!-- Down Chevron (expanded) -->
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                ` : `
                  <!-- Right Chevron (collapsed) -->
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                `}
              </span>
            </div>
          </div>

          <!-- Task Card Body: Description & Complete/Uncomplete Button -->
          ${isExpanded ? `
            <div class="task-card-body">
              <div class="task-description-text ${task.completed ? "completed-strikethrough" : ""} ${!task.description ? "empty-desc" : ""}">
                ${task.description ? escapeHTML(task.description) : "No description provided."}
              </div>

              <div class="task-actions-row">
                ${!isPast ? `
                  <!-- "Complete Task" button (exact styled button with green border & text) -->
                  <button class="btn-complete-task" data-action="complete-task" data-task-id="${task.id}" type="button">
                    Complete Task
                  </button>
                ` : `
                  <!-- "Uncomplete" button for Past page -->
                  <button class="btn-uncomplete-task" data-action="uncomplete-task" data-task-id="${task.id}" type="button">
                    Uncomplete
                  </button>
                `}

                ${isEditMode ? `
                  <button class="btn-task-action" data-action="edit-task" data-task-id="${task.id}" type="button">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                  <button class="btn-task-action delete-btn" data-action="delete-task" data-task-id="${task.id}" type="button">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete
                  </button>
                ` : ""}
              </div>
            </div>
          ` : ""}
        </div>
      `;
    });

    html += `
        </div>
      </section>
    `;
  });

  elements.tasksContainer.innerHTML = html;
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  // Page Navigation: Active To-Do List <-> Past Tasks
  elements.btnPageNav.addEventListener("click", () => {
    state.currentPage = state.currentPage === "active" ? "past" : "active";
    renderTasks();
  });

  // Edit Mode Toggle
  elements.btnToggleEdit.addEventListener("click", () => {
    state.isEditMode = !state.isEditMode;
    renderTasks();
  });

  elements.btnDoneEditingBanner.addEventListener("click", () => {
    state.isEditMode = false;
    renderTasks();
  });

  // Add Task Modal Openers
  elements.btnOpenAdd.addEventListener("click", () => openTaskModal());
  elements.btnEmptyAdd.addEventListener("click", () => openTaskModal());
  elements.btnCloseTaskModal.addEventListener("click", closeTaskModal);
  elements.btnCancelTask.addEventListener("click", closeTaskModal);

  // Task Form Submit (Insert or Edit)
  elements.taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = elements.taskTitleInput.value.trim();
    const description = elements.taskDescriptionInput.value.trim();
    const deadline = elements.taskDeadlineInput.value;

    if (!title) return;

    try {
      if (state.editingTaskId) {
        await updateTask(state.editingTaskId, { title, description, deadline });
      } else {
        const newTask = await insertTask({ title, description, deadline });
        if (newTask && newTask.id) {
          state.expandedTaskIds.add(newTask.id);
        }
      }
      closeTaskModal();
    } catch (err) {
      alert("Failed to save task: " + err.message);
    }
  });

  // Tasks Container Delegated Actions (Toggle, Complete, Uncomplete, Edit, Delete)
  elements.tasksContainer.addEventListener("click", async (e) => {
    const target = e.target;

    // Toggle Task Card Accordion Header
    const header = target.closest('[data-action="toggle-task"]');
    if (header) {
      const taskId = header.getAttribute("data-task-id");
      if (state.expandedTaskIds.has(taskId)) {
        state.expandedTaskIds.delete(taskId);
      } else {
        state.expandedTaskIds.add(taskId);
      }
      renderTasks();
      return;
    }

    // Complete Task Action
    const completeBtn = target.closest('[data-action="complete-task"]');
    if (completeBtn) {
      const taskId = completeBtn.getAttribute("data-task-id");
      completeBtn.disabled = true;
      try {
        await toggleTaskCompletion(taskId, true);
      } catch (err) {
        alert("Error completing task: " + err.message);
        completeBtn.disabled = false;
      }
      return;
    }

    // Uncomplete Task Action
    const uncompleteBtn = target.closest('[data-action="uncomplete-task"]');
    if (uncompleteBtn) {
      const taskId = uncompleteBtn.getAttribute("data-task-id");
      uncompleteBtn.disabled = true;
      try {
        await toggleTaskCompletion(taskId, false);
      } catch (err) {
        alert("Error restoring task: " + err.message);
        uncompleteBtn.disabled = false;
      }
      return;
    }

    // Edit Task Action
    const editBtn = target.closest('[data-action="edit-task"]');
    if (editBtn) {
      const taskId = editBtn.getAttribute("data-task-id");
      const task = state.tasks.find(t => t.id === taskId);
      if (task) {
        openTaskModal(task);
      }
      return;
    }

    // Delete Task Action
    const deleteBtn = target.closest('[data-action="delete-task"]');
    if (deleteBtn) {
      const taskId = deleteBtn.getAttribute("data-task-id");
      if (confirm("Are you sure you want to permanently delete this task?")) {
        try {
          await removeTask(taskId);
          state.expandedTaskIds.delete(taskId);
        } catch (err) {
          alert("Error deleting task: " + err.message);
        }
      }
      return;
    }

    // Inline Add Task for a specific Day
    const dayAddBtn = target.closest('[data-action="day-add"]');
    if (dayAddBtn) {
      const dayKey = dayAddBtn.getAttribute("data-day");
      openTaskModalWithDay(dayKey);
      return;
    }
  });

  // Settings & Config Modal Handlers
  elements.btnOpenSettings.addEventListener("click", openConfigModal);
  elements.connectionIndicator.addEventListener("click", openConfigModal);
  elements.btnCloseConfigModal.addEventListener("click", closeConfigModal);
  elements.btnCancelConfig.addEventListener("click", closeConfigModal);

  elements.configForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newConfig = {
      apiKey: elements.cfgApiKey.value.trim(),
      authDomain: elements.cfgAuthDomain.value.trim(),
      projectId: elements.cfgProjectId.value.trim(),
      storageBucket: elements.cfgStorageBucket.value.trim(),
      messagingSenderId: elements.cfgSenderId.value.trim(),
      appId: elements.cfgAppId.value.trim()
    };

    saveStoredConfig(newConfig);
    alert("Firebase credentials saved! The application will reload to establish connection.");
    window.location.reload();
  });

  elements.btnResetDemo.addEventListener("click", () => {
    if (confirm("Reset demo tasks?")) {
      resetDemoTasks();
      closeConfigModal();
      alert("Sample tasks reloaded!");
    }
  });

  // Auth Modal Handlers
  elements.btnUserAuth.addEventListener("click", () => {
    if (state.user) {
      if (confirm(`Signed in as ${state.user.email}.\nDo you want to sign out?`)) {
        logoutUser();
      }
    } else {
      openAuthModal();
    }
  });

  if (elements.btnSignoutUnauth) {
    elements.btnSignoutUnauth.addEventListener("click", () => logoutUser());
  }
  elements.btnCloseAuthModal.addEventListener("click", closeAuthModal);

  elements.authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = elements.authEmail.value.trim();
    const password = elements.authPassword.value;

    elements.authSubmitBtn.disabled = true;
    elements.authErrorMsg.classList.add("hidden");

    try {
      await loginWithEmail(email, password);
      closeAuthModal();
    } catch (err) {
      let message = err.message || "Failed to sign in.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        message = "Invalid email or password. Please check your credentials.";
      } else if (err.code === "auth/too-many-requests") {
        message = "Too many failed attempts. Please try again later.";
      }
      elements.authErrorMsg.textContent = message;
      elements.authErrorMsg.classList.remove("hidden");
    } finally {
      elements.authSubmitBtn.disabled = false;
    }
  });

  if (elements.btnQuickAuthDemo) {
    elements.btnQuickAuthDemo.addEventListener("click", async () => {
      const demoEmail = "student@university.edu";
      elements.authEmail.value = demoEmail;
      elements.authPassword.value = "demo123456";
      try {
        await loginWithEmail(demoEmail, "demo123456");
        closeAuthModal();
      } catch (e) {
        elements.authErrorMsg.textContent = e.message;
        elements.authErrorMsg.classList.remove("hidden");
      }
    });
  }
}

/**
 * Task Modal Helpers
 */
function openTaskModal(task = null) {
  elements.taskModal.classList.remove("hidden");
  elements.taskForm.reset();

  if (task) {
    state.editingTaskId = task.id;
    elements.taskModalTitle.textContent = "Edit Task";
    elements.taskTitleInput.value = task.title || "";
    elements.taskDescriptionInput.value = task.description || "";
    elements.taskDeadlineInput.value = task.deadline || "";
  } else {
    state.editingTaskId = null;
    elements.taskModalTitle.textContent = "Add Task";
    
    // Default deadline to today at 18:00
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    elements.taskDeadlineInput.value = `${year}-${month}-${day}T18:00`;
  }

  elements.taskTitleInput.focus();
}

function openTaskModalWithDay(dayKey) {
  openTaskModal();
  if (dayKey && dayKey !== "no-deadline") {
    elements.taskDeadlineInput.value = `${dayKey}T18:00`;
  }
}

function closeTaskModal() {
  elements.taskModal.classList.add("hidden");
  state.editingTaskId = null;
}

/**
 * Config Modal Helpers
 */
function openConfigModal() {
  populateConfigFields();
  elements.configModal.classList.remove("hidden");
}

function closeConfigModal() {
  elements.configModal.classList.add("hidden");
}

function populateConfigFields() {
  const { firebaseConfig } = getStoredConfig();
  if (firebaseConfig) {
    elements.cfgApiKey.value = firebaseConfig.apiKey || "";
    elements.cfgProjectId.value = firebaseConfig.projectId || "";
    elements.cfgAuthDomain.value = firebaseConfig.authDomain || "";
    elements.cfgStorageBucket.value = firebaseConfig.storageBucket || "";
    elements.cfgSenderId.value = firebaseConfig.messagingSenderId || "";
    elements.cfgAppId.value = firebaseConfig.appId || "";
  }
}

function updateConnectionStatusUI() {
  const isConfigured = isFirebaseConfigured();
  if (isConfigured) {
    elements.connectionIndicator.className = "connection-pill connected";
    elements.connectionLabel.textContent = "Firestore Live";
    elements.connectionIndicator.title = "Connected to live Firebase Firestore";
    if (elements.btnQuickAuthDemo) {
      elements.btnQuickAuthDemo.classList.add("hidden");
    }
  } else {
    elements.connectionIndicator.className = "connection-pill demo-mode";
    elements.connectionLabel.textContent = "Demo Mode";
    elements.connectionIndicator.title = "Running with reactive local store. Click to configure live Firebase.";
    if (elements.btnQuickAuthDemo) {
      elements.btnQuickAuthDemo.classList.remove("hidden");
    }
  }
}

/**
 * Auth Modal Helpers
 */
function openAuthModal() {
  elements.authModal.classList.remove("hidden");
  elements.authErrorMsg.classList.add("hidden");
  elements.authEmail.focus();
}

function closeAuthModal() {
  elements.authModal.classList.add("hidden");
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Bootstrap application
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
