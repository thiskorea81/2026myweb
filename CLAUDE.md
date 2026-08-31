# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo contains **three copies of the same Vue app**: `my-project`, `my-project-v2`, `my-project-v3`.

- **`my-project/` is the only active codebase.** All real feature work happens here (check `git log -- my-project` for history).
- `my-project-v2` and `my-project-v3` are abandoned early forks/experiments (last touched April 2026) — do not edit them unless the user explicitly asks to work in one of them.
- All commands below assume you are working inside `my-project/`.

## Commands

Run from `my-project/`:

```bash
npm install       # install deps
npm run dev        # start Vite dev server (http://localhost:5173)
npm run build       # production build
npm run preview     # preview a production build locally
```

There is no lint or test tooling configured (no ESLint config, no test runner). Don't invent test/lint commands.

Firebase Cloud Functions live in `my-project/functions/` (separate `package.json`, `npm install` there too). They deploy via the Firebase CLI (`firebase deploy --only functions`); there's no npm script for this in the repo.

### Environment

Requires a `.env` file in `my-project/` (see `README.md` for the full template) with:
- `VITE_FIREBASE_*` — Firebase project config (uses a **named** Firestore database, `"my2026web"`, not the default — see `src/firebase.js`)
- `VITE_GEMINI_API_KEY` — Google Gemini key, used client-side via `@google/genai`
- `VITE_LOGIN_ID` / `VITE_LOGIN_PW` — the single teacher login credential pair (see Auth below)

## Architecture

This is a Korean high-school homeroom/club management tool for teachers, built with **Vue 3 (Composition API, `<script setup>`) + Pinia + Firebase Firestore + Google Gemini**, no backend server except a couple of scheduled Cloud Functions.

### Auth model — not Firebase Auth

There is no real authentication. `Login.vue` compares the entered id/password against `VITE_LOGIN_ID`/`VITE_LOGIN_PW` build-time env vars and sets `localStorage.isLoggedIn = 'true'`. The router guard in `src/router/index.js` checks that flag for any route with `meta: { requiresAuth: true }`. A handful of routes are intentionally public (no `requiresAuth`) because they're student-facing self-service pages that verify identity a different way at the component level (student ID + parent phone digits, etc.) — see `AbsenceReasonView.vue` and `MyGrades.vue`. Firestore security rules, not the frontend, are the real access boundary for those.

### Data layer: Pinia stores wrap Firestore directly

`src/stores/*.js` (studentStore, clubStore, attendanceStore, counselingStore, diaryStore, todoStore, workStore, aiNoteStore) each own one Firestore collection and expose CRUD actions directly on the store — there is no separate repository/API layer. The consistent pattern (see `studentStore.js`):
- Student documents are keyed by `studentId` (student number) as the Firestore doc ID, not an auto-generated ID.
- Every mutating action (`addStudent`, `updateStudent`, `bulkUploadGrades`, etc.) re-runs `fetchStudents()` at the end to refresh local reactive state, rather than mutating local state optimistically.
- Bulk operations use `writeBatch`.
- Errors are caught and `console.error`'d per-store, not surfaced through a shared error-handling layer.

When adding a new persisted feature, follow this same shape: a new store action that talks to Firestore directly, or a new field appended to an existing student document, rather than introducing a service/repository abstraction.

### AI integration: prompts vs. client are split

- `src/services/aiPrompts.js` — pure prompt-string builders plus the Zod schemas (`recordSchema`, `clubSchema`, `announcementSchema`) that describe expected JSON shape. Add new AI features here as a new prompt builder function, not inline in components.
- `src/services/aiService.js` — the actual Gemini client (`@google/genai`). `askText` for free text, `askStructured` for schema-validated JSON (converts the Zod schema via `zod-to-json-schema`, then re-validates the response with `schema.parse`), and `generateSpeech` for TTS (manually wraps returned raw PCM in a WAV header — Gemini TTS returns headerless PCM, not a playable file).
- Components call into `aiService` using prompts from `aiPrompts.js`, and results are typically fed back into the relevant Pinia store to persist.
- Model names are hardcoded in `aiService.js` (`MODEL_NAME`, `TTS_MODEL_NAME`) — check there before assuming which Gemini model is in use, it has been bumped across the project's history.

### Grade data: format-agnostic normalization

Exam score data is pasted in from Excel/Google Forms in inconsistent column-naming formats across different exams (e.g. `한국사` vs `한국사1` vs `한국사(백분율)`). `src/utils/gradeUtils.js` centralizes the alias table (`orderedSubjects`, `summaryItems`) that normalizes and orders any incoming score object into a consistent display order, and strips personal-info-like keys (`성명`, `이름`) that sometimes leak into pasted score data. Any new code that renders or exports grades should go through `getOrderedScores()` rather than iterating `Object.entries(scores)` directly, or subject order/labels will be inconsistent across exams.

### Scheduled server-side AI (Cloud Functions)

`functions/index.js` runs two scheduled functions (`generateMorningBoard` at 18:00 KST for next-day, `generateAfternoonBoard` at 15:00 KST) that auto-generate the class announcement board from tagged `workLogs` entries, calling Gemini server-side with the `firebase-admin` SDK. This duplicates some prompt logic from `aiPrompts.js`/`aiService.js` (the functions runtime can't import the Vite frontend's ES modules) — if you change the shared announcement prompt/format, update both `src/services/aiPrompts.js` (`getBoardPrompt`) and `functions/index.js` (`getBoardPrompt`) to keep them in sync. Class grouping/log matching here works by scanning log text for student names, not IDs, and has explicit handling for duplicate names within a class (`(동명이인)` tagging).

### Routing

`src/router/index.js` is a flat route list (no nested/dynamic route params for students — student identity is passed via store state or query, not URL params). Student-facing public pages (`/absence-reason`, `/my-grades`) are lazy-loaded and deliberately excluded from `requiresAuth`.
