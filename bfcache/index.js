const pageId = createPageId();
let count = 0;

const pageIdElement = document.querySelector("#pageId");
const navigationTypeElement = document.querySelector("#navigationType");
const lastPageshowElement = document.querySelector("#lastPageshow");
const countElement = document.querySelector("#count");
const incrementButton = document.querySelector("#increment");
const memoElement = document.querySelector("#memo");
const logElement = document.querySelector("#log");

pageIdElement.textContent = pageId;
navigationTypeElement.textContent = getNavigationType();
lastPageshowElement.textContent = "-";

log("script evaluated: JS heap이 새로 만들어졌습니다.");

document.addEventListener("DOMContentLoaded", () => {
  log("DOMContentLoaded: 문서가 처음 로드되었습니다.");
});

window.addEventListener("pagehide", (event) => {
  const persistedText = event.persisted ? "BFCache 후보" : "일반 unload";
  log(`pagehide: 페이지를 떠납니다. (${persistedText})`);
});

window.addEventListener("pageshow", (event) => {
  const restoredFromBFCache = event.persisted;
  const restoredText = restoredFromBFCache ? "BFCache에서 복원됨" : "새 페이지 로드";

  navigationTypeElement.textContent = getNavigationType();
  lastPageshowElement.textContent = restoredText;
  log(`pageshow: ${restoredText}`);

  if (restoredFromBFCache) {
    log("BFCache 복원 감지: 실무에서는 여기서 현재 작업 데이터를 refetch합니다.");
  }
});

incrementButton.addEventListener("click", () => {
  count += 1;
  countElement.textContent = String(count);
  log(`in-memory counter 증가: ${count}`);
});

memoElement.addEventListener("input", () => {
  log(`textarea 입력 상태 변경: ${memoElement.value.length}자`);
});

function createPageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

function getNavigationType() {
  const [navigation] = performance.getEntriesByType("navigation");
  return navigation?.type ?? "unknown";
}

function log(message) {
  const item = document.createElement("li");
  const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  item.textContent = `[${time}] ${message}`;
  logElement.prepend(item);
}
