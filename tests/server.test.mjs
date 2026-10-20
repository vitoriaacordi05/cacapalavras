import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { DAILY_WORDS } from "../server/words.mjs";
import { dailyAnswer } from "../server/game.mjs";

let child;
let baseUrl;
let serverOutput = "";

async function findFreePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server stopped: ${serverOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server did not start: ${serverOutput}`);
}

before(async () => {
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { serverOutput += chunk; });
  child.stderr.on("data", (chunk) => { serverOutput += chunk; });
  await waitForServer(`${baseUrl}/`);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
});

test("server serves the game but does not publish private server word files", async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/u);
  assert.match(await page.text(), /Desafio de hoje/u);

  const privateWords = await fetch(`${baseUrl}/server/words.mjs`);
  assert.equal(privateWords.status, 404);
});

test("daily API keeps the answer private until a terminal game state", async () => {
  const dailyResponse = await fetch(`${baseUrl}/api/v1/daily`);
  const daily = await dailyResponse.json();
  assert.equal(daily.timezone, "America/Sao_Paulo");
  assert.equal("answer" in daily, false);

  const forgedRecovery = await fetch(`${baseUrl}/api/v1/daily/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dateKey: daily.dateKey, guesses: [dailyAnswer(daily.dateKey)] })
  });
  const forgedSession = await forgedRecovery.json();
  assert.equal(forgedSession.status, "in-progress");
  assert.equal(forgedSession.guesses.length, 0);
  assert.equal("answer" in forgedSession, false);
  assert.match(forgedRecovery.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/u);

  const openedResponse = await fetch(`${baseUrl}/api/v1/daily/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dateKey: daily.dateKey })
  });
  const opened = await openedResponse.json();
  const dailyCookie = openedResponse.headers.get("set-cookie").split(";")[0];
  assert.equal(opened.status, "in-progress");
  assert.equal("answer" in opened, false);

  const invalidResponse = await fetch(`${baseUrl}/api/v1/daily/guess`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: dailyCookie },
    body: JSON.stringify({ sessionId: opened.sessionId, attemptNumber: 1, guess: "CASA" })
  });
  assert.equal(invalidResponse.status, 422);
  assert.equal((await invalidResponse.json()).error.code, "INVALID_LENGTH");

  const wrongGuess = DAILY_WORDS.find((word) => word !== dailyAnswer(daily.dateKey));
  const firstGuessResponse = await fetch(`${baseUrl}/api/v1/daily/guess`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: dailyCookie },
    body: JSON.stringify({ sessionId: opened.sessionId, attemptNumber: 1, guess: wrongGuess })
  });
  const firstGuess = await firstGuessResponse.json();
  assert.equal(firstGuess.status, "in-progress");
  assert.equal("answer" in firstGuess, false);

  const resumedResponse = await fetch(`${baseUrl}/api/v1/daily/session`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: dailyCookie },
    body: JSON.stringify({ dateKey: daily.dateKey, sessionId: opened.sessionId })
  });
  const resumed = await resumedResponse.json();
  assert.equal(resumed.sessionId, opened.sessionId);
  assert.equal(resumed.guesses.length, 1);

  const winningResponse = await fetch(`${baseUrl}/api/v1/daily/guess`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: dailyCookie },
    body: JSON.stringify({
      sessionId: opened.sessionId,
      attemptNumber: 2,
      guess: dailyAnswer(daily.dateKey)
    })
  });
  const won = await winningResponse.json();
  assert.equal(won.status, "won");
  assert.equal(won.answer, dailyAnswer(daily.dateKey));
});

test("practice session can be resumed by id and enforces attempt order", async () => {
  const createResponse = await fetch(`${baseUrl}/api/v1/practice`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const created = await createResponse.json();
  assert.equal(created.status, "in-progress");
  assert.equal("answer" in created, false);
  assert.ok(DAILY_WORDS.includes(dailyAnswer("2026-10-20")));

  const resumedResponse = await fetch(`${baseUrl}/api/v1/practice/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: created.sessionId, guesses: [] })
  });
  const resumed = await resumedResponse.json();
  assert.equal(resumed.sessionId, created.sessionId);
  assert.deepEqual(resumed.guesses, []);

  const outOfOrder = await fetch(`${baseUrl}/api/v1/practice/${created.sessionId}/guess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ guess: DAILY_WORDS[0], attemptNumber: 2 })
  });
  assert.equal(outOfOrder.status, 409);

  const expired = await fetch(`${baseUrl}/api/v1/practice/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000000" })
  });
  assert.equal(expired.status, 410);
});
