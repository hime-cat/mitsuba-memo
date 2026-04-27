const STORAGE_KEY = "adhd_support_app_v3";
const COMPLETED_LIMIT = 5;
const EMPTY_CURRENT_TASK_TEXT = "まずは今日の候補を1つ入れてみましょう";
const EMPTY_NEXT_STEP_TEXT = "このタスクを始めるための、小さな一歩を書いてみましょう";
const DEFAULT_NEXT_STEP_COUNT_TEXT = "一歩ずつ進めましょう";

const state = {
  tasks: [],
  completedTasks: [],
  currentTaskId: null,
  parking: [],
  showCompleted: false,
  showParking: false
};

const tabButtons = document.querySelectorAll("[data-tab]");
const brandHomeBtn = document.getElementById("brandHomeBtn");
const usePanel = document.getElementById("usePanel");
const aboutPanel = document.getElementById("aboutPanel");

const taskInput = document.getElementById("taskInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const taskList = document.getElementById("taskList");
const completedTaskList = document.getElementById("completedTaskList");
const completedToggleBtn = document.getElementById("completedToggleBtn");
const taskCountPill = document.getElementById("taskCountPill");
const taskCount = document.getElementById("taskCount");
const currentBox = document.getElementById("currentBox");
const currentTaskText = document.getElementById("currentTaskText");
const completeCurrentTaskBtn = document.getElementById("completeCurrentTaskBtn");

const nextStepSection = document.getElementById("nextStepSection");
const nextStepView = document.getElementById("nextStepView");
const nextStepText = document.getElementById("nextStepText");
const nextStepCount = document.getElementById("nextStepCount");
const nextStepActions = document.getElementById("nextStepActions");
const completeNextStepBtn = document.getElementById("completeNextStepBtn");
const editNextStepBtn = document.getElementById("editNextStepBtn");
const nextStepEditor = document.getElementById("nextStepEditor");
const nextStepInput = document.getElementById("nextStepInput");
const nextStepSaveNote = document.getElementById("nextStepSaveNote");
const closeNextStepEditorBtn = document.getElementById("closeNextStepEditorBtn");
const interruptionSummary = document.getElementById("interruptionSummary");
const interruptionModal = document.getElementById("interruptionModal");
const interruptionInput = document.getElementById("interruptionInput");
const cancelInterruptionBtn = document.getElementById("cancelInterruptionBtn");
const skipInterruptionBtn = document.getElementById("skipInterruptionBtn");
const completeInterruptionBtn = document.getElementById("completeInterruptionBtn");
const saveProgressBtn = document.getElementById("saveProgressBtn");

const parkingInput = document.getElementById("parkingInput");
const addParkingBtn = document.getElementById("addParkingBtn");
const parkingToggleBtn = document.getElementById("parkingToggleBtn");
const parkingList = document.getElementById("parkingList");

let supportSaveTimer = null;
let isNextStepEditorOpen = false;
let editingNextStepTaskId = null;
let hasShownSaveError = false;
let isTaskInputComposing = false;

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("保存に失敗しました:", error);

    if (!hasShownSaveError) {
      alert("ブラウザへの保存に失敗しました。ストレージ容量やブラウザ設定を確認してください。");
      hasShownSaveError = true;
    }

    return false;
  }
}

function normalizeTask(task) {
  const source = task || {};
  const now = new Date().toISOString();
  const stepCount = Number(source.stepCount);

  return {
    id: source.id || createId(),
    text: String(source.text || ""),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || source.createdAt || now,
    nextStep: typeof source.nextStep === "string" ? source.nextStep : "",
    stepCount: Number.isFinite(stepCount) && stepCount > 0 ? Math.floor(stepCount) : 0,
    interruptionNote: typeof source.interruptionNote === "string" ? source.interruptionNote : "",
    interruptedAt: typeof source.interruptedAt === "string" ? source.interruptedAt : null,
    progressLogs: Array.isArray(source.progressLogs) ? source.progressLogs : []
  };
}

function normalizeParkingItem(item) {
  const source = item || {};
  const normalized = normalizeTask(item);

  return {
    ...normalized,
    parkedAt: typeof source.parkedAt === "string" ? source.parkedAt : normalized.createdAt
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const parsed = JSON.parse(saved);
    const source = parsed && typeof parsed === "object" ? parsed : {};

    state.tasks = Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [];
    state.completedTasks = Array.isArray(source.completedTasks)
      ? source.completedTasks.map(task => {
          const normalized = normalizeTask(task);
          const completedAt = task && typeof task.completedAt === "string" ? task.completedAt : new Date().toISOString();

          return {
            ...normalized,
            completedAt
          };
        }).slice(0, COMPLETED_LIMIT)
      : [];
    state.currentTaskId = source.currentTaskId ?? null;
    state.parking = Array.isArray(source.parking) ? source.parking.map(normalizeParkingItem) : [];
    state.showCompleted = Boolean(source.showCompleted);
    state.showParking = Boolean(source.showParking);

    if (!state.tasks.some(task => task.id === state.currentTaskId)) {
      state.currentTaskId = state.tasks[0]?.id ?? null;
    }
  } catch (error) {
    console.error("保存データの読み込みに失敗しました:", error);
  }
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function formatUpdatedAt(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return `${hh}:${mm}`;
  }

  const month = d.getMonth() + 1;
  const day = d.getDate();

  if (d.getFullYear() === now.getFullYear()) {
    return `${month}/${day} ${hh}:${mm}`;
  }

  return `${d.getFullYear()}/${month}/${day}`;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shouldReduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function celebrateWithLeaves(sourceElement, count = 8) {
  if (!sourceElement || shouldReduceMotion()) return;

  const rect = sourceElement.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i += 1) {
    const leaf = document.createElement("span");
    const drift = Math.round((Math.random() - 0.5) * 150);
    const lift = Math.round(28 + Math.random() * 34);
    const rotate = Math.round((Math.random() - 0.5) * 180);
    const size = Math.round(10 + Math.random() * 8);

    leaf.className = "leaf-confetti";
    leaf.style.left = `${startX}px`;
    leaf.style.top = `${startY}px`;
    leaf.style.setProperty("--drift", `${drift}px`);
    leaf.style.setProperty("--lift", `-${lift}px`);
    leaf.style.setProperty("--rotate", `${rotate}deg`);
    leaf.style.setProperty("--size", `${size}px`);
    leaf.style.animationDelay = `${i * 34}ms`;

    document.body.appendChild(leaf);
    leaf.addEventListener("animationend", () => leaf.remove(), { once: true });
  }
}

function getCurrentTask() {
  return state.tasks.find(task => task.id === state.currentTaskId) ?? null;
}

function ensureCurrentTask() {
  const currentTask = getCurrentTask();

  if (!currentTask) {
    alert("先に「いまやること」を1つ選んでください。");
    return null;
  }

  return currentTask;
}

function setActiveTab(tabName) {
  tabButtons.forEach(button => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  usePanel.classList.toggle("is-active", tabName === "use");
  aboutPanel.classList.toggle("is-active", tabName === "about");
}

function moveTabFocus(currentButton, direction) {
  const buttons = Array.from(tabButtons);
  const currentIndex = buttons.indexOf(currentButton);
  const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
  const nextButton = buttons[nextIndex];

  setActiveTab(nextButton.dataset.tab);
  nextButton.focus();
}

function handleTabKeydown(event) {
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    moveTabFocus(event.currentTarget, 1);
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    moveTabFocus(event.currentTarget, -1);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    const firstButton = tabButtons[0];
    setActiveTab(firstButton.dataset.tab);
    firstButton.focus();
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    const lastButton = tabButtons[tabButtons.length - 1];
    setActiveTab(lastButton.dataset.tab);
    lastButton.focus();
  }
}

function renderCurrentTask() {
  const currentTask = getCurrentTask();
  currentTaskText.innerHTML = currentTask
    ? `<span class="task-leaf current-task-leaf is-current" aria-hidden="true"></span><span>${escapeHtml(currentTask.text)}</span>`
    : EMPTY_CURRENT_TASK_TEXT;
  currentTaskText.classList.toggle("is-empty", !currentTask);
  currentTaskText.setAttribute("role", currentTask ? "text" : "button");
  currentTaskText.tabIndex = currentTask ? -1 : 0;
  currentTaskText.setAttribute(
    "aria-label",
    currentTask ? currentTask.text : "今日の候補を入力する"
  );
  completeCurrentTaskBtn.hidden = !currentTask;
  saveProgressBtn.hidden = !currentTask;
}

function renderSupportPanel() {
  const currentTask = getCurrentTask();
  const hasTasks = state.tasks.length > 0;

  nextStepSection.hidden = !hasTasks;

  nextStepInput.disabled = !currentTask;
  editNextStepBtn.disabled = !currentTask;
  saveProgressBtn.disabled = !currentTask;

  renderNextStep(currentTask);

  if (!currentTask) {
    interruptionSummary.innerHTML = `<div class="empty">今日の候補から選ぶと、ここに再開メモが表示されます。</div>`;
    return;
  }

  nextStepInput.placeholder = "例：床のものを1つ拾う / 冷蔵庫を見る";
  renderInterruptionSummary(currentTask);
}

function renderNextStep(task) {
  const nextStep = task?.nextStep?.trim() ?? "";
  const stepCount = task?.stepCount ?? 0;

  nextStepText.textContent = nextStep || EMPTY_NEXT_STEP_TEXT;
  nextStepText.classList.toggle("is-empty", !nextStep);
  nextStepView.classList.toggle("is-empty", !nextStep);
  nextStepView.setAttribute("aria-label", nextStep ? "次の一歩を変更する" : "次の一歩を書く");
  nextStepCount.textContent = stepCount > 0 ? `${stepCount}歩進みました` : DEFAULT_NEXT_STEP_COUNT_TEXT;
  nextStepCount.hidden = !task;
  nextStepCount.classList.toggle("is-done", stepCount > 0);
  completeNextStepBtn.hidden = !nextStep;
  editNextStepBtn.textContent = nextStep ? "変える" : "次の一歩を書く";
  editNextStepBtn.classList.toggle("btn-primary", !nextStep);
  editNextStepBtn.classList.toggle("btn-soft", Boolean(nextStep));
  nextStepInput.value = nextStep;
  nextStepSaveNote.textContent = task ? "自動保存されます" : "";

  if (!task) {
    isNextStepEditorOpen = false;
    editingNextStepTaskId = null;
  } else if (editingNextStepTaskId && editingNextStepTaskId !== task.id) {
    isNextStepEditorOpen = false;
    editingNextStepTaskId = null;
  }

  nextStepEditor.hidden = !isNextStepEditorOpen;
  nextStepView.hidden = isNextStepEditorOpen;
  nextStepActions.hidden = isNextStepEditorOpen;
}

function openNextStepEditor() {
  if (!getCurrentTask()) return;

  isNextStepEditorOpen = true;
  editingNextStepTaskId = getCurrentTask().id;
  renderNextStep(getCurrentTask());

  requestAnimationFrame(() => {
    nextStepInput.focus();
  });
}

function closeNextStepEditor() {
  if (supportSaveTimer) {
    clearTimeout(supportSaveTimer);
    supportSaveTimer = null;
    saveNextStepNow();
  }

  isNextStepEditorOpen = false;
  editingNextStepTaskId = null;
  renderNextStep(getCurrentTask());
}

function completeNextStep() {
  const currentTask = ensureCurrentTask();
  if (!currentTask || !currentTask.nextStep) return;

  celebrateWithLeaves(completeNextStepBtn, 6);

  if (supportSaveTimer) {
    clearTimeout(supportSaveTimer);
    supportSaveTimer = null;
  }

  currentTask.stepCount = (Number(currentTask.stepCount) || 0) + 1;
  currentTask.nextStep = "";
  currentTask.updatedAt = new Date().toISOString();
  nextStepInput.value = "";
  isNextStepEditorOpen = false;
  editingNextStepTaskId = null;

  saveState();
  renderAll();
}

function setCurrentTask(taskId) {
  state.currentTaskId = taskId;
  saveState();
  renderAll();
}

function focusCurrentTaskBox() {
  if (!currentBox) return;

  currentBox.classList.remove("is-highlighted");

  if (!shouldReduceMotion()) {
    currentBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    currentBox.scrollIntoView({ block: "center" });
    return;
  }

  requestAnimationFrame(() => {
    currentBox.classList.add("is-highlighted");
  });
}

function focusTaskInput() {
  if (!taskInput) return;

  if (!shouldReduceMotion()) {
    taskInput.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    taskInput.scrollIntoView({ block: "center" });
  }

  requestAnimationFrame(() => {
    taskInput.focus();
  });
}

function addTask() {
  const text = taskInput.value.trim();

  if (!text) {
    alert("今日の候補に入れる内容を書いてください。");
    return;
  }

  if (state.tasks.length >= 3) {
    alert("今日の候補は3つまでです。今見ないタスクや作業中の思いつきは「いったん置く」に置いておけます。");
    return;
  }

  const now = new Date().toISOString();

  state.tasks.push({
    id: createId(),
    text,
    createdAt: now,
    updatedAt: now,
    nextStep: "",
    stepCount: 0,
    interruptionNote: "",
    interruptedAt: null,
    progressLogs: []
  });

  if (!state.currentTaskId) {
    state.currentTaskId = state.tasks[0].id;
  }

  taskInput.value = "";
  saveState();
  renderAll();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter(task => task.id !== taskId);

  if (state.currentTaskId === taskId) {
    state.currentTaskId = state.tasks[0]?.id ?? null;
  }

  saveState();
  renderAll();
}

function completeTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const now = new Date().toISOString();

  state.completedTasks.unshift({
    ...task,
    completedAt: now,
    updatedAt: now
  });
  state.completedTasks = state.completedTasks.slice(0, COMPLETED_LIMIT);

  state.tasks = state.tasks.filter(t => t.id !== taskId);

  if (state.currentTaskId === taskId) {
    state.currentTaskId = state.tasks[0]?.id ?? null;
  }

  saveState();
  renderAll();
}

function completeCurrentTask() {
  const currentTask = ensureCurrentTask();
  if (!currentTask) return;

  celebrateWithLeaves(completeCurrentTaskBtn, 12);
  completeTask(currentTask.id);
}

function restoreTask(taskId) {
  const task = state.completedTasks.find(t => t.id === taskId);
  if (!task) return;

  if (state.tasks.length >= 3) {
    alert("今日の候補は3つまでです。先にどれか整理してください。");
    return;
  }

  state.tasks.push({
    ...normalizeTask(task),
    updatedAt: new Date().toISOString()
  });

  state.completedTasks = state.completedTasks.filter(t => t.id !== taskId);

  if (!state.currentTaskId) {
    state.currentTaskId = task.id;
  }

  saveState();
  renderAll();
}

function deleteCompletedTask(taskId) {
  state.completedTasks = state.completedTasks.filter(t => t.id !== taskId);
  saveState();
  renderCompletedTasks();
}

function moveTaskToParking(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const now = new Date().toISOString();

  state.parking.unshift({
    ...normalizeTask(task),
    parkedAt: now
  });

  state.tasks = state.tasks.filter(t => t.id !== taskId);

  if (state.currentTaskId === taskId) {
    state.currentTaskId = state.tasks[0]?.id ?? null;
  }

  saveState();
  renderAll();
}

function toggleCompletedSection() {
  state.showCompleted = !state.showCompleted;
  saveState();
  renderCompletedTasks();
}

function toggleParkingSection() {
  state.showParking = !state.showParking;
  saveState();
  renderParking();
}

function renderTaskSupportSummary(task) {
  const lines = [];

  if (task.nextStep) {
    lines.push(`次の一歩：${escapeHtml(task.nextStep)}`);
  }

  if (task.interruptionNote) {
    lines.push(`再開メモ：${escapeHtml(task.interruptionNote)}`);
  } else if (task.interruptedAt) {
    lines.push("再開メモ：メモなし");
  }

  if (lines.length === 0) return "";

  return `<div class="item-sub">${lines.join("<br>")}</div>`;
}

function renderTasks() {
  taskList.innerHTML = "";
  taskCount.textContent = state.tasks.length;
  taskCountPill.classList.toggle("is-full", state.tasks.length >= 3);
  addTaskBtn.disabled = state.tasks.length >= 3;

  if (state.tasks.length === 0) {
    return;
  }

  state.tasks.forEach(task => {
    const isCurrent = state.currentTaskId === task.id;

    const item = document.createElement("div");
    item.className = isCurrent ? "item is-current" : "item";

    item.innerHTML = `
      <div class="item-top">
        <div style="flex:1;">
          <div class="item-text">
            <span class="task-leaf ${isCurrent ? "is-current" : "is-candidate"}" aria-hidden="true"></span>
            <span>${escapeHtml(task.text)}</span>
          </div>
          <div class="item-sub">
            ${isCurrent ? "いま選ばれています" : "候補です"}
          </div>
          ${renderTaskSupportSummary(task)}
        </div>
      </div>
      <div class="item-bottom">
        <div class="item-actions">
          ${isCurrent ? "" : `<button class="btn-primary small" data-action="current">これをやる</button>`}
          <button class="btn-soft small" data-action="parking">いったん置く</button>
          <button class="btn-danger small" data-action="delete">削除</button>
        </div>
        <div class="item-updated">更新 ${formatUpdatedAt(task.updatedAt || task.createdAt)}</div>
      </div>
    `;

    const currentButton = item.querySelector('[data-action="current"]');
    if (currentButton) {
      currentButton.addEventListener("click", () => {
        setCurrentTask(task.id);
        focusCurrentTaskBox();
      });
    }

    item.querySelector('[data-action="parking"]').addEventListener("click", () => {
      moveTaskToParking(task.id);
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteTask(task.id);
    });

    taskList.appendChild(item);
  });
}

function renderCompletedTasks() {
  completedTaskList.style.display = state.showCompleted ? "flex" : "none";
  completedToggleBtn.setAttribute("aria-expanded", String(state.showCompleted));

  completedToggleBtn.innerHTML = `
    <span class="accordion-label">できたこと</span>
    <span class="accordion-meta">
      <span class="completed-count">最近の${COMPLETED_LIMIT}件</span>
      <span class="accordion-arrow" aria-hidden="true">${state.showCompleted ? "▲" : "▼"}</span>
    </span>
  `;

  completedTaskList.innerHTML = "";

  if (!state.showCompleted) {
    return;
  }

  if (state.completedTasks.length === 0) {
    completedTaskList.innerHTML = `<div class="empty">まだできたことはありません。</div>`;
    return;
  }

  const latestCompleted = state.completedTasks.slice(0, COMPLETED_LIMIT);

  latestCompleted.forEach(task => {
    const item = document.createElement("div");
    item.className = "item";

    item.innerHTML = `
      <div class="item-top">
        <div style="flex:1;">
          <div class="item-text completed-text">
            <span class="completed-clover" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span>${escapeHtml(task.text)}</span>
          </div>
        </div>
        <span class="pill completed-pill">できた</span>
      </div>
      <div class="item-bottom">
        <div class="item-actions">
          <button class="btn-soft small" data-action="restore">戻す</button>
          <button class="btn-danger small" data-action="delete">削除</button>
        </div>
        <div class="item-updated">完了 ${formatUpdatedAt(task.completedAt)}</div>
      </div>
    `;

    item.querySelector('[data-action="restore"]').addEventListener("click", () => {
      restoreTask(task.id);
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteCompletedTask(task.id);
    });

    completedTaskList.appendChild(item);
  });
}

function saveSupportFields({ silent = false } = {}) {
  const currentTask = ensureCurrentTask();
  if (!currentTask) return;

  currentTask.nextStep = getNextStepDraft();
  currentTask.updatedAt = new Date().toISOString();

  saveState();

  if (!silent) {
    renderAll();
  }
}

function queueSupportAutosave() {
  const currentTask = getCurrentTask();
  if (!currentTask) return;

  const taskId = currentTask.id;
  const nextStep = getNextStepDraft();

  nextStepSaveNote.textContent = "保存中...";

  if (supportSaveTimer) {
    clearTimeout(supportSaveTimer);
  }

  supportSaveTimer = setTimeout(() => {
    const task = state.tasks.find(item => item.id === taskId);
    if (!task) return;

    task.nextStep = nextStep;
    task.updatedAt = new Date().toISOString();

    saveState();
    nextStepSaveNote.textContent = "保存しました";
    nextStepText.textContent = nextStep || EMPTY_NEXT_STEP_TEXT;
    nextStepText.classList.toggle("is-empty", !nextStep);
    completeNextStepBtn.hidden = !nextStep;
    editNextStepBtn.textContent = nextStep ? "変える" : "次の一歩を書く";
    editNextStepBtn.classList.toggle("btn-primary", !nextStep);
    editNextStepBtn.classList.toggle("btn-soft", Boolean(nextStep));
    renderTasks();
  }, 350);
}

function getNextStepDraft() {
  return nextStepInput.value.trim();
}

function saveNextStepNow() {
  const currentTask = getCurrentTask();
  if (!currentTask) return;

  currentTask.nextStep = getNextStepDraft();
  currentTask.updatedAt = new Date().toISOString();
  saveState();
  renderTasks();
}

function renderInterruptionSummary(task) {
  if (!task.interruptedAt && !task.interruptionNote) {
    interruptionSummary.innerHTML = `<div class="empty">まだこのタスクに再開メモはありません。</div>`;
    return;
  }

  const note = task.interruptionNote ? escapeHtml(task.interruptionNote) : "メモなし";
  const date = task.interruptedAt ? formatUpdatedAt(task.interruptedAt) : "日時なし";

  interruptionSummary.innerHTML = `
    <div class="interruption-note">
      <div class="interruption-note-head">
        <span class="interruption-note-title">いまやることの再開メモ</span>
      </div>
      <div class="interruption-note-text">${note}</div>
      <div class="interruption-note-meta item-updated">更新 ${date}</div>
    </div>
  `;
}

function openInterruptionModal() {
  const currentTask = ensureCurrentTask();
  if (!currentTask) return;

  saveSupportFields({ silent: true });
  interruptionInput.value = currentTask.interruptionNote ?? "";

  if (typeof interruptionModal.showModal === "function") {
    interruptionModal.showModal();
  } else {
    interruptionModal.setAttribute("open", "");
  }

  requestAnimationFrame(() => {
    interruptionInput.focus();
  });
}

function closeInterruptionModal() {
  if (typeof interruptionModal.close === "function") {
    interruptionModal.close();
  } else {
    interruptionModal.removeAttribute("open");
  }
}

function completeInterruption({ clearNote = false } = {}) {
  const currentTask = ensureCurrentTask();
  if (!currentTask) return;

  const now = new Date().toISOString();
  saveSupportFields({ silent: true });

  currentTask.interruptionNote = clearNote ? "" : interruptionInput.value.trim();
  currentTask.interruptedAt = now;
  currentTask.updatedAt = now;

  saveState();
  closeInterruptionModal();
  renderAll();
}

function addParkingMemo() {
  const text = parkingInput.value.trim();

  if (!text) {
    alert("置いておく内容が空です。");
    return;
  }

  const now = new Date().toISOString();

  state.parking.unshift({
    id: createId(),
    text,
    createdAt: now,
    updatedAt: now,
    nextStep: "",
    stepCount: 0,
    interruptionNote: "",
    interruptedAt: null,
    progressLogs: [],
    parkedAt: now
  });
  state.showParking = true;

  parkingInput.value = "";
  saveState();
  renderParking();
}

function isImeComposing(event) {
  return event.isComposing || event.keyCode === 229;
}

function shouldSubmitTaskInput(event) {
  return event.key === "Enter" && !isTaskInputComposing && !isImeComposing(event);
}

function shouldSubmitTextarea(event) {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !isImeComposing(event)
  );
}

function deleteParkingMemo(id) {
  state.parking = state.parking.filter(item => item.id !== id);
  saveState();
  renderParking();
}

function returnParkingToTasks(id) {
  const memo = state.parking.find(item => item.id === id);
  if (!memo) return;

  if (state.tasks.length >= 3) {
    alert("今日の候補はすでに3つあります。先にどれか整理してください。");
    return;
  }

  const now = new Date().toISOString();
  const restoredTask = normalizeTask(memo);

  state.tasks.push({
    ...restoredTask,
    updatedAt: now,
  });

  state.parking = state.parking.filter(item => item.id !== id);

  if (!state.currentTaskId) {
    state.currentTaskId = state.tasks[0].id;
  }

  saveState();
  renderAll();
}

function renderParking() {
  parkingList.hidden = !state.showParking;
  parkingToggleBtn.setAttribute("aria-expanded", String(state.showParking));
  parkingToggleBtn.innerHTML = `
    <span class="accordion-label">置いたもの</span>
    <span class="accordion-meta">
      <span class="parking-count">${state.parking.length}件</span>
      <span class="accordion-arrow" aria-hidden="true">${state.showParking ? "▲" : "▼"}</span>
    </span>
  `;

  parkingList.innerHTML = "";

  if (!state.showParking) {
    return;
  }

  if (state.parking.length === 0) {
    parkingList.innerHTML = `<div class="empty">今のところ、置いたものはありません。</div>`;
    return;
  }

  state.parking.forEach(item => {
    const el = document.createElement("div");
    el.className = "item";

    el.innerHTML = `
      <div class="item-top">
        <div style="flex:1;">
          <div class="item-text">${escapeHtml(item.text)}</div>
        </div>
      </div>
      <div class="item-bottom">
        <div class="item-actions">
          <button class="btn-soft small" data-action="return">候補に戻す</button>
          <button class="btn-danger small" data-action="delete">削除</button>
        </div>
        <div class="item-updated">作成 ${formatUpdatedAt(item.parkedAt || item.createdAt)}</div>
      </div>
    `;

    el.querySelector('[data-action="return"]').addEventListener("click", () => {
      returnParkingToTasks(item.id);
    });

    el.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteParkingMemo(item.id);
    });

    parkingList.appendChild(el);
  });
}

function renderAll() {
  renderCurrentTask();
  renderSupportPanel();
  renderTasks();
  renderCompletedTasks();
  renderParking();
}

tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
  });
  button.addEventListener("keydown", handleTabKeydown);
});

brandHomeBtn.addEventListener("click", () => {
  setActiveTab("use");
});

addTaskBtn.addEventListener("click", addTask);
addParkingBtn.addEventListener("click", addParkingMemo);
completedToggleBtn.addEventListener("click", toggleCompletedSection);
parkingToggleBtn.addEventListener("click", toggleParkingSection);
completeCurrentTaskBtn.addEventListener("click", completeCurrentTask);
completeNextStepBtn.addEventListener("click", completeNextStep);
currentTaskText.addEventListener("click", () => {
  if (getCurrentTask()) return;
  focusTaskInput();
});
currentTaskText.addEventListener("keydown", (event) => {
  if (getCurrentTask()) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    focusTaskInput();
  }
});
nextStepView.addEventListener("click", openNextStepEditor);
nextStepView.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openNextStepEditor();
  }
});
editNextStepBtn.addEventListener("click", openNextStepEditor);
closeNextStepEditorBtn.addEventListener("click", closeNextStepEditor);
saveProgressBtn.addEventListener("click", openInterruptionModal);
cancelInterruptionBtn.addEventListener("click", closeInterruptionModal);
skipInterruptionBtn.addEventListener("click", () => {
  completeInterruption({ clearNote: true });
});
completeInterruptionBtn.addEventListener("click", () => {
  completeInterruption();
});

taskInput.addEventListener("compositionstart", () => {
  isTaskInputComposing = true;
});

taskInput.addEventListener("compositionend", () => {
  setTimeout(() => {
    isTaskInputComposing = false;
  }, 0);
});

taskInput.addEventListener("keydown", (event) => {
  if (!shouldSubmitTaskInput(event)) return;

  event.preventDefault();
  addTask();
});

nextStepInput.addEventListener("keydown", (event) => {
  if (!shouldSubmitTextarea(event)) return;

  event.preventDefault();
  closeNextStepEditor();
});

parkingInput.addEventListener("keydown", (event) => {
  if (!shouldSubmitTextarea(event)) return;

  event.preventDefault();
  addParkingMemo();
});

interruptionModal.addEventListener("click", (event) => {
  if (event.target === interruptionModal) {
    closeInterruptionModal();
  }
});

nextStepInput.addEventListener("input", queueSupportAutosave);

setActiveTab("use");
loadState();
renderAll();
