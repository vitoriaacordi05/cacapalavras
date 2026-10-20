import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_WORDS, DAILY_WORDS } from "../server/words.mjs";
import {
  acceptGuess,
  createSession,
  dailyAnswer,
  dateKeyInSaoPaulo,
  evaluateGuess,
  graphemes,
  normalizeWord,
  practiceAnswer,
  publicSession,
  validateGuess
} from "../server/game.mjs";

test("all curated words and daily answers contain five Portuguese graphemes", () => {
  for (const word of ALLOWED_WORDS) {
    assert.equal(graphemes(word).length, 5, `${word} should have five graphemes`);
    assert.match(word, /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]+$/u);
  }
  for (const word of DAILY_WORDS) assert.ok(ALLOWED_WORDS.has(word), `${word} must be an accepted guess`);
});

test("canonical Unicode composition preserves accents while comparing", () => {
  assert.equal(normalizeWord("a\u0303gua"), "ÃGUA");
  assert.deepEqual(evaluateGuess("MELAO", "MELÃO"), ["correct", "correct", "correct", "absent", "correct"]);
  assert.equal(validateGuess("MELAO").valid, false);
  assert.equal(validateGuess("MELÃO").valid, true);
});

test("repeated letters do not produce excess present feedback", () => {
  assert.deepEqual(evaluateGuess("SSSSS", "CASAS"), ["absent", "absent", "correct", "absent", "correct"]);
  assert.deepEqual(evaluateGuess("MIMOS", "LIMÃO"), ["absent", "correct", "correct", "present", "absent"]);
});

test("guess validation rejects wrong lengths and unknown words", () => {
  assert.equal(validateGuess("CASA").code, "INVALID_LENGTH");
  assert.equal(validateGuess("CASAS!").code, "INVALID_LENGTH");
  assert.equal(validateGuess("ZZZZZ").code, "INVALID_WORD");
  assert.equal(validateGuess("LIMÃO").valid, true);
});

test("daily puzzles are deterministic by date and practice answer is deterministic per id", () => {
  assert.equal(dailyAnswer("2026-10-20"), dailyAnswer("2026-10-20"));
  assert.ok(DAILY_WORDS.includes(dailyAnswer("2026-10-20")));
  assert.equal(practiceAnswer("same-practice-id"), practiceAnswer("same-practice-id"));
  assert.ok(DAILY_WORDS.includes(practiceAnswer("same-practice-id")));
});

test("daily date key uses the configured Sao Paulo day", () => {
  assert.equal(dateKeyInSaoPaulo(new Date("2026-10-20T02:59:00.000Z")), "2026-10-19");
  assert.equal(dateKeyInSaoPaulo(new Date("2026-10-20T03:00:00.000Z")), "2026-10-20");
});

test("session accepts valid guesses only, closes at six, and reveals answer only when finished", () => {
  const session = createSession("LIMÃO", { mode: "daily", dateKey: "2026-10-20", sessionId: "session" });
  assert.equal("answer" in publicSession(session), false);
  assert.equal(acceptGuess(session, "CASA", 1).error.code, "INVALID_LENGTH");
  assert.equal(session.guesses.length, 0);
  assert.equal(acceptGuess(session, "LIMPO", 2).error.code, "INVALID_ATTEMPT");
  assert.equal(acceptGuess(session, "LIMPO", 1).result.status, "in-progress");
  assert.equal("answer" in publicSession(session), false);
  assert.equal(acceptGuess(session, "LIMPO", 1).result.guesses.length, 1);
  assert.equal(acceptGuess(session, "LIMÃO", 2).result.status, "won");
  assert.equal(publicSession(session).answer, "LIMÃO");
  assert.equal(acceptGuess(session, "LIMÃO", 2).result.status, "won");
  assert.equal(acceptGuess(session, "LIMÃO", 3).error.code, "PUZZLE_CLOSED");
});

test("six accepted incorrect guesses close a game and reveal its answer", () => {
  const session = createSession("LIMÃO", { mode: "daily", dateKey: "2026-10-20", sessionId: "lost-session" });
  const wrongGuesses = [...ALLOWED_WORDS].filter((word) => word !== session.answer).slice(0, 6);
  assert.equal(wrongGuesses.length, 6);
  for (const [index, guess] of wrongGuesses.entries()) {
    const { result, error } = acceptGuess(session, guess, index + 1);
    assert.equal(error, undefined);
    if (index < 5) {
      assert.equal(result.status, "in-progress");
      assert.equal("answer" in result, false);
    }
  }
  assert.equal(session.status, "lost");
  assert.equal(publicSession(session).answer, "LIMÃO");
});
