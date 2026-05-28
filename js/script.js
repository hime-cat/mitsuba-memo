const STORAGE_KEY = "adhd_support_app_v3";
const COMPLETED_LIMIT = 5;
const PARKING_LIMIT = 40;
const EMPTY_CURRENT_TASK_TEXT = "まずは今日の候補を1つ入れてみましょう";
const SELECT_CURRENT_TASK_TEXT = "候補から「これを進める」を選びましょう";
const DEFAULT_NEXT_STEP_COUNT_TEXT = "一歩ずつ進めましょう";
const SUPABASE_URL = "https://wbfsycdkhcngchlqovis.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Oa61IniZw8mp-NTlJkerug_HTlGTboo";

const state = {
  tasks: [],
  completedTasks: [],
  currentTaskId: null,
  parking: [],
  deletedItems: [],
  showParking: false
};

const tabButtons = document.querySelectorAll("[data-tab]");
const brandHomeBtn = document.getElementById("brandHomeBtn");
const usePanel = document.getElementById("usePanel");
const aboutPanel = document.getElementById("aboutPanel");
const inputModePanel = document.getElementById("inputModePanel");
const focusModePanel = document.getElementById("focusModePanel");

const taskInput = document.getElementById("taskInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const addTaskRow = document.querySelector(".add-task-row");
const candidateFullMessage = document.getElementById("candidateFullMessage");
const taskList = document.getElementById("taskList");
const taskCountPill = document.getElementById("taskCountPill");
const taskCount = document.getElementById("taskCount");
const currentBox = document.getElementById("currentBox");
const currentTaskText = document.getElementById("currentTaskText");
const completeCurrentTaskBtn = document.getElementById("completeCurrentTaskBtn");
const reselectTaskBtn = document.getElementById("reselectTaskBtn");

const nextStepSection = document.getElementById("nextStepSection");
const stepSectionTitle = document.getElementById("stepSectionTitle");
const stepSectionDesc = document.getElementById("stepSectionDesc");
const nextStepCount = document.getElementById("nextStepCount");
const continueBox = document.getElementById("continueBox");
const stepList = document.getElementById("stepList");
const stepEmpty = document.getElementById("stepEmpty");
const addStepToggleBtn = document.getElementById("addStepToggleBtn");
const stepHelperPanel = document.getElementById("stepHelperPanel");
const aiHelperToggleBtn = document.getElementById("aiHelperToggleBtn");
const aiHelperPanel = document.getElementById("aiHelperPanel");
const stepPromptPreview = document.getElementById("stepPromptPreview");
const bulkStepInput = document.getElementById("bulkStepInput");
const bulkStepNote = document.getElementById("bulkStepNote");
const copyStepPromptBtn = document.getElementById("copyStepPromptBtn");
const importStepsBtn = document.getElementById("importStepsBtn");

const parkingToggleBtn = document.getElementById("parkingToggleBtn");
const parkingList = document.getElementById("parkingList");
const syncStatus = document.getElementById("syncStatus");
const syncCardTitle = document.getElementById("syncCardTitle");
const syncCardDesc = document.getElementById("syncCardDesc");
const syncEmailForm = document.getElementById("syncEmailForm");
const syncEmailInput = document.getElementById("syncEmailInput");
const syncCodeForm = document.getElementById("syncCodeForm");
const syncCodeInput = document.getElementById("syncCodeInput");
const sendSyncCodeBtn = document.getElementById("sendSyncCodeBtn");
const verifySyncCodeBtn = document.getElementById("verifySyncCodeBtn");

let hasShownSaveError = false;
let isTaskInputComposing = false;
let isBulkStepInputComposing = false;
let isAiHelperOpen = false;
let aiHelperTaskId = null;
let isAddStepOpen = false;
let addStepTaskId = null;
let selectedCandidateTaskId = null;
let selectedParkingItemId = null;
let supabaseClient = null;
let isCloudSyncReady = false;
let isCloudSyncInProgress = false;
let cloudSyncTimerId = null;

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveState({ skipCloudSync = false } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (!skipCloudSync) {
      scheduleAutoCloudSync();
    }

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
  const nextStep = typeof source.nextStep === "string" ? source.nextStep : "";
  const sourceSteps = Array.isArray(source.steps) ? source.steps.map(normalizeStep).filter(step => step.text) : [];
  const steps = sourceSteps.length > 0
    ? sourceSteps
    : nextStep.trim()
      ? [{
          id: createId(),
          text: nextStep.trim(),
          done: false,
          createdAt: source.updatedAt || source.createdAt || now,
          updatedAt: source.updatedAt || source.createdAt || now
        }]
      : [];

  return {
    id: source.id || createId(),
    text: String(source.text || ""),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || source.createdAt || now,
    nextStep,
    stepCount: Number.isFinite(stepCount) && stepCount > 0 ? Math.floor(stepCount) : 0,
    steps,
    interruptionNote: typeof source.interruptionNote === "string" ? source.interruptionNote : "",
    interruptedAt: typeof source.interruptedAt === "string" ? source.interruptedAt : null,
    progressLogs: Array.isArray(source.progressLogs) ? source.progressLogs : []
  };
}

function normalizeStep(step) {
  const source = step || {};
  const now = new Date().toISOString();

  return {
    id: source.id || createId(),
    text: String(source.text || ""),
    done: Boolean(source.done),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || source.createdAt || now
  };
}

function createStep(text, { done = false, createdAt = null, updatedAt = null } = {}) {
  const now = new Date().toISOString();

  return {
    id: createId(),
    text,
    done,
    createdAt: createdAt || now,
    updatedAt: updatedAt || createdAt || now
  };
}

function cleanStepLine(line) {
  return String(line || "")
    .trim()
    .replace(/^```[\w-]*\s*$/, "")
    .replace(/^[-*・]\s*/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .replace(/^[-*]\s*\[[ xX]\]\s*/, "")
    .replace(/^[□☐✓✔]\s*/, "")
    .trim();
}

function parseStepLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(cleanStepLine)
    .filter(Boolean);
}

function buildStepPrompt(taskText) {
  return `次のタスクについて、「今すぐ始められる最初の一歩候補」を3つだけ出してください。

目的は、完了までの計画やTODOリストを作ることではありません。
ユーザーが「どれなら今できそう？」と思える候補を出すことです。

タスク:
${taskText}

出力形式:
- 次の一歩候補を3つだけ
- 各候補を別々のコードブロックで出力
- 1つのコードブロックには1候補だけ入れる
- コードブロックの外に説明を書かない
- 番号、箇条書き記号、前置き、説明文、励まし文は不要

お願い:
- 5分以内に始められる
- すぐ身体を動かせる
- 「考える」より「見る」「開く」「1個だけ動かす」を優先
- 抽象語を避け、物理動作で書く
- 「準備する」「整理する」「確認する」だけで終わらせず、何を開く/見る/置くかまで書く
- 1候補は30文字前後まで
- 各候補は独立させ、順番依存にしない
- 認知負荷を増やさない
- 3案は互いに重複させない
- 長期計画や網羅的な手順にしない
- 未来のTODOを増やしすぎない
- 完璧な分解ではなく、今動くための補助輪にする
- 判断が必要なら、「判断材料を1つ集める」に分解

追加でユーザーが短く返した場合:
- 「小さく」: 前の案よりさらに小さく、5分以内に動ける別案を3つ出す
- 「大きく」: 前の案より少しだけ進める別案を3つ出す
- 「別」または「他」: 同じくらいの大きさで、重複しない別案を3つ出す`;
}

function buildMoreStepPrompt(task) {
  const completedSteps = (Array.isArray(task.steps) ? task.steps : [])
    .map(normalizeStep)
    .filter(step => step.done)
    .map(step => `- ${step.text}`)
    .join("\n") || "- まだありません";

  return `次のタスクを進めています。
ここまでの進捗をもとに、「今すぐ始められる次の一歩候補」を3つだけ出してください。

目的は、完了までの計画やTODOリストを作ることではありません。
ユーザーが「どれなら今できそう？」と思える候補を出すことです。

タスク:
${task.text}

ここまでできたこと:
${completedSteps}

出力形式:
- 次の一歩候補を3つだけ
- 各候補を別々のコードブロックで出力
- 1つのコードブロックには1候補だけ入れる
- コードブロックの外に説明を書かない
- 番号、箇条書き記号、前置き、説明文、励まし文は不要

お願い:
- 5分以内に始められる
- すぐ身体を動かせる
- 「考える」より「見る」「開く」「1個だけ動かす」を優先
- 抽象語を避け、物理動作で書く
- 「準備する」「整理する」「確認する」だけで終わらせず、何を開く/見る/置くかまで書く
- 1候補は30文字前後まで
- 各候補は独立させ、順番依存にしない
- 認知負荷を増やさない
- 3案は互いに重複させない
- 長期計画や網羅的な手順にしない
- 未来のTODOを増やしすぎない
- 完璧な分解ではなく、今動くための補助輪にする
- 判断が必要なら、「判断材料を1つ集める」に分解

追加でユーザーが短く返した場合:
- 「小さく」: 前の案よりさらに小さく、5分以内に動ける別案を3つ出す
- 「大きく」: 前の案より少しだけ進める別案を3つ出す
- 「別」または「他」: 同じくらいの大きさで、重複しない別案を3つ出す`;
}

function formatStepListForPrompt(steps, fallbackText) {
  const lines = (Array.isArray(steps) ? steps : [])
    .map(normalizeStep)
    .filter(step => step.text)
    .map(step => `- ${step.text}`);

  return lines.join("\n") || fallbackText;
}

function buildAddStepPrompt(task) {
  const steps = Array.isArray(task.steps) ? task.steps.map(normalizeStep) : [];
  const completedSteps = formatStepListForPrompt(
    steps.filter(step => step.done),
    "- まだありません"
  );
  const openSteps = formatStepListForPrompt(
    steps.filter(step => !step.done),
    "- まだありません"
  );

  return `次のタスクを進めています。
今ある小さな一歩と進捗を見て、「今すぐ始められる次の一歩候補」を3つだけ出してください。

目的は、完了までの計画やTODOリストを作ることではありません。
ユーザーが「どれなら今できそう？」と思える候補を出すことです。

タスク:
${task.text}

完了した小さな一歩:
${completedSteps}

未完了の小さな一歩:
${openSteps}

出力形式:
- 次の一歩候補を3つだけ
- 各候補を別々のコードブロックで出力
- 1つのコードブロックには1候補だけ入れる
- コードブロックの外に説明を書かない
- 番号、箇条書き記号、前置き、説明文、励まし文は不要

お願い:
- 5分以内に始められる
- すぐ身体を動かせる
- 「考える」より「見る」「開く」「1個だけ動かす」を優先
- 抽象語を避け、物理動作で書く
- 「準備する」「整理する」「確認する」だけで終わらせず、何を開く/見る/置くかまで書く
- 1候補は30文字前後まで
- 各候補は独立させ、順番依存にしない
- 認知負荷を増やさない
- すでにある小さな一歩と重複させない
- 3案は互いに重複させない
- 長期計画や網羅的な手順にしない
- 未来のTODOを増やしすぎない
- 完璧な分解ではなく、今動くための補助輪にする
- 判断が必要なら、「判断材料を1つ集める」に分解

追加でユーザーが短く返した場合:
- 「小さく」: 前の案よりさらに小さく、5分以内に動ける別案を3つ出す
- 「大きく」: 前の案より少しだけ進める別案を3つ出す
- 「別」または「他」: 同じくらいの大きさで、重複しない別案を3つ出す`;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn("Clipboard API copy failed. Falling back to textarea copy.", error);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("copy failed");
  }
}

function getNextOpenStep(task) {
  if (!task || !Array.isArray(task.steps)) return null;
  return task.steps.find(step => !step.done) ?? null;
}

function syncCurrentStepText(task) {
  if (!task) return;
  task.steps = Array.isArray(task.steps) ? task.steps.map(normalizeStep).filter(step => step.text) : [];
  task.nextStep = getNextOpenStep(task)?.text ?? "";
}

function normalizeParkingItem(item) {
  const source = item || {};
  const normalized = normalizeTask(item);

  return {
    ...normalized,
    parkedAt: typeof source.parkedAt === "string" ? source.parkedAt : normalized.createdAt
  };
}

function normalizeDeletedItem(item) {
  const source = item || {};
  const now = new Date().toISOString();
  const id = typeof source.id === "string" ? source.id : "";

  return {
    id,
    deletedAt: normalizeCloudDate(source.deletedAt, now)
  };
}

function rememberDeletedItem(id, deletedAt = new Date().toISOString()) {
  if (!id) return;

  state.deletedItems = Array.isArray(state.deletedItems) ? state.deletedItems.filter(item => item.id !== id) : [];
  state.deletedItems.unshift({
    id,
    deletedAt: normalizeCloudDate(deletedAt)
  });
  state.deletedItems = state.deletedItems.slice(0, 120);
}

function trimParkingToLimit() {
  if (state.parking.length <= PARKING_LIMIT) return;

  const sortedParking = [...state.parking].sort(compareItemsByUpdatedAtDesc);
  const keepIds = new Set(sortedParking.slice(0, PARKING_LIMIT).map(item => item.id));
  const overflow = state.parking.filter(item => !keepIds.has(item.id));

  overflow.forEach(item => {
    rememberDeletedItem(item.id, new Date().toISOString());
  });

  state.parking = sortedParking.slice(0, PARKING_LIMIT);
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
    state.deletedItems = Array.isArray(source.deletedItems)
      ? source.deletedItems.map(normalizeDeletedItem).filter(item => item.id).slice(0, 120)
      : [];
    trimParkingToLimit();
    state.showParking = Boolean(source.showParking);

    if (state.currentTaskId && !state.tasks.some(task => task.id === state.currentTaskId)) {
      state.currentTaskId = null;
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

function formatItemTimestamp(item) {
  const createdAt = item?.createdAt || "";
  const updatedAt = item?.updatedAt || createdAt;
  const label = updatedAt && updatedAt !== createdAt ? "更新" : "作成";
  const text = formatUpdatedAt(updatedAt || createdAt);

  return text ? `${label} ${text}` : label;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(str) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(str);
  }

  return String(str).replace(/["\\]/g, "\\$&");
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

function getSelectedCandidateTask() {
  return state.tasks.find(task => task.id === selectedCandidateTaskId) ?? null;
}

function getSelectedParkingItem() {
  return state.parking.find(item => item.id === selectedParkingItemId) ?? null;
}

function ensureSelectedCandidate() {
  if (state.tasks.length === 0) {
    selectedCandidateTaskId = null;
    return null;
  }

  const selectedTask = getSelectedCandidateTask();
  if (selectedTask) return selectedTask;

  selectedCandidateTaskId = state.tasks[0].id;
  return state.tasks[0];
}

function ensureSelectedParkingItem() {
  if (state.parking.length === 0) {
    selectedParkingItemId = null;
    return null;
  }

  const selectedItem = getSelectedParkingItem();
  if (selectedItem) return selectedItem;

  selectedParkingItemId = state.parking[0].id;
  return state.parking[0];
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
  const emptyText = state.tasks.length > 0 ? SELECT_CURRENT_TASK_TEXT : EMPTY_CURRENT_TASK_TEXT;

  currentTaskText.innerHTML = currentTask
    ? `<span>${escapeHtml(currentTask.text)}</span>`
    : emptyText;
  currentTaskText.classList.toggle("is-empty", !currentTask);
  currentTaskText.setAttribute("role", currentTask ? "text" : "button");
  currentTaskText.tabIndex = currentTask ? -1 : 0;
  currentTaskText.setAttribute(
    "aria-label",
    currentTask
      ? currentTask.text
      : state.tasks.length > 0
        ? "候補からこれを進めるを選ぶ"
        : "今日の候補を入力する"
  );
  completeCurrentTaskBtn.hidden = !currentTask;
  reselectTaskBtn.hidden = !currentTask;
}

function renderMode() {
  const isFocusMode = Boolean(getCurrentTask());

  inputModePanel.classList.toggle("is-active", !isFocusMode);
  focusModePanel.classList.toggle("is-active", isFocusMode);
}

function renderSupportPanel() {
  const currentTask = getCurrentTask();

  nextStepSection.hidden = !currentTask;

  bulkStepInput.disabled = !currentTask;
  copyStepPromptBtn.disabled = !currentTask;
  importStepsBtn.disabled = !currentTask;

  renderNextStep(currentTask);
}

function renderNextStep(task) {
  if (task) {
    syncCurrentStepText(task);
  }

  const nextOpenStep = getNextOpenStep(task);
  const steps = Array.isArray(task?.steps) ? task.steps : [];
  const doneCount = steps.filter(step => step.done).length;
  const hasSteps = steps.length > 0;
  const isAllDone = hasSteps && !nextOpenStep;

  if (!task || aiHelperTaskId !== task.id) {
    aiHelperTaskId = task?.id ?? null;
    isAiHelperOpen = false;
  }

  if (!task || addStepTaskId !== task.id) {
    addStepTaskId = task?.id ?? null;
    isAddStepOpen = false;
  }

  const canAddStep = Boolean(task) && hasSteps && !isAllDone;

  stepSectionTitle.textContent = hasSteps ? "一歩ずつ進める" : "最初の一歩を決める";
  stepSectionDesc.textContent = hasSteps
    ? "小さく分けたものを、上からひとつずつ進めましょう。"
    : "\"最初の一歩\"を決めると、\"いまやること\"を始めやすくなります。";
  nextStepCount.textContent = hasSteps ? `${doneCount}/${steps.length}歩できました` : DEFAULT_NEXT_STEP_COUNT_TEXT;
  nextStepCount.hidden = !task;
  nextStepCount.classList.toggle("is-done", doneCount > 0);
  stepEmpty.hidden = true;
  continueBox.hidden = !isAllDone;
  addStepToggleBtn.hidden = !canAddStep;
  addStepToggleBtn.setAttribute("aria-expanded", String(canAddStep && isAddStepOpen));
  addStepToggleBtn.innerHTML = `
    <span class="accordion-label">🌱 小さな一歩を足す</span>
    <span class="add-step-toggle-action">
      <span>${isAddStepOpen ? "閉じる" : "見る"}</span>
      <span class="accordion-arrow" aria-hidden="true">${isAddStepOpen ? "▲" : "▼"}</span>
    </span>
  `;
  stepHelperPanel.hidden = canAddStep ? !isAddStepOpen : hasSteps && !isAllDone;
  importStepsBtn.textContent = hasSteps ? "一歩を追加" : "これから始める";
  bulkStepInput.placeholder = hasSteps
    ? "例：メールを1通だけ開く"
    : "例：カーテンを開ける / メールを開く\n迷ったときは、AIに考えてもらうことができます。";
  bulkStepInput.classList.toggle("is-first-step-input", !hasSteps);
  aiHelperToggleBtn.setAttribute("aria-expanded", String(isAiHelperOpen));
  aiHelperToggleBtn.innerHTML = `
    <span class="accordion-label">🧩 AIに一歩を考えてもらう</span>
    <span class="ai-helper-toggle-action">
      <span>${isAiHelperOpen ? "閉じる" : "見る"}</span>
      <span class="accordion-arrow" aria-hidden="true">${isAiHelperOpen ? "▲" : "▼"}</span>
    </span>
  `;
  aiHelperPanel.hidden = !isAiHelperOpen;
  stepPromptPreview.value = task
    ? isAllDone
      ? buildMoreStepPrompt(task)
      : hasSteps
        ? buildAddStepPrompt(task)
        : buildStepPrompt(task.text)
    : "";
  renderStepList(task, nextOpenStep?.id);
}

function renderStepList(task, currentStepId) {
  stepList.innerHTML = "";

  if (!task || !Array.isArray(task.steps) || task.steps.length === 0) return;

  task.steps.forEach(step => {
    const isCurrentStep = step.id === currentStepId;
    const item = document.createElement("div");
    item.className = [
      "step-item",
      step.done ? "is-done" : "is-editable",
      isCurrentStep ? "is-current-step" : ""
    ].filter(Boolean).join(" ");

    item.innerHTML = `
      <span class="step-marker" aria-hidden="true">${step.done ? "✓" : ""}</span>
      <div class="step-content">
        ${step.done
          ? `<span class="step-text">${escapeHtml(step.text)}</span>`
          : `<textarea class="step-edit-input" rows="1" data-step-id="${escapeHtml(step.id)}" data-original-text="${escapeHtml(step.text)}" aria-label="小さな一歩を編集">${escapeHtml(step.text)}</textarea>`}
      </div>
      ${isCurrentStep ? `<button class="btn-done small step-done-btn" data-step-action="done" data-step-id="${escapeHtml(step.id)}" type="button">できた</button>` : ""}
    `;

    stepList.appendChild(item);
  });

  resizeStepInputs();
}

function resizeStepInput(input) {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

function resizeStepInputs() {
  stepList.querySelectorAll(".step-edit-input").forEach(resizeStepInput);
}

function updateStepText(stepId, text) {
  const currentTask = getCurrentTask();
  const step = currentTask?.steps?.find(item => item.id === stepId);

  if (!step || step.done) return;

  step.text = text;
  step.updatedAt = new Date().toISOString();
  currentTask.nextStep = getNextOpenStep(currentTask)?.text ?? "";
  currentTask.updatedAt = step.updatedAt;

  saveState();
}

function completeStep(stepId) {
  const currentTask = ensureCurrentTask();
  if (!currentTask) return;

  currentTask.steps = Array.isArray(currentTask.steps) ? currentTask.steps.map(normalizeStep) : [];
  const openStep = getNextOpenStep(currentTask);
  const step = stepId
    ? currentTask.steps.find(item => item.id === stepId && !item.done)
    : openStep;

  if (!step || step.id !== openStep?.id) return;

  const button = stepList.querySelector(`[data-step-action="done"][data-step-id="${cssEscape(step.id)}"]`);
  celebrateWithLeaves(button, 6);

  currentTask.stepCount = (Number(currentTask.stepCount) || 0) + 1;
  const now = new Date().toISOString();
  step.done = true;
  step.updatedAt = now;
  syncCurrentStepText(currentTask);
  currentTask.updatedAt = now;

  saveState();
  renderAll();
}

function setCurrentTask(taskId) {
  state.currentTaskId = taskId;
  isAiHelperOpen = false;
  aiHelperTaskId = taskId;
  isAddStepOpen = false;
  addStepTaskId = taskId;
  saveState();
  renderAll();
}

function returnToTaskSelection() {
  setActiveTab("use");

  if (!state.currentTaskId) {
    renderAll();
    return;
  }

  state.currentTaskId = null;
  isAiHelperOpen = false;
  aiHelperTaskId = null;
  isAddStepOpen = false;
  addStepTaskId = null;

  saveState();
  renderAll();
}

function toggleAddStep() {
  isAddStepOpen = !isAddStepOpen;

  renderSupportPanel();
}

function toggleAiHelper() {
  isAiHelperOpen = !isAiHelperOpen;

  renderSupportPanel();
}

function importBulkSteps() {
  const currentTask = ensureCurrentTask();
  if (!currentTask) return;

  const lines = parseStepLines(bulkStepInput.value);

  if (lines.length === 0) {
    bulkStepNote.textContent = "取り込む一歩を書いてください";
    return;
  }

  currentTask.steps = Array.isArray(currentTask.steps) ? currentTask.steps.map(normalizeStep) : [];
  const hadSteps = currentTask.steps.length > 0;
  lines.forEach(line => {
    currentTask.steps.push(createStep(line));
  });

  syncCurrentStepText(currentTask);

  currentTask.updatedAt = new Date().toISOString();
  bulkStepInput.value = "";
  bulkStepNote.textContent = lines.length === 1
    ? hadSteps ? "一歩を追加しました" : "これから始める一歩を置きました"
    : `${lines.length}件に分けました`;
  isAiHelperOpen = false;
  isAddStepOpen = hadSteps;

  saveState();
  renderAll();
  requestAnimationFrame(() => {
    stepList.scrollTop = stepList.scrollHeight;

    if (isAddStepOpen) {
      bulkStepInput.focus();
    }
  });
}

async function copyStepPrompt() {
  const currentTask = ensureCurrentTask();
  if (!currentTask) return;

  try {
    const prompt = stepPromptPreview.value || buildStepPrompt(currentTask.text);
    await copyText(prompt);
    bulkStepNote.textContent = "AIに見せる文をコピーしました";
  } catch (error) {
    console.error("AIに見せる文のコピーに失敗しました:", error);
    bulkStepNote.textContent = "コピーに失敗しました";
  }
}

function initializeSupabaseClient() {
  if (!window.supabase?.createClient) {
    setSyncStatus("Supabaseの読み込みができませんでした。このブラウザには今まで通り保存されます。", "error");
    return null;
  }

  return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

function setSyncStatus(message, type = "") {
  if (!syncStatus) return;

  syncStatus.textContent = message;
  syncStatus.classList.toggle("is-error", type === "error");
  syncStatus.classList.toggle("is-success", type === "success");
}

function setSyncBusy(isBusy) {
  if (sendSyncCodeBtn) {
    sendSyncCodeBtn.disabled = isBusy;
  }

  if (verifySyncCodeBtn) {
    verifySyncCodeBtn.disabled = isBusy;
  }

}

function updateSyncContent(isConnected) {
  if (syncCardTitle) {
    syncCardTitle.textContent = isConnected ? "みつばメモを見返せる場所が増えました" : "別の端末でも見られるようにする";
  }

  if (syncCardDesc) {
    syncCardDesc.textContent = isConnected
      ? "このブラウザにもクラウドにも、やることが残ります。同じメールアドレスを使えば、別のブラウザや端末でも同じやることを見られます。"
      : "メールアドレスに届くコードで確認すると、このブラウザのデータをクラウドにも残せます。同じメールアドレスを使えば、別のブラウザや端末でも同じやることを見られます。";
  }

  if (syncEmailForm) {
    syncEmailForm.hidden = isConnected;
  }

  if (syncCodeForm && isConnected) {
    syncCodeForm.hidden = true;
  }

}

function normalizeCloudDate(value, fallback = new Date().toISOString()) {
  if (typeof value !== "string") return fallback;

  const time = Date.parse(value);
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

function getItemTime(item, keys = ["updatedAt", "updated_at", "completedAt", "completed_at", "createdAt", "created_at"]) {
  for (const key of keys) {
    const value = item?.[key];
    if (typeof value !== "string") continue;

    const time = Date.parse(value);
    if (!Number.isNaN(time)) return time;
  }

  return 0;
}

function compareItemsByUpdatedAtDesc(a, b) {
  return getItemTime(b) - getItemTime(a);
}

function compareCompletedItemsDesc(a, b) {
  return getItemTime(b, ["completedAt", "completed_at", "updatedAt", "updated_at", "createdAt", "created_at"])
    - getItemTime(a, ["completedAt", "completed_at", "updatedAt", "updated_at", "createdAt", "created_at"]);
}

function convertCloudRowToLocalItem(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map(normalizeStep).filter(step => step.text)
    : [];
  const createdAt = normalizeCloudDate(row?.created_at);
  const updatedAt = normalizeCloudDate(row?.updated_at || row?.created_at, createdAt);

  const item = {
    id: String(row?.id || createId()),
    text: String(row?.text || ""),
    createdAt,
    updatedAt,
    nextStep: "",
    stepCount: steps.filter(step => step.done).length,
    steps,
    interruptionNote: "",
    interruptedAt: null,
    progressLogs: []
  };

  syncCurrentStepText(item);

  if (row?.bucket === "parking") {
    return {
      ...item,
      parkedAt: normalizeCloudDate(row?.parked_at, updatedAt)
    };
  }

  if (row?.bucket === "completed") {
    return {
      ...item,
      completedAt: normalizeCloudDate(row?.completed_at, updatedAt)
    };
  }

  return item;
}

function buildCloudPayload(task) {
  const steps = Array.isArray(task.steps) ? task.steps.map(normalizeStep).filter(step => step.text) : [];

  return {
    steps: steps.map(step => ({
      id: step.id,
      text: step.text,
      done: Boolean(step.done),
      createdAt: normalizeCloudDate(step.createdAt),
      updatedAt: normalizeCloudDate(step.updatedAt || step.createdAt)
    }))
  };
}

function buildCloudItem(task, bucket, userId) {
  const now = new Date().toISOString();
  const normalized = bucket === "parking"
    ? normalizeParkingItem(task)
    : {
        ...normalizeTask(task),
        completedAt: typeof task?.completedAt === "string" ? task.completedAt : null
      };
  const createdAt = normalizeCloudDate(normalized.createdAt, now);
  const updatedAt = normalizeCloudDate(normalized.updatedAt || normalized.createdAt, createdAt);

  return {
    id: normalized.id,
    user_id: userId,
    bucket,
    text: normalized.text,
    payload: buildCloudPayload(normalized),
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: null,
    parked_at: bucket === "parking" ? normalizeCloudDate(normalized.parkedAt, updatedAt) : null,
    completed_at: bucket === "completed" ? normalizeCloudDate(normalized.completedAt, updatedAt) : null
  };
}

function buildCloudItems(userId) {
  const itemsById = new Map();

  state.tasks.forEach(task => {
    const item = buildCloudItem(task, "task", userId);
    if (item.text) itemsById.set(item.id, item);
  });

  state.parking.forEach(task => {
    const item = buildCloudItem(task, "parking", userId);
    if (item.text) itemsById.set(item.id, item);
  });

  state.completedTasks.forEach(task => {
    const item = buildCloudItem(task, "completed", userId);
    if (item.text) itemsById.set(item.id, item);
  });

  return Array.from(itemsById.values());
}

function getLocalItemsForMerge() {
  return [
    ...state.tasks.map(item => ({ bucket: "task", item: normalizeTask(item) })),
    ...state.parking.map(item => ({ bucket: "parking", item: normalizeParkingItem(item) })),
    ...state.completedTasks.map(item => ({
      bucket: "completed",
      item: {
        ...normalizeTask(item),
        completedAt: typeof item?.completedAt === "string" ? item.completedAt : item?.updatedAt
      }
    }))
  ];
}

function getDeletedMap(cloudRows) {
  const deletedMap = new Map();

  if (Array.isArray(state.deletedItems)) {
    state.deletedItems.forEach(item => {
      if (!item.id) return;
      deletedMap.set(item.id, normalizeCloudDate(item.deletedAt));
    });
  }

  cloudRows.forEach(row => {
    if (!row?.id || !row.deleted_at) return;
    const deletedAt = normalizeCloudDate(row.deleted_at);
    const current = deletedMap.get(row.id);

    if (!current || Date.parse(deletedAt) > Date.parse(current)) {
      deletedMap.set(row.id, deletedAt);
    }
  });

  return deletedMap;
}

function chooseNewerMergeEntry(current, next) {
  if (!current) return next;
  return getItemTime(next.item) >= getItemTime(current.item) ? next : current;
}

function mergeLocalAndCloudData(cloudRows, cloudUserState = null) {
  const now = new Date().toISOString();
  const deletedMap = getDeletedMap(cloudRows);
  const activeById = new Map();

  getLocalItemsForMerge().forEach(entry => {
    if (!entry.item.id || !entry.item.text || deletedMap.has(entry.item.id)) return;
    activeById.set(entry.item.id, chooseNewerMergeEntry(activeById.get(entry.item.id), entry));
  });

  cloudRows.forEach(row => {
    if (!row?.id || row.deleted_at || deletedMap.has(row.id)) return;
    const item = convertCloudRowToLocalItem(row);
    if (!item.text) return;
    activeById.set(item.id, chooseNewerMergeEntry(activeById.get(item.id), {
      bucket: row.bucket,
      item
    }));
  });

  const taskItems = [];
  const parkingItems = [];
  const completedItems = [];

  activeById.forEach(entry => {
    if (entry.bucket === "completed") {
      completedItems.push({
        ...normalizeTask(entry.item),
        completedAt: typeof entry.item.completedAt === "string" ? entry.item.completedAt : entry.item.updatedAt
      });
      return;
    }

    if (entry.bucket === "parking") {
      parkingItems.push(normalizeParkingItem(entry.item));
      return;
    }

    taskItems.push(normalizeTask(entry.item));
  });

  taskItems.sort(compareItemsByUpdatedAtDesc);
  const nextTasks = taskItems.slice(0, 3);
  const overflowTasks = taskItems.slice(3).map(item => ({
    ...item,
    updatedAt: now,
    parkedAt: now
  }));

  const nextParking = [...parkingItems, ...overflowTasks]
    .sort(compareItemsByUpdatedAtDesc)
    .slice(0, PARKING_LIMIT)
    .map(normalizeParkingItem);
  const parkingKeepIds = new Set(nextParking.map(item => item.id));

  [...parkingItems, ...overflowTasks].forEach(item => {
    if (!parkingKeepIds.has(item.id)) {
      deletedMap.set(item.id, now);
    }
  });

  const nextCompleted = completedItems
    .sort(compareCompletedItemsDesc)
    .slice(0, COMPLETED_LIMIT)
    .map(item => ({
      ...normalizeTask(item),
      completedAt: typeof item.completedAt === "string" ? item.completedAt : item.updatedAt
    }));
  const completedKeepIds = new Set(nextCompleted.map(item => item.id));

  completedItems.forEach(item => {
    if (!completedKeepIds.has(item.id)) {
      deletedMap.set(item.id, now);
    }
  });

  const localCurrentTaskId = state.currentTaskId;
  const localCurrentIsValid = localCurrentTaskId && nextTasks.some(task => task.id === localCurrentTaskId);
  const cloudCurrentTaskId = cloudUserState?.current_task_id;
  const cloudCurrentIsValid = cloudCurrentTaskId && nextTasks.some(task => task.id === cloudCurrentTaskId);

  state.tasks = nextTasks;
  state.parking = nextParking;
  state.completedTasks = nextCompleted;
  state.currentTaskId = localCurrentIsValid ? localCurrentTaskId : cloudCurrentIsValid ? cloudCurrentTaskId : null;
  state.deletedItems = Array.from(deletedMap.entries())
    .map(([id, deletedAt]) => ({ id, deletedAt }))
    .sort((a, b) => getItemTime(b, ["deletedAt"]) - getItemTime(a, ["deletedAt"]))
    .slice(0, 120);

  if (selectedCandidateTaskId && !state.tasks.some(task => task.id === selectedCandidateTaskId)) {
    selectedCandidateTaskId = null;
  }

  if (selectedParkingItemId && !state.parking.some(item => item.id === selectedParkingItemId)) {
    selectedParkingItemId = null;
  }
}

async function pushLocalStateToCloud(user, successMessage) {
  const now = new Date().toISOString();
  const items = buildCloudItems(user.id);
  const activeIds = items.map(item => item.id);

  const statePayload = {
    user_id: user.id,
    current_task_id: state.currentTaskId && state.tasks.some(task => task.id === state.currentTaskId)
      ? state.currentTaskId
      : null,
    updated_at: now,
    schema_version: 1
  };

  const { error: stateError } = await supabaseClient
    .from("mitsuba_user_state")
    .upsert(statePayload, { onConflict: "user_id" });

  if (stateError) {
    console.error("ユーザー状態のクラウド保存に失敗しました:", stateError);
    setSyncStatus(`クラウド保存に失敗しました。Supabase: ${stateError.message}`, "error");
    return false;
  }

  if (items.length > 0) {
    const { error: itemsError } = await supabaseClient
      .from("mitsuba_items")
      .upsert(items, { onConflict: "id" });

    if (itemsError) {
      console.error("やることのクラウド保存に失敗しました:", itemsError);
      setSyncStatus(`クラウド保存に失敗しました。Supabase: ${itemsError.message}`, "error");
      return false;
    }
  }

  let staleQuery = supabaseClient
    .from("mitsuba_items")
    .update({ deleted_at: now, updated_at: now })
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (activeIds.length > 0) {
    staleQuery = staleQuery.not("id", "in", `(${activeIds.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`);
  }

  const { error: staleError } = await staleQuery;

  if (staleError) {
    console.error("古いクラウドデータの整理に失敗しました:", staleError);
    setSyncStatus(`保存は途中までできましたが、古いデータの整理に失敗しました。Supabase: ${staleError.message}`, "error");
    return false;
  }

  setSyncStatus(successMessage, "success");
  return true;
}

async function getAuthenticatedSyncUser() {
  if (!supabaseClient) {
    setSyncStatus("Supabaseの準備ができていません。このブラウザには今まで通り保存されます。", "error");
    return null;
  }

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user;

  if (sessionError || !user) {
    console.error("クラウド同期前の認証確認に失敗しました:", sessionError);
    updateSyncContent(false);
    setSyncStatus("確認状態を読み込めませんでした。もう一度メール確認をしてください。", "error");
    return null;
  }

  return user;
}

function scheduleAutoCloudSync() {
  if (!isCloudSyncReady || isCloudSyncInProgress || !supabaseClient) return;

  if (cloudSyncTimerId) {
    clearTimeout(cloudSyncTimerId);
  }

  cloudSyncTimerId = window.setTimeout(autoPushLocalStateToCloud, 1000);
}

async function autoPushLocalStateToCloud() {
  if (!isCloudSyncReady || isCloudSyncInProgress || !supabaseClient) return false;

  cloudSyncTimerId = null;
  isCloudSyncInProgress = true;
  setSyncStatus("クラウドへ保存しています...");

  const user = await getAuthenticatedSyncUser();

  if (!user) {
    isCloudSyncReady = false;
    isCloudSyncInProgress = false;
    return false;
  }

  const ok = await pushLocalStateToCloud(user, "クラウドに保存しました。");
  isCloudSyncInProgress = false;
  isCloudSyncReady = ok;
  return ok;
}

async function syncLocalAndCloud() {
  if (isCloudSyncInProgress) return false;

  if (cloudSyncTimerId) {
    clearTimeout(cloudSyncTimerId);
    cloudSyncTimerId = null;
  }

  isCloudSyncInProgress = true;
  isCloudSyncReady = false;
  setSyncBusy(true);
  setSyncStatus("このブラウザとクラウドのやることを合わせています...");

  const user = await getAuthenticatedSyncUser();

  if (!user) {
    setSyncBusy(false);
    isCloudSyncInProgress = false;
    return false;
  }

  const { data: cloudRows, error: itemsError } = await supabaseClient
    .from("mitsuba_items")
    .select("*")
    .eq("user_id", user.id);

  if (itemsError) {
    console.error("クラウドデータの読み込みに失敗しました:", itemsError);
    setSyncBusy(false);
    isCloudSyncInProgress = false;
    setSyncStatus(`クラウドデータを読み込めませんでした。Supabase: ${itemsError.message}`, "error");
    return false;
  }

  const { data: cloudUserState, error: userStateError } = await supabaseClient
    .from("mitsuba_user_state")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (userStateError) {
    console.error("クラウドの選択状態読み込みに失敗しました:", userStateError);
    setSyncBusy(false);
    isCloudSyncInProgress = false;
    setSyncStatus(`クラウドデータを読み込めませんでした。Supabase: ${userStateError.message}`, "error");
    return false;
  }

  mergeLocalAndCloudData(Array.isArray(cloudRows) ? cloudRows : [], cloudUserState);
  saveState({ skipCloudSync: true });
  renderAll();

  const ok = await pushLocalStateToCloud(user, "ほかの端末でも見られるようにしました。");
  setSyncBusy(false);
  isCloudSyncInProgress = false;
  isCloudSyncReady = ok;
  return ok;
}

function getSyncErrorMessage(error, fallback) {
  const message = error?.message || "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("rate") || lowerMessage.includes("security")) {
    return "短い時間に何度か送っています。少し時間を置いてから、もう一度試してください。";
  }

  if (lowerMessage.includes("email")) {
    return `確認コードを送れませんでした。Supabase: ${message}`;
  }

  return message ? `${fallback} Supabase: ${message}` : fallback;
}

async function refreshSyncSession() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    setSyncStatus("確認状態を読み込めませんでした。このブラウザのデータは残っています。", "error");
    return;
  }

  const email = data.session?.user?.email;

  if (email) {
    updateSyncContent(true);
    setSyncStatus(`${email} で確認済みです。クラウドと合わせています...`, "success");
    await syncLocalAndCloud();
  } else {
    updateSyncContent(false);
  }
}

function focusCurrentTaskBox() {
  if (!currentBox) return;

  if (!shouldReduceMotion()) {
    currentBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    currentBox.scrollIntoView({ block: "center" });
  }
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
    alert("今日の候補は3つまでです。今見ないタスクや作業中の思いつきは「後でやること置き場」に置いておけます。");
    return;
  }

  const now = new Date().toISOString();

  const task = {
    id: createId(),
    text,
    createdAt: now,
    updatedAt: now,
    nextStep: "",
    stepCount: 0,
    steps: [],
    interruptionNote: "",
    interruptedAt: null,
    progressLogs: []
  };

  state.tasks.push(task);
  selectedCandidateTaskId = task.id;
  state.currentTaskId = null;
  taskInput.value = "";
  saveState();
  renderAll();
}

function deleteTask(taskId) {
  rememberDeletedItem(taskId);
  state.tasks = state.tasks.filter(task => task.id !== taskId);

  if (state.currentTaskId === taskId) {
    state.currentTaskId = null;
  }

  if (selectedCandidateTaskId === taskId) {
    selectedCandidateTaskId = null;
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
    state.currentTaskId = null;
  }

  if (selectedCandidateTaskId === taskId) {
    selectedCandidateTaskId = null;
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

function moveTaskToParking(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const now = new Date().toISOString();
  const parkedTask = normalizeTask(task);

  state.parking.unshift({
    ...parkedTask,
    updatedAt: now,
    parkedAt: now
  });

  state.tasks = state.tasks.filter(t => t.id !== taskId);

  if (state.currentTaskId === taskId) {
    state.currentTaskId = null;
  }

  if (selectedCandidateTaskId === taskId) {
    selectedCandidateTaskId = null;
  }

  saveState();
  renderAll();
}

function toggleParkingSection() {
  state.showParking = !state.showParking;
  saveState();
  renderParking();
}

function renderTaskSupportSummary(task) {
  const lines = [];

  if (task.nextStep) {
    lines.push(`小さな一歩：${escapeHtml(task.nextStep)}`);
  }

  if (lines.length === 0) return "";

  return `<div class="item-sub">${lines.join("<br>")}</div>`;
}

function renderCandidatePicker(container) {
  container.innerHTML = "";

  if (state.tasks.length === 0) {
    selectedCandidateTaskId = null;
    container.innerHTML = `<div class="empty">まずは、今日見てもいいものを1つ置いてみましょう。</div>`;
    return;
  }

  const selectedTask = ensureSelectedCandidate();
  const list = document.createElement("div");
  list.className = "candidate-choice-list";

  state.tasks.forEach(task => {
    const isSelected = selectedTask?.id === task.id;
    const item = document.createElement("label");
    item.className = isSelected ? "candidate-choice is-selected" : "candidate-choice";

    item.innerHTML = `
      <input class="candidate-choice-input" type="radio" name="candidateTask" value="${escapeHtml(task.id)}" ${isSelected ? "checked" : ""}>
      <span class="candidate-choice-mark" aria-hidden="true"></span>
      <span class="candidate-choice-body">
        <span class="item-text">
          <span>${escapeHtml(task.text)}</span>
        </span>
        ${renderTaskSupportSummary(task)}
      </span>
    `;

    item.querySelector(".candidate-choice-input").addEventListener("change", () => {
      selectedCandidateTaskId = task.id;
      renderTasks();
    });

    list.appendChild(item);
  });

  const actions = document.createElement("div");
  actions.className = "candidate-picker-actions";
  actions.innerHTML = `
    <button class="candidate-text-action candidate-parking-action" data-action="parking" type="button">🪴後でやること置き場へ</button>
    <button class="candidate-text-action candidate-delete-action" data-action="delete" type="button">候補から消す</button>
    <button class="btn-primary small candidate-start-btn" data-action="current" type="button">これを進める</button>
  `;

  actions.querySelector('[data-action="current"]').addEventListener("click", () => {
    const task = getSelectedCandidateTask();
    if (!task) return;

    setCurrentTask(task.id);
    focusCurrentTaskBox();
  });

  actions.querySelector('[data-action="parking"]').addEventListener("click", () => {
    const task = getSelectedCandidateTask();
    if (!task) return;

    moveTaskToParking(task.id);
  });

  actions.querySelector('[data-action="delete"]').addEventListener("click", () => {
    const task = getSelectedCandidateTask();
    if (!task) return;

    deleteTask(task.id);
  });

  container.appendChild(list);
  container.appendChild(actions);
}

function renderTasks() {
  const isFull = state.tasks.length >= 3;

  taskCount.textContent = state.tasks.length;
  taskCountPill.classList.toggle("is-full", isFull);
  addTaskBtn.disabled = isFull;
  addTaskRow.hidden = isFull;
  candidateFullMessage.hidden = !isFull;

  renderCandidatePicker(taskList);
}

function isImeComposing(event) {
  return event.isComposing || event.keyCode === 229;
}

function shouldSubmitTaskInput(event) {
  return event.key === "Enter" && !isTaskInputComposing && !isImeComposing(event);
}

function shouldSubmitBulkStepInput(event) {
  return event.key === "Enter" && !isBulkStepInputComposing && !isImeComposing(event);
}

function deleteParkingMemo(id) {
  rememberDeletedItem(id);
  state.parking = state.parking.filter(item => item.id !== id);

  if (selectedParkingItemId === id) {
    selectedParkingItemId = null;
  }

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
  selectedCandidateTaskId = restoredTask.id;

  state.parking = state.parking.filter(item => item.id !== id);
  selectedParkingItemId = null;

  saveState();
  renderAll();
}

function addParkingMemo(text) {
  const trimmedText = cleanStepLine(text);

  if (!trimmedText) return false;
  if (state.parking.length >= PARKING_LIMIT) return false;

  const now = new Date().toISOString();
  const id = createId();

  state.parking.unshift({
    id,
    text: trimmedText,
    createdAt: now,
    updatedAt: now,
    nextStep: "",
    stepCount: 0,
    steps: [],
    interruptionNote: "",
    interruptedAt: null,
    progressLogs: [],
    parkedAt: now
  });

  trimParkingToLimit();
  state.showParking = true;
  selectedParkingItemId = id;
  saveState();
  renderParking();
  return true;
}

function syncParkingSelectionUI() {
  parkingList.querySelectorAll(".parking-choice").forEach(choice => {
    const input = choice.querySelector(".parking-choice-input");
    const isSelected = input?.value === selectedParkingItemId;

    choice.classList.toggle("is-selected", isSelected);

    if (input) {
      input.checked = isSelected;
    }
  });
}

function renderParking() {
  parkingList.hidden = !state.showParking;
  parkingToggleBtn.setAttribute("aria-expanded", String(state.showParking));
  parkingToggleBtn.innerHTML = `
    <span class="parking-toggle-main">
      <span class="accordion-label">🪴 後でやること置き場</span>
      <span class="parking-count">${state.parking.length} / ${PARKING_LIMIT}件</span>
    </span>
    <span class="parking-action-text">
      <span>${state.showParking ? "閉じる" : "見る"}</span>
      <span class="accordion-arrow" aria-hidden="true">${state.showParking ? "▲" : "▼"}</span>
    </span>
  `;

  parkingList.innerHTML = "";

  if (!state.showParking) {
    return;
  }

  const isFull = state.parking.length >= PARKING_LIMIT;

  if (isFull) {
    parkingList.insertAdjacentHTML("beforeend", `<div class="empty parking-limit-message">後でやること置き場がいっぱいです。戻すか削除すると、また置けます。</div>`);
  } else {
    const compose = document.createElement("div");
    compose.className = "parking-compose-row";
    compose.innerHTML = `
      <input class="parking-compose-input" type="text" placeholder="例：あとで見る資料 / 返信するメール" maxlength="80">
      <button class="parking-compose-btn" type="button">置く</button>
    `;

    const input = compose.querySelector(".parking-compose-input");
    const button = compose.querySelector(".parking-compose-btn");
    const submitParkingMemo = () => {
      if (addParkingMemo(input.value)) {
        input.value = "";
        requestAnimationFrame(() => {
          const nextInput = parkingList.querySelector(".parking-compose-input");
          nextInput?.focus();
        });
      }
    };

    button.addEventListener("click", submitParkingMemo);
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter" || isImeComposing(event)) return;

      event.preventDefault();
      submitParkingMemo();
    });

    parkingList.appendChild(compose);
  }

  if (state.parking.length === 0) {
    selectedParkingItemId = null;
    parkingList.insertAdjacentHTML("beforeend", `<div class="empty">今のところ、後でやることはありません。</div>`);
    return;
  }

  const selectedItem = ensureSelectedParkingItem();
  const list = document.createElement("div");
  list.className = "parking-choice-list";

  state.parking.forEach(item => {
    const isSelected = selectedItem?.id === item.id;
    const el = document.createElement("label");
    el.className = isSelected ? "parking-choice is-selected" : "parking-choice";

    el.innerHTML = `
      <input class="parking-choice-input" type="radio" name="parkingItem" value="${escapeHtml(item.id)}" ${isSelected ? "checked" : ""}>
      <span class="parking-choice-mark" aria-hidden="true"></span>
      <span class="parking-choice-body">
        <span class="item-text">${escapeHtml(item.text)}</span>
        <span class="item-updated">${formatItemTimestamp(item)}</span>
      </span>
    `;

    el.querySelector(".parking-choice-input").addEventListener("change", () => {
      selectedParkingItemId = item.id;
      syncParkingSelectionUI();
    });

    list.appendChild(el);
  });

  const actions = document.createElement("div");
  actions.className = "parking-picker-actions";
  actions.innerHTML = `
    <button class="btn-primary small parking-return-btn" data-action="return" type="button" ${state.tasks.length >= 3 ? "disabled" : ""}>候補に戻す</button>
    <button class="parking-text-action parking-delete-action" data-action="delete" type="button">削除</button>
  `;

  actions.querySelector('[data-action="return"]').addEventListener("click", () => {
    const item = getSelectedParkingItem();
    if (!item) return;

    returnParkingToTasks(item.id);
  });

  actions.querySelector('[data-action="delete"]').addEventListener("click", () => {
    const item = getSelectedParkingItem();
    if (!item) return;

    deleteParkingMemo(item.id);
  });

  parkingList.appendChild(list);
  parkingList.appendChild(actions);
}

function renderAll() {
  renderMode();
  renderCurrentTask();
  renderSupportPanel();
  renderTasks();
  renderParking();
}

async function sendSyncCode(event) {
  event.preventDefault();

  if (!supabaseClient) {
    setSyncStatus("Supabaseの準備ができていません。このブラウザには今まで通り保存されます。", "error");
    return;
  }

  const email = syncEmailInput.value.trim();

  if (!email) {
    setSyncStatus("メールアドレスを入力してください。", "error");
    return;
  }

  setSyncBusy(true);
  setSyncStatus("確認コードを送っています...");

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.href
    }
  });

  setSyncBusy(false);

  if (error) {
    console.error("確認コードの送信に失敗しました:", error);
    setSyncStatus(getSyncErrorMessage(error, "確認コードを送れませんでした。メールアドレスを確認して、もう一度試してください。"), "error");
    return;
  }

  syncCodeForm.hidden = false;
  setSyncStatus("確認コードを送りました。メールに届いたコードを下に入れてください。");

  requestAnimationFrame(() => {
    syncCodeInput.focus();
  });
}

async function verifySyncCode(event) {
  event.preventDefault();

  if (!supabaseClient) {
    setSyncStatus("Supabaseの準備ができていません。このブラウザには今まで通り保存されます。", "error");
    return;
  }

  const email = syncEmailInput.value.trim();
  const token = syncCodeInput.value.replace(/\s+/g, "");

  if (!email || !token) {
    setSyncStatus("メールアドレスとコードを入力してください。", "error");
    return;
  }

  setSyncBusy(true);
  setSyncStatus("コードを確認しています...");

  const { data, error } = await supabaseClient.auth.verifyOtp({
    email,
    token,
    type: "email"
  });

  setSyncBusy(false);

  if (error || !data.session) {
    console.error("確認コードの検証に失敗しました:", error);
    setSyncStatus("コードを確認できませんでした。新しいコードを送るか、入力内容を確認してください。", "error");
    return;
  }

  syncCodeForm.hidden = true;
  syncCodeInput.value = "";
  updateSyncContent(true);
  setSyncStatus("確認できました。クラウドと合わせています...", "success");
  await syncLocalAndCloud();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch(error => {
        console.warn("Service Workerの登録に失敗しました:", error);
      });
  });
}

tabButtons.forEach(button => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
  });
  button.addEventListener("keydown", handleTabKeydown);
});

brandHomeBtn.addEventListener("click", () => {
  returnToTaskSelection();
});

addTaskBtn.addEventListener("click", addTask);
parkingToggleBtn.addEventListener("click", toggleParkingSection);
completeCurrentTaskBtn.addEventListener("click", completeCurrentTask);
reselectTaskBtn.addEventListener("click", returnToTaskSelection);
addStepToggleBtn.addEventListener("click", toggleAddStep);
aiHelperToggleBtn.addEventListener("click", toggleAiHelper);
copyStepPromptBtn.addEventListener("click", copyStepPrompt);
importStepsBtn.addEventListener("click", importBulkSteps);
syncEmailForm.addEventListener("submit", sendSyncCode);
syncCodeForm.addEventListener("submit", verifySyncCode);

bulkStepInput.addEventListener("compositionstart", () => {
  isBulkStepInputComposing = true;
});

bulkStepInput.addEventListener("compositionend", () => {
  setTimeout(() => {
    isBulkStepInputComposing = false;
  }, 0);
});

bulkStepInput.addEventListener("keydown", (event) => {
  if (!shouldSubmitBulkStepInput(event)) return;

  event.preventDefault();
  importBulkSteps();
});
stepList.addEventListener("input", (event) => {
  const input = event.target.closest(".step-edit-input");
  if (!input) return;

  resizeStepInput(input);
  updateStepText(input.dataset.stepId, input.value);
});
stepList.addEventListener("change", (event) => {
  const input = event.target.closest(".step-edit-input");
  if (!input) return;

  const text = cleanStepLine(input.value);

  if (!text) {
    input.value = input.dataset.originalText || "";
    resizeStepInput(input);
    updateStepText(input.dataset.stepId, input.value);
    return;
  }

  input.value = text;
  input.dataset.originalText = text;
  resizeStepInput(input);
  updateStepText(input.dataset.stepId, text);
});
stepList.addEventListener("click", (event) => {
  const button = event.target.closest('[data-step-action="done"]');
  if (!button) return;

  completeStep(button.dataset.stepId);
});
stepList.addEventListener("keydown", (event) => {
  if (!event.target.closest(".step-edit-input")) return;

  if (event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    const originalText = event.target.dataset.originalText || "";
    event.target.value = originalText;
    resizeStepInput(event.target);
    updateStepText(event.target.dataset.stepId, originalText);
    event.target.blur();
  }
});
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

setActiveTab("use");
loadState();
supabaseClient = initializeSupabaseClient();
refreshSyncSession();
renderAll();
registerServiceWorker();
