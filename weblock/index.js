const channelName = "cgkr:inbound-lock-lab";
const supportsWebLocks = "locks" in navigator;
const supportsBroadcastChannel = "BroadcastChannel" in window;
const channel = supportsBroadcastChannel ? new BroadcastChannel(channelName) : null;

const tabId = getOrCreateTabId();
const tabIdElement = document.querySelector("#tabId");
const stateElement = document.querySelector("#state");
const logElement = document.querySelector("#log");
const workIdInput = document.querySelector("#workId");
const runIfAvailableButton = document.querySelector("#runIfAvailable");
const runQueuedButton = document.querySelector("#runQueued");
const clearLogButton = document.querySelector("#clearLog");

tabIdElement.textContent = tabId;

if (!supportsWebLocks) {
  setState("Web Locks API 미지원 브라우저");
  log("이 브라우저는 navigator.locks를 지원하지 않습니다.");
}

if (!supportsBroadcastChannel) {
  log("BroadcastChannel 미지원: 다른 탭 로그 동기화는 비활성화됩니다.");
}

channel?.addEventListener("message", (event) => {
  if (!event.data || event.data.tabId === tabId) return;

  const { type, workId, tabId: sourceTabId } = event.data;
  if (type === "TASK_STARTED") {
    log(`다른 탭(${sourceTabId})이 ${workId} 작업을 시작했습니다.`);
  }
  if (type === "TASK_FINISHED") {
    log(`다른 탭(${sourceTabId})이 ${workId} 작업을 완료했습니다.`);
  }
});

runIfAvailableButton.addEventListener("click", async () => {
  const workId = getWorkId();
  const lockName = createInboundLockName(workId);

  if (!supportsWebLocks) {
    await runInboundTask(workId);
    return;
  }

  const result = await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
    if (!lock) {
      return "LOCKED";
    }

    await runInboundTask(workId);
    return "DONE";
  });

  if (result === "LOCKED") {
    setState("다른 탭에서 처리 중");
    log(`${workId} lock을 잡지 못했습니다. 다른 탭에서 같은 입고 작업을 처리 중입니다.`);
  }
});

runQueuedButton.addEventListener("click", async () => {
  const workId = getWorkId();
  const lockName = createInboundLockName(workId);

  if (!supportsWebLocks) {
    await runInboundTask(workId);
    return;
  }

  setState("락 대기 중");
  log(`${workId} lock 대기열에 들어갔습니다.`);

  await navigator.locks.request(lockName, async () => {
    await runInboundTask(workId);
  });
});

clearLogButton.addEventListener("click", () => {
  logElement.replaceChildren();
});

function getOrCreateTabId() {
  const storageKey = "cgkr:inbound-lock-lab:tab-id";
  const stored = sessionStorage.getItem(storageKey);
  if (stored) return stored;

  const nextId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);

  sessionStorage.setItem(storageKey, nextId);
  return nextId;
}

function getWorkId() {
  return workIdInput.value.trim() || "WRO-1001";
}

function createInboundLockName(workId) {
  return `cgkr:inbound:${workId}`;
}

async function runInboundTask(workId) {
  setControlsDisabled(true);
  setState(`${workId} 처리 중`);
  log(`${workId} 작업 시작`);
  publish("TASK_STARTED", workId);

  await sleep(5000);

  publish("TASK_FINISHED", workId);
  log(`${workId} 작업 완료`);
  setState("대기 중");
  setControlsDisabled(false);
}

function publish(type, workId) {
  channel?.postMessage({
    type,
    workId,
    tabId,
    createdAt: new Date().toISOString(),
  });
}

function setControlsDisabled(disabled) {
  runIfAvailableButton.disabled = disabled;
  runQueuedButton.disabled = disabled;
  workIdInput.disabled = disabled;
}

function setState(text) {
  stateElement.textContent = text;
}

function log(message) {
  const item = document.createElement("li");
  const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  item.textContent = `[${time}] ${message}`;
  logElement.prepend(item);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
