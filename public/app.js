const DAILY_STORAGE_KEY = "word-game:v1:daily";
const PRACTICE_STORAGE_KEY = "word-game:v1:practice-sessions";
const STATS_STORAGE_KEY = "word-game:v1:stats";
const MAX_ATTEMPTS = 6;
const LETTER_PATTERN = /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]$/u;
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const STATE_RANK = { absent: 1, present: 2, correct: 3 };
const STATE_LABEL = {
  correct: "correta, na posição certa",
  present: "presente, em outra posição",
  absent: "ausente"
};
const ACCENT_LETTERS = ["Á", "À", "Â", "Ã", "É", "Ê", "Í", "Ó", "Ô", "Õ", "Ú", "Ç"];
const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("pt-BR", { granularity: "grapheme" })
  : null;

const elements = {
  date: document.querySelector("#game-date"),
  title: document.querySelector("#game-title"),
  count: document.querySelector("#attempt-count"),
  board: document.querySelector("#board"),
  form: document.querySelector("#guess-form"),
  input: document.querySelector("#guess-input"),
  message: document.querySelector("#guess-message"),
  keyboard: document.querySelector("#keyboard"),
  accentToggle: document.querySelector("#accent-toggle"),
  accentKeys: document.querySelector("#accent-keys"),
  statsMode: document.querySelector("#stats-mode"),
  statGames: document.querySelector("#stat-games"),
  statWins: document.querySelector("#stat-wins"),
  statRate: document.querySelector("#stat-rate"),
  statStreak: document.querySelector("#stat-streak"),
  statBestStreak: document.querySelector("#stat-best-streak"),
  distribution: document.querySelector("#distribution"),
  resultCard: document.querySelector("#result-card"),
  resultMessage: document.querySelector("#result-message"),
  shareButton: document.querySelector("#share-button"),
  shareFallback: document.querySelector("#share-fallback"),
  shareText: document.querySelector("#share-text"),
  practiceCard: document.querySelector("#practice-card"),
  newPractice: document.querySelector("#new-practice")
};

const app = {
  mode: "daily",
  dailyInfo: null,
  session: null,
  draft: "",
  busy: false,
  statistics: {
    daily: { completed: {} },
    practice: { completed: [] }
  },
  practiceSessions: {},
  dailySessions: {},
  storageAvailable: true,
  storageCorrupt: false
};

class GameError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.status = status;
  }
}

function graphemes(value) {
  const normalized = value.normalize("NFC");
  if (segmenter) return Array.from(segmenter.segment(normalized), (part) => part.segment);
  return Array.from(normalized).reduce((result, character) => {
    if (/\p{Mark}/u.test(character) && result.length) result[result.length - 1] += character;
    else result.push(character);
    return result;
  }, []);
}

function normalize(value) {
  return value.normalize("NFC").toLocaleUpperCase("pt-BR");
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      app.storageCorrupt = true;
      return fallback;
    }
  } catch {
    app.storageAvailable = false;
    return fallback;
  }
}

function writeStorage(key, value) {
  if (app.storageCorrupt) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    app.storageAvailable = false;
    return false;
  }
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "content-type": "application/json", ...options.headers }
    });
  } catch {
    throw new GameError("Não foi possível conectar ao jogo. Verifique sua conexão e tente novamente.", "NETWORK_ERROR");
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new GameError("O servidor retornou uma resposta que não pôde ser lida.", "INVALID_RESPONSE", response.status);
  }
  if (!response.ok) {
    const error = body?.error;
    throw new GameError(error?.message || "Não foi possível concluir a ação. Tente novamente.", error?.code || "REQUEST_FAILED", response.status);
  }
  return body;
}

function postJson(url, payload) {
  return requestJson(url, { method: "POST", body: JSON.stringify(payload) });
}

function savedDaily() {
  return app.dailySessions[app.dailyInfo.dateKey] || null;
}

function saveDailySession() {
  if (!app.session || app.mode !== "daily" || !app.dailyInfo) return;
  app.dailySessions[app.dailyInfo.dateKey] = {
    sessionId: app.session.sessionId,
    guesses: app.session.guesses,
    status: app.session.status,
    answer: app.session.answer
  };
  if (!writeStorage(DAILY_STORAGE_KEY, app.dailySessions)) {
    setMessage("O progresso está nesta aba, mas não pôde ser salvo neste navegador.", true);
  }
}

function savePracticeSessions() {
  if (!writeStorage(PRACTICE_STORAGE_KEY, app.practiceSessions)) {
    setMessage("O progresso está nesta aba, mas não pôde ser salvo neste navegador.", true);
  }
}

function saveStatistics() {
  if (!writeStorage(STATS_STORAGE_KEY, app.statistics)) {
    setMessage("A partida foi salva, mas as estatísticas não puderam ser gravadas neste navegador.", true);
  }
}

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  if (isError) elements.message.dataset.error = "true";
  else elements.message.removeAttribute("data-error");
}

function currentStatistics() {
  return app.mode === "daily" ? app.statistics.daily : app.statistics.practice;
}

function localDate(dateKey) {
  return new Date(`${dateKey}T12:00:00-03:00`);
}

function dateKeyInSaoPaulo(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateLabel(dateKey) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo"
  }).format(localDate(dateKey)).toLocaleUpperCase("pt-BR");
}

function dateDifference(leftKey, rightKey) {
  const left = localDate(leftKey);
  const right = localDate(rightKey);
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}

function currentStreak(history) {
  const dates = Object.keys(history).sort();
  if (dates.length === 0) return 0;
  const today = app.dailyInfo?.dateKey;
  const lastDate = dates[dates.length - 1];
  if (today && dateDifference(lastDate, today) > 1) return 0;
  if (!history[lastDate].won) return 0;

  let streak = 0;
  let expected = lastDate;
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const dateKey = dates[index];
    if (dateKey !== expected || !history[dateKey].won) break;
    streak += 1;
    const previous = localDate(dateKey);
    previous.setDate(previous.getDate() - 1);
    expected = dateKeyInSaoPaulo(previous);
  }
  return streak;
}

function statsSummary() {
  const stats = currentStatistics();
  if (app.mode === "daily") {
    const records = Object.values(stats.completed);
    const wins = records.filter((record) => record.won);
    const bestStreak = calculateBestStreak(stats.completed);
    return {
      games: records.length,
      wins: wins.length,
      rate: records.length ? Math.round((wins.length / records.length) * 100) : 0,
      streak: currentStreak(stats.completed),
      distribution: Array.from({ length: MAX_ATTEMPTS }, (_, index) =>
        wins.filter((record) => record.attempts === index + 1).length
      ),
      bestStreak
    };
  }
  const records = stats.completed;
  const wins = records.filter((record) => record.won);
  return {
    games: records.length,
    wins: wins.length,
    rate: records.length ? Math.round((wins.length / records.length) * 100) : 0,
    streak: 0,
    distribution: Array.from({ length: MAX_ATTEMPTS }, (_, index) =>
      wins.filter((record) => record.attempts === index + 1).length
    ),
    bestStreak: 0
  };
}

function calculateBestStreak(history) {
  let best = 0;
  let streak = 0;
  let previousDate = null;
  for (const dateKey of Object.keys(history).sort()) {
    const record = history[dateKey];
    if (record.won && (!previousDate || dateDifference(previousDate, dateKey) === 1)) {
      streak += 1;
    } else if (record.won) {
      streak = 1;
    } else {
      streak = 0;
    }
    best = Math.max(best, streak);
    previousDate = dateKey;
  }
  return best;
}

function updateStatsForFinishedGame() {
  if (!app.session || app.session.status === "in-progress" || app.session.statsRecorded) return;
  const record = {
    won: app.session.status === "won",
    attempts: app.session.guesses.length
  };
  if (app.mode === "daily") {
    const existing = app.statistics.daily.completed[app.dailyInfo.dateKey];
    if (!existing) app.statistics.daily.completed[app.dailyInfo.dateKey] = record;
    app.session.statsRecorded = true;
    saveStatistics();
    saveDailySession();
    return;
  }

  if (!app.session.statsRecorded) {
    app.statistics.practice.completed.push({ ...record, completedAt: new Date().toISOString() });
    app.session.statsRecorded = true;
    saveStatistics();
    savePracticeSessions();
  }
}

function renderBoard() {
  elements.board.replaceChildren();
  for (let rowIndex = 0; rowIndex < MAX_ATTEMPTS; rowIndex += 1) {
    const row = document.createElement("div");
    row.className = "board-row";
    row.setAttribute("role", "row");
    row.setAttribute("aria-label", `Tentativa ${rowIndex + 1}`);
    const committed = app.session?.guesses[rowIndex];
    const draft = !committed && rowIndex === (app.session?.guesses.length || 0) && app.session?.status === "in-progress"
      ? graphemes(app.draft)
      : [];

    for (let column = 0; column < 5; column += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.setAttribute("role", "gridcell");
      if (committed) {
        const letter = graphemes(committed.guess)[column];
        const state = committed.tiles[column];
        tile.dataset.state = state;
        tile.textContent = letter;
        tile.setAttribute("aria-label", `${letter}, ${STATE_LABEL[state]}`);
      } else {
        const letter = draft[column] || "";
        tile.textContent = letter;
        if (letter) tile.dataset.state = "current";
        tile.setAttribute("aria-label", letter || "vazio");
      }
      row.append(tile);
    }
    elements.board.append(row);
  }
}

function keyboardStates() {
  const result = new Map();
  for (const guess of app.session?.guesses || []) {
    graphemes(guess.guess).forEach((letter, index) => {
      const state = guess.tiles[index];
      if ((STATE_RANK[state] || 0) > (STATE_RANK[result.get(letter)] || 0)) result.set(letter, state);
    });
  }
  return result;
}

function appendKeyRow(letters, rowIndex, states) {
  const row = document.createElement("div");
  row.className = "key-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", `Linha ${rowIndex + 1} do teclado`);
  if (rowIndex === 2) row.append(createKeyboardButton("Enviar", "submit", "Enviar palavra", true));
  for (const letter of letters) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key";
    button.textContent = letter;
    button.setAttribute("aria-label", `Inserir ${letter}${states.has(letter) ? `, ${STATE_LABEL[states.get(letter)]}` : ""}`);
    if (states.has(letter)) button.dataset.state = states.get(letter);
    button.disabled = app.busy || app.session?.status !== "in-progress";
    button.addEventListener("click", () => appendLetter(letter));
    row.append(button);
  }
  if (rowIndex === 2) row.append(createKeyboardButton("⌫", "button", "Apagar última letra", false, removeLetter));
  elements.keyboard.append(row);
}

function createKeyboardButton(label, type, accessibleName, isSubmit, action) {
  const button = document.createElement("button");
  button.type = type;
  button.className = "key wide";
  button.textContent = label;
  button.setAttribute("aria-label", accessibleName);
  button.disabled = app.busy || app.session?.status !== "in-progress";
  if (isSubmit) button.setAttribute("form", "guess-form");
  else if (action) button.addEventListener("click", action);
  return button;
}

function renderKeyboard() {
  elements.keyboard.replaceChildren();
  const states = keyboardStates();
  KEY_ROWS.forEach((letters, index) => appendKeyRow(letters, index, states));
}

function renderStatistics() {
  const summary = statsSummary();
  elements.statsMode.textContent = app.mode === "daily" ? "DESAFIO DIÁRIO" : "PRÁTICA";
  elements.statGames.textContent = String(summary.games);
  elements.statWins.textContent = String(summary.wins);
  elements.statRate.textContent = `${summary.rate}%`;
  elements.statStreak.textContent = String(summary.streak);
  elements.statBestStreak.textContent = String(summary.bestStreak);
  elements.statStreak.setAttribute("aria-label", `${summary.streak} dias; melhor sequência ${summary.bestStreak}`);
  elements.distribution.replaceChildren();

  const maximum = Math.max(1, ...summary.distribution);
  summary.distribution.forEach((count, index) => {
    const item = document.createElement("li");
    item.className = "distribution-row";
    item.setAttribute("aria-label", `${index + 1} tentativa${index ? "s" : ""}: ${count} vitória${count === 1 ? "" : "s"}`);
    const attemptLabel = document.createElement("span");
    attemptLabel.textContent = String(index + 1);
    const track = document.createElement("div");
    track.className = "bar-track";
    track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("div");
    const fill = count ? Math.max(1, Math.round((count / maximum) * 10)) : 0;
    bar.className = `bar bar--fill-${fill}`;
    bar.textContent = count ? String(count) : "";
    track.append(bar);
    item.append(attemptLabel, track);
    elements.distribution.append(item);
  });
}

function resultText() {
  if (!app.session || app.session.status === "in-progress") return "";
  if (app.session.status === "won") {
    return `Você acertou em ${app.session.guesses.length} ${app.session.guesses.length === 1 ? "tentativa" : "tentativas"}!`;
  }
  return `Fim de jogo. A palavra era ${app.session.answer}.`;
}

function render() {
  const isTerminal = app.session && app.session.status !== "in-progress";
  const attemptNumber = Math.min((app.session?.guesses.length || 0) + 1, MAX_ATTEMPTS);
  elements.title.textContent = app.mode === "daily" ? "Desafio de hoje" : "Prática";
  elements.date.textContent = app.mode === "daily" && app.dailyInfo
    ? `${dateLabel(app.dailyInfo.dateKey)} · HORÁRIO DE BRASÍLIA`
    : "SEM LIMITE DE PARTIDAS";
  elements.count.textContent = isTerminal
    ? app.session.status === "won" ? `vitória · ${app.session.guesses.length}/6` : "concluído"
    : `${attemptNumber} de 6`;
  elements.input.disabled = app.busy || isTerminal || !app.session;
  elements.input.value = app.draft;
  elements.form.querySelector('[type="submit"]').disabled = app.busy || isTerminal || !app.session;

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === app.mode));
  });
  elements.practiceCard.hidden = app.mode !== "practice";
  elements.newPractice.hidden = app.mode !== "practice" || !isTerminal;
  elements.resultCard.hidden = !isTerminal;
  elements.shareButton.hidden = app.mode !== "daily" || !isTerminal;
  elements.shareFallback.hidden = true;
  if (isTerminal) {
    elements.resultMessage.textContent = app.mode === "daily"
      ? `${resultText()} O próximo desafio chega à meia-noite, no horário de Brasília.`
      : resultText();
  }
  renderBoard();
  renderKeyboard();
  renderStatistics();
}

function resetShareFallback() {
  elements.shareFallback.hidden = true;
  elements.shareText.value = "";
}

function storageNotice() {
  if (app.storageCorrupt) {
    setMessage("Não foi possível ler o progresso salvo. Os dados locais existentes não foram sobrescritos; apague os dados deste site nas configurações do navegador para começar um novo progresso.", true);
  } else if (!app.storageAvailable) {
    setMessage("O armazenamento do navegador está indisponível. Seu progresso pode não ser retomado após fechar esta página.", true);
  }
}

async function loadDaily() {
  app.dailyInfo = await requestJson("/api/v1/daily");
  const saved = savedDaily();
  let session;
  try {
    session = await postJson("/api/v1/daily/session", {
      dateKey: app.dailyInfo.dateKey,
      sessionId: saved?.sessionId
    });
  } catch (error) {
    if (error.code !== "SESSION_EXPIRED" || !saved?.sessionId) throw error;
    delete app.dailySessions[app.dailyInfo.dateKey];
    session = await postJson("/api/v1/daily/session", { dateKey: app.dailyInfo.dateKey });
    setMessage("A sessão anterior expirou. Começamos uma nova partida diária; as tentativas anteriores não puderam ser recuperadas.", true);
  }
  app.session = session;
  app.session.statsRecorded = Boolean(app.statistics.daily.completed[app.dailyInfo.dateKey]);
  updateStatsForFinishedGame();
  saveDailySession();
}

async function loadPractice(sessionId) {
  const saved = app.practiceSessions[sessionId];
  let session;
  try {
    session = await postJson("/api/v1/practice/session", { sessionId });
  } catch (error) {
    if (error.code !== "SESSION_EXPIRED") throw error;
    session = await postJson("/api/v1/practice", {});
    app.practiceSessions[sessionId] = { ...saved, status: "expired" };
    setMessage("A sessão de prática expirou. Uma nova partida foi iniciada; as tentativas anteriores não puderam ser recuperadas.", true);
  }
  app.session = session;
  app.session.statsRecorded = Boolean(saved?.statsRecorded);
  app.practiceSessions[session.sessionId] = app.session;
  savePracticeSessions();
  updateStatsForFinishedGame();
}

function restoreFromStorage() {
  const daily = readStorage(DAILY_STORAGE_KEY, {});
  const practices = readStorage(PRACTICE_STORAGE_KEY, {});
  const statistics = readStorage(STATS_STORAGE_KEY, null);
  app.dailySessions = daily && typeof daily === "object" && !Array.isArray(daily) ? daily : {};
  app.practiceSessions = practices && typeof practices === "object" && !Array.isArray(practices) ? practices : {};
  if (statistics?.daily?.completed && typeof statistics.daily.completed === "object"
      && Array.isArray(statistics?.practice?.completed)) {
    app.statistics = statistics;
  }
}

async function initialize() {
  restoreFromStorage();
  render();
  try {
    await loadDaily();
    if (!app.storageAvailable) storageNotice();
    render();
  } catch (error) {
    elements.date.textContent = "DESAFIO INDISPONÍVEL";
    setMessage(error.message, true);
    elements.count.textContent = "— de 6";
  }
}

async function setMode(mode) {
  if (app.busy || !["daily", "practice"].includes(mode)) return;
  const previousMode = app.mode;
  const previousSession = app.session;
  const previousDailyInfo = app.dailyInfo;
  app.busy = true;
  resetShareFallback();
  setMessage("");
  render();
  try {
    if (mode === "daily") {
      app.mode = "daily";
      await loadDaily();
    } else {
      app.mode = "practice";
      const sessionIds = Object.keys(app.practiceSessions);
      const activeId = sessionIds.reverse().find((id) => app.practiceSessions[id]?.status === "in-progress");
      if (activeId) {
        await loadPractice(activeId);
      } else {
        const session = await postJson("/api/v1/practice", {});
        app.session = session;
        app.session.statsRecorded = false;
        app.practiceSessions[session.sessionId] = session;
        savePracticeSessions();
      }
    }
  } catch (error) {
    app.mode = previousMode;
    app.session = previousSession;
    app.dailyInfo = previousDailyInfo;
    setMessage(error.message, true);
  } finally {
    app.draft = "";
    app.busy = false;
    render();
  }
}

function appendLetter(letter) {
  if (app.busy || app.session?.status !== "in-progress" || graphemes(app.draft).length >= 5) return;
  app.draft = normalize(app.draft + letter);
  renderBoard();
  elements.input.focus();
}

function removeLetter() {
  if (app.busy || app.session?.status !== "in-progress") return;
  app.draft = graphemes(app.draft).slice(0, -1).join("");
  renderBoard();
  elements.input.focus();
}

async function submitGuess(event) {
  event.preventDefault();
  if (app.busy || app.session?.status !== "in-progress") return;
  const guess = normalize(app.draft.trim());
  if (graphemes(guess).length !== 5) {
    setMessage("Digite uma palavra com cinco letras.", true);
    return;
  }
  if (!Array.from(guess).every((letter) => LETTER_PATTERN.test(letter))) {
    setMessage("Use apenas letras do português.", true);
    return;
  }

  app.busy = true;
  setMessage("Verificando palavra…");
  render();
  try {
    const url = app.mode === "daily" ? "/api/v1/daily/guess" : `/api/v1/practice/${app.session.sessionId}/guess`;
    const session = await postJson(url, {
      sessionId: app.session.sessionId,
      guess,
      attemptNumber: app.session.guesses.length + 1
    });
    app.session = { ...session, statsRecorded: app.session.statsRecorded };
    app.draft = "";
    if (app.mode === "daily") saveDailySession();
    else {
      app.practiceSessions[app.session.sessionId] = app.session;
      savePracticeSessions();
    }
    if (app.session.status !== "in-progress") updateStatsForFinishedGame();
    if (app.session.status === "in-progress") {
      const result = app.session.guesses.at(-1);
      const summary = result.tiles.map((state, index) => `${graphemes(result.guess)[index]} ${STATE_LABEL[state]}`).join("; ");
      setMessage(`Tentativa registrada. ${summary}.`);
    } else {
      setMessage(resultText());
    }
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    app.busy = false;
    render();
  }
}

async function startNewPractice() {
  if (app.busy) return;
  app.busy = true;
  setMessage("");
  resetShareFallback();
  render();
  try {
    const session = await postJson("/api/v1/practice", {});
    app.session = { ...session, statsRecorded: false };
    app.practiceSessions[session.sessionId] = app.session;
    app.draft = "";
    savePracticeSessions();
    setMessage("Nova palavra de prática. Boa sorte!");
    render();
    elements.input.focus();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    app.busy = false;
    render();
  }
}

function shareContent() {
  const symbols = { correct: "■", present: "◧", absent: "□" };
  const rows = app.session.guesses.map((guess) => guess.tiles.map((state) => symbols[state]).join(""));
  return `PALAVRA · Desafio diário ${app.dailyInfo.dateKey}\n${app.session.guesses.length}/6 tentativas\n\n${rows.join("\n")}\n\n■ correta · ◧ presente · □ ausente`;
}

async function shareResult() {
  if (app.mode !== "daily" || app.session?.status === "in-progress" || !app.session) return;
  const text = shareContent();
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API indisponível.");
    await navigator.clipboard.writeText(text);
    elements.shareFallback.hidden = true;
    setMessage("Resultado copiado sem revelar a palavra.");
  } catch {
    elements.shareText.value = text;
    elements.shareFallback.hidden = false;
    elements.shareText.focus();
    elements.shareText.select();
    setMessage("Não foi possível copiar automaticamente. O resultado está selecionado para cópia manual.");
  }
}

elements.form.addEventListener("submit", submitGuess);
elements.input.addEventListener("input", () => {
  const normalized = normalize(elements.input.value);
  app.draft = graphemes(normalized).slice(0, 5).join("");
  if (elements.input.value !== app.draft) elements.input.value = app.draft;
  renderBoard();
});
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
elements.accentToggle.addEventListener("click", () => {
  const expanded = elements.accentToggle.getAttribute("aria-expanded") === "true";
  elements.accentToggle.setAttribute("aria-expanded", String(!expanded));
  elements.accentKeys.hidden = expanded;
});
ACCENT_LETTERS.forEach((letter) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "accent-key";
  button.textContent = letter;
  button.setAttribute("aria-label", `Inserir ${letter}`);
  button.addEventListener("click", () => appendLetter(letter));
  elements.accentKeys.append(button);
});
elements.shareButton.addEventListener("click", shareResult);
elements.newPractice.addEventListener("click", startNewPractice);
document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches("input, textarea, button, a")) return;
  if (event.key === "Backspace") {
    removeLetter();
    return;
  }
  if (/^[a-záàâãéêíóôõúç]$/iu.test(event.key)) appendLetter(normalize(event.key));
});

initialize();
