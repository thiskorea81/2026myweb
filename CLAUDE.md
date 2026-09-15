# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo contains **three copies of the same Vue app**: `my-project`, `my-project-v2`, `my-project-v3`.

- **`my-project/` is the only active codebase.** All real feature work happens here (check `git log -- my-project` for history).
- `my-project-v2` and `my-project-v3` are abandoned early forks/experiments (last touched April 2026) — do not edit them unless the user explicitly asks to work in one of them.
- All commands below assume you are working inside `my-project/`.
- **This file lives at the repo root, not inside any of the three copies.** If you are ever asked to work in `my-project-v2/` or `my-project-v3/`, this same `CLAUDE.md` (one level up) is still the reference for architecture, auth model, and data-access conventions described below — those forks share `my-project`'s original design even though they've since diverged. Don't assume a copy-specific CLAUDE.md exists or needs to be created; there is only this one.

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

### Auth model — real Firebase Auth (single shared teacher account)

As of the 2026-09-02 "wire teacher login to real Firebase Auth" change, login is a real `signInWithEmailAndPassword` call against Firebase Auth, not a client-side string comparison. There's still only one teacher account, shared by whoever is using the app — there's no per-teacher identity or signup flow.

- `src/firebase.js` initializes `auth` via `getAuth(app)` and exports `toLoginEmail(id)`, which appends a fixed fake domain (`@2026myweb.local`) to turn the non-email login ID into something Firebase Auth accepts as an email.
- `Login.vue` calls `signInWithEmailAndPassword(auth, toLoginEmail(id), pw)`. On success it also sets `localStorage.isLoggedIn = 'true'`. On failure it shows a generic "아이디 또는 비밀번호가 일치하지 않습니다" alert — it does not distinguish wrong-password from user-not-found.
- **The actual credential now lives in the Firebase Auth user record (created once via the Firebase console/Admin SDK), not in `.env`.** `VITE_LOGIN_ID`/`VITE_LOGIN_PW` still belong in `.env`, but they're only consumed by standalone Node scripts under `scripts/*.mjs` (see below) that need to sign in outside the Vue app — the app itself no longer reads them.
- `App.vue` calls `signOut(auth)` (alongside clearing the `isLoggedIn` flag) both on manual logout and on idle-timeout logout.
- **The router guard is still localStorage-only.** `src/router/index.js`'s `beforeEach` checks `localStorage.getItem('isLoggedIn') === 'true'` for any route with `meta: { requiresAuth: true }` — it does not check `auth.currentUser`/`onAuthStateChanged`. Route gating is therefore only a UX convenience; it is not the security boundary. The real boundary is Firestore security rules evaluating `request.auth` server-side (see Database access below) — a signed-in Firebase Auth session is what actually lets Firestore reads/writes through, regardless of what the router allows.
- A handful of routes are intentionally public (no `requiresAuth`) because they're student/parent-facing self-service pages that verify identity a different way at the component level (student ID + parent phone digits, etc.) — see `AbsenceReasonView.vue`, `MyGrades.vue`, and `CheheomView.vue`. These pages' Firestore access is scoped by rules that allow narrow, unauthenticated reads/writes for those specific collections/fields, not by the app.

### Data layer: Pinia stores wrap Firestore directly

`src/stores/*.js` (studentStore, clubStore, attendanceStore, counselingStore, diaryStore, todoStore, workStore, aiNoteStore) each own one Firestore collection and expose CRUD actions directly on the store — there is no separate repository/API layer. The consistent pattern (see `studentStore.js`):
- Student documents are keyed by `studentId` (student number) as the Firestore doc ID, not an auto-generated ID.
- Every mutating action (`addStudent`, `updateStudent`, `bulkUploadGrades`, etc.) re-runs `fetchStudents()` at the end to refresh local reactive state, rather than mutating local state optimistically.
- Bulk operations use `writeBatch`.
- Errors are caught and `console.error`'d per-store, not surfaced through a shared error-handling layer.

When adding a new persisted feature, follow this same shape: a new store action that talks to Firestore directly, or a new field appended to an existing student document, rather than introducing a service/repository abstraction.

### Database access — full picture

All persistent data lives in one Firestore database, reached two ways:

1. **From the Vue app** — via the `src/stores/*.js` Pinia stores described above.
2. **From standalone Node scripts** — `scripts/*.mjs` (e.g. `generate_daily_todos.mjs`, `seed_creative_activity_schedule.mjs`, `add_elective_choice_final_counseling.mjs`, `process_cheheom_submissions.mjs`), run manually or via a Windows Task Scheduler job (see each script's own header comment / `run_daily_todos.ps1`). These run outside Vite via plain `node --env-file=.env scripts/<name>.mjs`, so they can't import `src/firebase.js`'s module — each one re-declares its own `initializeApp` / `getFirestore(app, "my2026web")` and repeats the app's `toLoginEmail(id)` + `signInWithEmailAndPassword` sign-in, reading the credential from `VITE_LOGIN_ID`/`VITE_LOGIN_PW` in `.env` (the app itself no longer reads those two vars — see Auth model above). Follow this same self-contained pattern for new one-off scripts rather than trying to share code with `src/`.

**Named database, always.** `getFirestore(app, "my2026web")` explicitly targets a database named `my2026web`, not Firestore's default database. Any script, Cloud Function, or ad-hoc Admin SDK snippet touching this project's data must pass that same name — a bare `getFirestore(app)` silently points at a different (default, effectively empty) database and will look like the data disappeared.

**Collections in use**, one per Pinia store per the pattern above: `students`, `clubStudents`, `attendanceLogs`, `counselingLogs`, `diaries`, `todos`, `workLogs`, `aiNotes`, `creativeActivitySchedule`. `students` also has related sub-collections for per-student records that don't fit a flat document.

**Security boundary**: Firestore security rules — not the frontend, and not the router guard — are what actually gate access (see Auth model above). Rules are managed directly in the Firebase console/CLI for this project and **are not checked into this repo** (no `firestore.rules` file here) — don't assume any file in this repo reflects current rules; check the Firebase console.

**Don't write a full field-level schema doc into a tracked file.** A `docs/student-data.md` reference (complete `students` field list — phone, parent phone, address, birth date, teacher notes — plus exact sub-collection and `clubStudents`-split read/write paths) existed briefly and was deliberately deleted and gitignored (commit `d3bdd1b`, "remove student schema doc from public repo") because this repo has no auth layer protecting it from casual exposure. If similar field-by-field detail is needed, read the relevant store/component directly rather than re-documenting it in `CLAUDE.md` or any other file that gets committed.

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

`src/router/index.js` is a flat route list (no nested/dynamic route params for students — student identity is passed via store state or query, not URL params). Student/parent-facing public pages (`/absence-reason`, `/my-grades`, `/cheheom`) are lazy-loaded and deliberately excluded from `requiresAuth`.
