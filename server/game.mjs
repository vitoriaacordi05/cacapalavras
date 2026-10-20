import { createHash } from "node:crypto";
import { ALLOWED_WORDS, DAILY_WORDS } from "./words.mjs";

const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
const DAILY_EPOCH = "2026-01-01";

export function normalizeWord(value) {
  return value.normalize("NFC").toLocaleUpperCase("pt-BR");
}

export function graphemes(value) {
  return Array.from(segmenter.segment(value), (part) => part.segment);
}

export function validateGuess(value) {
  if (typeof value !== "string") {
    return { valid: false, code: "INVALID_WORD", message: "Digite uma palavra válida." };
  }
  const guess = normalizeWord(value.trim());
  if (graphemes(guess).length !== 5) {
    return { valid: false, code: "INVALID_LENGTH", message: "Digite uma palavra com cinco letras." };
  }
  if (!/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]+$/u.test(guess)) {
    return { valid: false, code: "INVALID_WORD", message: "Use apenas letras do português." };
  }
  if (!ALLOWED_WORDS.has(guess)) {
    return { valid: false, code: "INVALID_WORD", message: "Essa palavra não está na lista de palpites." };
  }
  return { valid: true, guess };
}

export function evaluateGuess(guessValue, answerValue) {
  const guess = graphemes(normalizeWord(guessValue));
  const answer = graphemes(normalizeWord(answerValue));
  if (guess.length !== 5 || answer.length !== 5) {
    throw new RangeError("A avaliação exige um palpite e uma resposta de cinco letras.");
  }

  const tiles = Array(guess.length).fill("absent");
  const remaining = new Map();
  for (let index = 0; index < guess.length; index += 1) {
    if (guess[index] === answer[index]) {
      tiles[index] = "correct";
    } else {
      remaining.set(answer[index], (remaining.get(answer[index]) || 0) + 1);
    }
  }
  for (let index = 0; index < guess.length; index += 1) {
    if (tiles[index] === "correct") continue;
    const available = remaining.get(guess[index]) || 0;
    if (available > 0) {
      tiles[index] = "present";
      remaining.set(guess[index], available - 1);
    }
  }
  return tiles;
}

function daysSinceEpoch(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [epochYear, epochMonth, epochDay] = DAILY_EPOCH.split("-").map(Number);
  const date = Date.UTC(year, month - 1, day);
  const epoch = Date.UTC(epochYear, epochMonth - 1, epochDay);
  return Math.floor((date - epoch) / 86_400_000);
}

export function dailyAnswer(dateKey) {
  const index = ((daysSinceEpoch(dateKey) % DAILY_WORDS.length) + DAILY_WORDS.length) % DAILY_WORDS.length;
  return DAILY_WORDS[index];
}

export function dateKeyInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function practiceAnswer(practiceId) {
  const digest = createHash("sha256").update(practiceId).digest();
  const index = digest.readUInt32BE(0) % DAILY_WORDS.length;
  return DAILY_WORDS[index];
}

export function createSession(answer, { mode, dateKey, sessionId }) {
  return {
    sessionId,
    mode,
    dateKey,
    answer,
    status: "in-progress",
    guesses: []
  };
}

export function publicSession(session) {
  const result = {
    sessionId: session.sessionId,
    mode: session.mode,
    dateKey: session.dateKey,
    status: session.status,
    guesses: session.guesses.map(({ guess, tiles }) => ({ guess, tiles }))
  };
  if (session.status !== "in-progress") result.answer = session.answer;
  return result;
}

export function acceptGuess(session, rawGuess, attemptNumber) {
  const validation = validateGuess(rawGuess);
  if (!validation.valid) {
    return { error: { status: 422, code: validation.code, message: validation.message } };
  }
  if (Number.isInteger(attemptNumber) && attemptNumber <= session.guesses.length) {
    const priorGuess = session.guesses[attemptNumber - 1];
    if (priorGuess?.guess === validation.guess) {
      return { result: publicSession(session), acceptedGuess: priorGuess.guess, duplicate: true };
    }
    return { error: { status: 409, code: "INVALID_ATTEMPT", message: "A sequência de tentativas não é válida." } };
  }
  if (session.status !== "in-progress") {
    return { error: { status: 409, code: "PUZZLE_CLOSED", message: "Esta partida já terminou." } };
  }
  if (attemptNumber !== session.guesses.length + 1 || attemptNumber > 6) {
    return { error: { status: 409, code: "INVALID_ATTEMPT", message: "A sequência de tentativas não é válida." } };
  }

  const tiles = evaluateGuess(validation.guess, session.answer);
  session.guesses.push({ guess: validation.guess, tiles });
  if (validation.guess === session.answer) {
    session.status = "won";
  } else if (session.guesses.length === 6) {
    session.status = "lost";
  }
  return { result: publicSession(session), acceptedGuess: validation.guess };
}
