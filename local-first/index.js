const DB_NAME = "wms-local-first-lab";
const DB_VERSION = 1;
const STORE_NAME = "scanEvents";
const CHANNEL_NAME = "wms:local-first-lab";
const SYNC_LOCK_NAME = "wms:local-first-lab:sync";

const elements = {
  usage: document.querySelector("#usage"),
  quota: document.querySelector("#quota"),
  usageRate: document.querySelector("#usageRate"),
  persisted: document.querySelector("#persisted"),
  refreshStorage: document.querySelector("#refreshStorage"),
  requestPersist: document.querySelector("#requestPersist"),
  workId: document.querySelector("#workId"),
  barcode: document.querySelector("#barcode"),
  scan: document.querySelector("#scan"),
  sync: document.querySelector("#sync"),
  clearSynced: document.querySelector("#clearSynced"),
  clearAll: document.querySelector("#clearAll"),
  tabId: document.querySelector("#tabId"),
  pendingCount: document.querySelector("#pendingCount"),
  syncedCount: document.querySelector("#syncedCount"),
  failedCount: document.querySelector("#failedCount"),
  emptyState: document.querySelector("#emptyState"),
  eventList: document.querySelector("#eventList"),
  clearLog: document.querySelector("#clearLog"),
  log: document.querySelector("#log"),
};

const tabId = getOrCreateTabId();
const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

let dbPromise = openDatabase();

elements.tabId.textContent = `tab ${tabId}`;

boot();

async function boot() {
  if (!("indexedDB" in window)) {
    log("이 브라우저는 IndexedDB를 지원하지 않습니다.");
    setControlsDisabled(true);
    return;
  }

  if (!navigator.storage?.estimate) {
    log("StorageManager estimate() 미지원: 저장소 용량 표시는 비활성화됩니다.");
  }

  if (!navigator.locks) {
    log("Web Locks 미지원: 여러 탭 동기화 중복 방지는 비활성화됩니다.");
  }

  if (!channel) {
    log("BroadcastChannel 미지원: 다른 탭 자동 갱신은 비활성화됩니다.");
  }

  bindEvents();
  await refreshAll();
  log("실험 준비 완료");
}

function bindEvents() {
  elements.refreshStorage.addEventListener("click", refreshStorageStatus);
  elements.requestPersist.addEventListener("click", requestPersistentStorage);
  elements.scan.addEventListener("click", createScanEvent);
  elements.sync.addEventListener("click", syncPendingEvents);
  elements.clearSynced.addEventListener("click", clearSyncedEvents);
  elements.clearAll.addEventListener("click", clearAllEvents);
  elements.clearLog.addEventListener("click", () => elements.log.replaceChildren());

  channel?.addEventListener("message", async (event) => {
    const message = event.data;
    if (!message || message.tabId === tabId) return;

    if (message.type === "QUEUE_CHANGED") {
      await refreshAll();
      log(`다른 탭(${message.tabId})에서 큐를 변경했습니다.`);
    }

    if (message.type === "SYNC_STARTED") {
      log(`다른 탭(${message.tabId})이 동기화를 시작했습니다.`);
    }

    if (message.type === "SYNC_FINISHED") {
      await refreshAll();
      log(`다른 탭(${message.tabId})이 동기화를 완료했습니다.`);
    }
  });
}

async function refreshAll() {
  await Promise.all([refreshStorageStatus(), renderEvents()]);
}

async function refreshStorageStatus() {
  if (!navigator.storage?.estimate) {
    elements.usage.textContent = "미지원";
    elements.quota.textContent = "미지원";
    elements.usageRate.textContent = "미지원";
    elements.persisted.textContent = "미지원";
    return;
  }

  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const usageRate = quota ? usage / quota : 0;

  elements.usage.textContent = formatBytes(usage);
  elements.quota.textContent = formatBytes(quota);
  elements.usageRate.textContent = `${Math.round(usageRate * 1000) / 10}%`;
  elements.persisted.textContent = persisted ? "yes" : "no";
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    log("이 브라우저는 persistent storage 요청을 지원하지 않습니다.");
    return;
  }

  const granted = await navigator.storage.persist();
  await refreshStorageStatus();
  log(granted ? "Persistent storage가 허용되었습니다." : "Persistent storage가 허용되지 않았습니다.");
}

async function createScanEvent() {
  const workId = elements.workId.value.trim() || "WRO-1001";
  const barcode = elements.barcode.value.trim() || createBarcode();
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    workId,
    barcode,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByTab: tabId,
  };

  await addEvent(event);
  elements.barcode.value = createBarcode();
  publish("QUEUE_CHANGED");
  await refreshAll();
  log(`${workId} / ${barcode} 스캔 이벤트를 IndexedDB에 먼저 저장했습니다.`);
}

async function syncPendingEvents() {
  if (navigator.locks) {
    const result = await navigator.locks.request(
      SYNC_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return "LOCKED";
        await runSync();
        return "DONE";
      },
    );

    if (result === "LOCKED") {
      log("다른 탭이 이미 pending 이벤트를 동기화 중입니다.");
    }
    return;
  }

  await runSync();
}

async function runSync() {
  const pendingEvents = await getEventsByStatus("pending");
  if (!pendingEvents.length) {
    log("동기화할 pending 이벤트가 없습니다.");
    return;
  }

  setSyncing(true);
  publish("SYNC_STARTED");
  log(`${pendingEvents.length}개 pending 이벤트 동기화를 시작합니다.`);

  for (const event of pendingEvents) {
    await updateEventStatus(event.id, "syncing");
    await renderEvents();

    try {
      await fakeServerSend(event);
      await updateEventStatus(event.id, "synced");
      log(`${event.barcode} 서버 전송 성공`);
    } catch (error) {
      await updateEventStatus(event.id, "failed");
      log(`${event.barcode} 서버 전송 실패: ${error.message}`);
    }
  }

  setSyncing(false);
  publish("SYNC_FINISHED");
  await refreshAll();
  log("동기화가 끝났습니다.");
}

async function clearSyncedEvents() {
  const syncedEvents = await getEventsByStatus("synced");
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  syncedEvents.forEach((event) => store.delete(event.id));
  await waitForTransaction(tx);

  publish("QUEUE_CHANGED");
  await refreshAll();
  log(`${syncedEvents.length}개 synced 이벤트를 삭제했습니다.`);
}

async function clearAllEvents() {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
  await waitForTransaction(tx);

  publish("QUEUE_CHANGED");
  await refreshAll();
  log("모든 로컬 이벤트를 삭제했습니다.");
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("status", "status", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addEvent(event) {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add(event);
  await waitForTransaction(tx);
}

async function getAllEvents() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

async function getEventsByStatus(status) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .index("status")
      .getAll(status);

    request.onsuccess = () => resolve(request.result.sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error);
  });
}

async function updateEventStatus(id, status) {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const event = await requestToPromise(store.get(id));

  if (!event) {
    await waitForTransaction(tx);
    return;
  }

  event.status = status;
  event.updatedAt = Date.now();
  store.put(event);
  await waitForTransaction(tx);
}

function waitForTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function renderEvents() {
  const events = await getAllEvents();
  const counts = countByStatus(events);

  elements.pendingCount.textContent = counts.pending;
  elements.syncedCount.textContent = counts.synced;
  elements.failedCount.textContent = counts.failed;
  elements.emptyState.hidden = events.length > 0;
  elements.eventList.replaceChildren(...events.map(createEventItem));
}

function createEventItem(event) {
  const item = document.createElement("li");
  const main = document.createElement("div");
  const title = document.createElement("div");
  const meta = document.createElement("div");
  const status = document.createElement("span");

  item.className = "event-item";
  main.className = "event-main";
  title.className = "event-title";
  meta.className = "event-meta";
  status.className = `status ${event.status}`;

  title.textContent = `${event.workId} / ${event.barcode}`;
  meta.textContent = `created ${formatTime(event.createdAt)} · updated ${formatTime(
    event.updatedAt,
  )} · tab ${event.createdByTab}`;
  status.textContent = event.status;

  main.append(title, meta);
  item.append(main, status);
  return item;
}

function countByStatus(events) {
  return events.reduce(
    (acc, event) => {
      acc[event.status] = (acc[event.status] || 0) + 1;
      return acc;
    },
    { pending: 0, syncing: 0, synced: 0, failed: 0 },
  );
}

function publish(type) {
  channel?.postMessage({
    type,
    tabId,
    createdAt: Date.now(),
  });
}

function setSyncing(syncing) {
  elements.sync.disabled = syncing;
  elements.scan.disabled = syncing;
  elements.clearSynced.disabled = syncing;
  elements.clearAll.disabled = syncing;
}

function setControlsDisabled(disabled) {
  elements.scan.disabled = disabled;
  elements.sync.disabled = disabled;
  elements.clearSynced.disabled = disabled;
  elements.clearAll.disabled = disabled;
  elements.requestPersist.disabled = disabled;
}

async function fakeServerSend(event) {
  await sleep(700);

  if (event.barcode.toUpperCase().includes("FAIL")) {
    throw new Error("FAIL 바코드는 실패 시뮬레이션으로 처리됩니다.");
  }
}

function getOrCreateTabId() {
  const storageKey = "wms:local-first-lab:tab-id";
  const stored = sessionStorage.getItem(storageKey);
  if (stored) return stored;

  const nextId = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : createBarcode();
  sessionStorage.setItem(storageKey, nextId);
  return nextId;
}

function createBarcode() {
  return `ITEM-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${Math.round(value * 10) / 10} ${units[index]}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("ko-KR", { hour12: false });
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = `[${formatTime(Date.now())}] ${message}`;
  elements.log.prepend(item);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
