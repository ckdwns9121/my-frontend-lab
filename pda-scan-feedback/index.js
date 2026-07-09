const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
const supportsAudio = Boolean(AudioContextCtor);
const supportsVibration = "vibrate" in navigator;

const elements = {
  audioSupport: document.querySelector("#audioSupport"),
  audioState: document.querySelector("#audioState"),
  vibrationSupport: document.querySelector("#vibrationSupport"),
  lastResult: document.querySelector("#lastResult"),
  unlockAudio: document.querySelector("#unlockAudio"),
  barcodeInput: document.querySelector("#barcodeInput"),
  submitScan: document.querySelector("#submitScan"),
  successFeedback: document.querySelector("#successFeedback"),
  errorFeedback: document.querySelector("#errorFeedback"),
  clearLog: document.querySelector("#clearLog"),
  log: document.querySelector("#log"),
};

let audioContext = null;
let isSubmitting = false;

boot();

function boot() {
  elements.audioSupport.textContent = supportsAudio ? "지원" : "미지원";
  elements.vibrationSupport.textContent = supportsVibration ? "지원" : "미지원";
  updateAudioState();
  bindEvents();
  focusBarcodeInput();
  log("info", "작업 시작을 누르면 Web Audio가 활성화됩니다.");
}

function bindEvents() {
  elements.unlockAudio.addEventListener("click", async () => {
    await unlockAudio();
    focusBarcodeInput();
  });

  elements.barcodeInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await submitCurrentBarcode();
  });

  elements.submitScan.addEventListener("click", submitCurrentBarcode);
  elements.successFeedback.addEventListener("click", () => runSuccessFeedback("MANUAL-SUCCESS"));
  elements.errorFeedback.addEventListener("click", () => runErrorFeedback("MANUAL-ERROR"));
  elements.clearLog.addEventListener("click", () => elements.log.replaceChildren());

  document.querySelectorAll("[data-fill]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.barcodeInput.value = button.dataset.fill;
      focusBarcodeInput();
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    focusBarcodeInput();
  });
}

async function submitCurrentBarcode() {
  if (isSubmitting) return;

  const barcode = elements.barcodeInput.value.trim();
  if (!barcode) {
    log("error", "바코드가 비어 있습니다.");
    focusBarcodeInput();
    return;
  }

  await unlockAudio();
  setSubmitting(true);
  log("info", `${barcode} 서버 검증 요청`);

  try {
    const result = await validateBarcode(barcode);

    if (result.status === "success") {
      runSuccessFeedback(barcode);
      elements.barcodeInput.value = createNextBarcode();
      return;
    }

    if (result.status === "duplicate") {
      runDuplicateFeedback(barcode);
      elements.barcodeInput.select();
      return;
    }

    runErrorFeedback(barcode);
    elements.barcodeInput.select();
  } finally {
    setSubmitting(false);
    focusBarcodeInput();
  }
}

async function validateBarcode(barcode) {
  await sleep(450);
  const normalized = barcode.toUpperCase();

  if (normalized.includes("FAIL") || normalized.includes("ERR")) {
    return { status: "error" };
  }

  if (normalized.includes("DUP")) {
    return { status: "duplicate" };
  }

  return { status: "success" };
}

async function unlockAudio() {
  if (!supportsAudio) {
    updateAudioState();
    return;
  }

  audioContext ||= new AudioContextCtor();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  updateAudioState();
}

function runSuccessFeedback(barcode) {
  vibrate(60);
  beepSequence([
    { frequency: 1850, duration: 34, type: "square", volume: 0.055 },
    { delay: 18, frequency: 2300, duration: 42, type: "square", volume: 0.045 },
  ]);
  elements.lastResult.textContent = "성공";
  log("success", `${barcode} 검증 성공: 짧은 진동 + 스캐너 성공음`);
}

function runErrorFeedback(barcode) {
  vibrate([140, 70, 140]);
  beepSequence([
    { frequency: 260, duration: 115, type: "sawtooth", volume: 0.06 },
    { delay: 70, frequency: 190, duration: 145, type: "sawtooth", volume: 0.06 },
  ]);
  elements.lastResult.textContent = "실패";
  log("error", `${barcode} 검증 실패: 긴 진동 2회 + 낮은 경고음`);
}

function runDuplicateFeedback(barcode) {
  vibrate([80, 60, 80]);
  beepSequence([
    { frequency: 760, duration: 60, type: "triangle", volume: 0.055 },
    { delay: 55, frequency: 760, duration: 60, type: "triangle", volume: 0.055 },
  ]);
  elements.lastResult.textContent = "중복";
  log("duplicate", `${barcode} 중복 스캔: 짧은 진동 2회 + 중복 알림음`);
}

function beepSequence(steps) {
  if (!audioContext || audioContext.state !== "running") {
    updateAudioState();
    return;
  }

  let offset = 0;
  steps.forEach((step) => {
    offset += step.delay || 0;
    beep(step, offset);
    offset += step.duration;
  });
}

function beep({ frequency, duration, type = "square", volume = 0.05 }, delay = 0) {
  const startAt = audioContext.currentTime + delay / 1000;
  const stopAt = startAt + duration / 1000;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.92, stopAt);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(Math.max(frequency, 400), startAt);
  filter.Q.setValueAtTime(10, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt);
}

function vibrate(pattern) {
  if (!supportsVibration) return;
  navigator.vibrate(pattern);
}

function setSubmitting(nextSubmitting) {
  isSubmitting = nextSubmitting;
  elements.submitScan.disabled = nextSubmitting;
  elements.barcodeInput.disabled = nextSubmitting;
}

function focusBarcodeInput() {
  if (elements.barcodeInput.disabled) return;
  elements.barcodeInput.focus();
}

function updateAudioState() {
  elements.audioState.textContent = audioContext?.state || "not started";
}

function createNextBarcode() {
  return `ITEM-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function log(type, message) {
  const item = document.createElement("li");
  const badge = document.createElement("span");
  const text = document.createElement("span");

  badge.className = `result ${type}`;
  badge.textContent = labelByType(type);
  text.textContent = `[${formatTime()}] ${message}`;

  item.append(badge, text);
  elements.log.prepend(item);
}

function labelByType(type) {
  if (type === "success") return "성공";
  if (type === "error") return "실패";
  if (type === "duplicate") return "중복";
  return "정보";
}

function formatTime() {
  return new Date().toLocaleTimeString("ko-KR", { hour12: false });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
