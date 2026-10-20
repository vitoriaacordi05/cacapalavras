import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptGuess,
  createSession,
  dailyAnswer,
  dateKeyInSaoPaulo,
  practiceAnswer,
  publicSession
} from "./game.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 4173);
const sessions = new Map();
const dailyClientSessions = new Map();
const dailyClients = new Map();
const rateBuckets = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 5000;
const MAX_RATE_BUCKETS = 10_000;
const MAX_NEW_CLIENTS_PER_HOUR = 10;
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

function sendJson(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) {
      throw Object.assign(new Error("A solicitação é muito grande."), { status: 413, code: "BODY_TOO_LARGE" });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("O corpo da solicitação não contém JSON válido."), { status: 400, code: "INVALID_JSON" });
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("O corpo da solicitação não é válido."), { status: 400, code: "INVALID_BODY" });
  }
}

function clientCookie(request) {
  const match = request.headers.cookie?.match(/(?:^|;\s*)word_game_client=([\da-f-]{36})(?:;|$)/iu);
  if (!match) return null;
  return match[1].toLowerCase();
}

function cookieHeader(request, clientId) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    "set-cookie": `word_game_client=${clientId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`
  };
}

function requestIp(request) {
  return request.socket.remoteAddress || "unknown";
}

function allowRate(request, bucketName, limit, windowMs) {
  const key = `${bucketName}:${requestIp(request)}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    if (!bucket && rateBuckets.size >= MAX_RATE_BUCKETS) {
      rateBuckets.delete(rateBuckets.keys().next().value);
    }
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function pruneSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(sessionId);
  }
  for (const [clientKey, sessionId] of dailyClientSessions) {
    if (!sessions.has(sessionId)) dailyClientSessions.delete(clientKey);
  }
  for (const [clientId, expiresAt] of dailyClients) {
    if (expiresAt <= now) dailyClients.delete(clientId);
  }
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.startedAt > 60 * 60 * 1000) rateBuckets.delete(key);
  }
}

function getSession(sessionId) {
  pruneSessions();
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.expiresAt = Date.now() + SESSION_TTL;
  sessions.delete(sessionId);
  sessions.set(sessionId, session);
  return session;
}

function storeSession(session) {
  pruneSessions();
  while (sessions.size >= MAX_SESSIONS) {
    const oldestSessionId = sessions.keys().next().value;
    sessions.delete(oldestSessionId);
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  sessions.set(session.sessionId, session);
}

function responseForGuess(response, session, payload) {
  const { result, error } = acceptGuess(session, payload.guess, payload.attemptNumber);
  if (error) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message } });
    return;
  }
  sendJson(response, 200, result);
}

async function handleApi(request, response, url) {
  if (!allowRate(request, "api", 180, 60 * 1000)) {
    sendJson(response, 429, { error: { code: "RATE_LIMITED", message: "Muitas solicitações em pouco tempo. Tente novamente em instantes." } });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/v1/daily") {
    const dateKey = dateKeyInSaoPaulo();
    sendJson(response, 200, {
      puzzleId: `d_${dateKey}`,
      dateKey,
      wordLength: 5,
      maxAttempts: 6,
      status: "available",
      timezone: "America/Sao_Paulo",
      nextChallengeAt: nextChallengeAt(dateKey)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/daily/session") {
    const payload = await readJson(request);
    validatePayload(payload);
    const dateKey = dateKeyInSaoPaulo();
    if (payload.dateKey !== dateKey) {
      sendJson(response, 409, { error: { code: "PUZZLE_EXPIRED", message: "O desafio mudou de data. Carregue o desafio atual." } });
      return;
    }
    pruneSessions();
    let clientId = clientCookie(request);
    const newClient = !clientId || !dailyClients.has(clientId);
    if (newClient) clientId = randomUUID();
    if (newClient && !allowRate(request, "new-daily-client", MAX_NEW_CLIENTS_PER_HOUR, 60 * 60 * 1000)) {
      sendJson(response, 429, { error: { code: "RATE_LIMITED", message: "Não foi possível iniciar outra sessão agora. Tente novamente mais tarde." } });
      return;
    }
    if (newClient && dailyClients.size >= MAX_SESSIONS) {
      const oldestClientId = dailyClients.keys().next().value;
      dailyClients.delete(oldestClientId);
      for (const clientKey of dailyClientSessions.keys()) {
        if (clientKey.startsWith(`${oldestClientId}:`)) dailyClientSessions.delete(clientKey);
      }
    }
    dailyClients.set(clientId, Date.now() + SESSION_TTL);
    const cookie = cookieHeader(request, clientId);
    const clientKey = `${clientId}:${dateKey}`;
    const existingId = dailyClientSessions.get(clientKey);
    if (existingId) {
      const existing = getSession(existingId);
      if (existing?.mode === "daily" && existing.dateKey === dateKey) {
        sendJson(response, 200, publicSession(existing));
        return;
      }
    }
    if (typeof payload.sessionId === "string") {
      sendJson(response, 410, {
        error: { code: "SESSION_EXPIRED", message: "A sessão do desafio expirou. Inicie uma nova rodada sem tentativas anteriores." }
      }, cookie);
      return;
    }
    const sessionId = randomUUID();
    const session = createSession(dailyAnswer(dateKey), { mode: "daily", dateKey, sessionId });
    session.clientId = clientId;
    storeSession(session);
    dailyClientSessions.set(clientKey, sessionId);
    sendJson(response, 201, publicSession(session), cookie);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/daily/guess") {
    const payload = await readJson(request);
    validatePayload(payload);
    const clientId = clientCookie(request);
    pruneSessions();
    const candidate = sessions.get(payload.sessionId);
    if (!candidate || candidate.mode !== "daily" || candidate.dateKey !== dateKeyInSaoPaulo() || !clientId || candidate.clientId !== clientId) {
      sendJson(response, 404, { error: { code: "SESSION_NOT_FOUND", message: "A sessão não está disponível. Tente carregar o desafio novamente." } });
      return;
    }
    const session = getSession(payload.sessionId);
    responseForGuess(response, session, payload);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/practice") {
    const sessionId = randomUUID();
    const session = createSession(practiceAnswer(sessionId), { mode: "practice", sessionId });
    if (!allowRate(request, "new-practice-session", 60, 60 * 1000)) {
      sendJson(response, 429, { error: { code: "RATE_LIMITED", message: "Muitas partidas de prática foram abertas. Tente novamente em instantes." } });
      return;
    }
    storeSession(session);
    sendJson(response, 201, publicSession(session));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/v1/practice/session") {
    const payload = await readJson(request);
    validatePayload(payload);
    if (typeof payload.sessionId !== "string" || !/^[\da-f-]{36}$/iu.test(payload.sessionId)) {
      sendJson(response, 400, { error: { code: "INVALID_SESSION", message: "A sessão de prática não é válida." } });
      return;
    }
    const existing = getSession(payload.sessionId);
    if (existing?.mode === "practice") {
      sendJson(response, 200, publicSession(existing));
      return;
    }
    sendJson(response, 410, { error: { code: "SESSION_EXPIRED", message: "A sessão de prática expirou. Inicie uma nova partida." } });
    return;
  }

  const practiceGuess = url.pathname.match(/^\/api\/v1\/practice\/([\da-f-]{36})\/guess$/iu);
  if (request.method === "POST" && practiceGuess) {
    const payload = await readJson(request);
    validatePayload(payload);
    const session = getSession(practiceGuess[1]);
    if (!session || session.mode !== "practice") {
      sendJson(response, 404, { error: { code: "SESSION_NOT_FOUND", message: "A sessão de prática expirou." } });
      return;
    }
    responseForGuess(response, session, payload);
    return;
  }

  sendJson(response, 404, { error: { code: "NOT_FOUND", message: "A rota solicitada não foi encontrada." } });
}

function nextChallengeAt(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1, 3));
  return nextDate.toISOString();
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } });
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, { error: { code: "INVALID_PATH", message: "O caminho solicitado não é válido." } });
    return;
  }
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/u, "");
  const filePath = path.resolve(PUBLIC_DIR, requested);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "O recurso solicitado não foi encontrado." } });
    return;
  }
  let fileStats;
  try {
    fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("O caminho não é um arquivo.");
  } catch {
    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "O recurso solicitado não foi encontrado." } });
    return;
  }
  const headers = {
    "content-type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
    "content-length": fileStats.size,
    "cache-control": path.extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  };
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(await readFile(filePath));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else {
      await serveStatic(request, response, url);
    }
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const code = error.code || "INTERNAL_ERROR";
    const message = status < 500 ? error.message : "Ocorreu um erro inesperado. Tente novamente.";
    sendJson(response, status, { error: { code, message } });
  }
});

server.listen(PORT, () => {
  const address = server.address();
  console.log(`Palavra disponível em http://localhost:${address.port}`);
});
