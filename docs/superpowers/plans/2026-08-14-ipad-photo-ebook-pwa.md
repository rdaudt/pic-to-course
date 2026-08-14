# iPad Photo Ebook PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish an offline iPad PWA that captures one photograph per ebook page, autosaves and organizes local projects, and shares high-quality PDFs.

**Architecture:** A React/TypeScript SPA separates library, editor, camera, persistence, image processing, and export modules. Dexie owns IndexedDB transactions, the service worker caches only the app shell, and PDF export reads full images sequentially to control memory.

**Tech Stack:** Vite 7, React 19, TypeScript, Dexie, pdf-lib, @dnd-kit, vite-plugin-pwa, Vitest, Testing Library, fake-indexeddb, Playwright, GitHub Actions, GitHub Pages.

## Global Constraints

- Target first-generation 11-inch iPad Pro running iPadOS 26.5.
- Work offline after the first successful load; no accounts, server, or cloud sync.
- Every successfully stored shot creates one page at the ebook's end.
- Autosave every mutation; never offer Save/Discard.
- Use a fixed high-quality image profile and discard the original after commit.
- Support 30–100 pages and natural-aspect-ratio PDF pages.
- Share PDFs through Web Share with a download fallback; retain no PDF copy.
- Use large touch targets in portrait and landscape.
- Deploy from `https://github.com/rdaudt/pic-to-course` to `https://rdaudt.github.io/pic-to-course/`.

## Planned file structure

```text
.github/workflows/deploy.yml         GitHub Pages deployment
index.html, package.json             application entry and scripts
vite.config.ts                       React, tests, base path, PWA manifest
src/app/                             routing, update UI, shared styles
src/domain/models.ts                 stable Ebook/Page types
src/db/database.ts                   Dexie schema and transactional API
src/image/processImage.ts            resize, orientation, encoding, thumbnails
src/storage/storageHealth.ts         persistence request and quota warnings
src/library/LibraryScreen.tsx        ebook management
src/editor/EditorScreen.tsx          thumbnail grid and page actions
src/camera/CameraScreen.tsx          permission and sequential capture
src/export/createPdf.ts              sequential natural-size PDF builder
src/export/ExportScreen.tsx          progress, cancellation, share fallback
src/**/*.test.ts(x)                  unit and integration coverage
tests/ebook-flow.spec.ts             Playwright user workflow
public/icons/                        regular and maskable PWA icons
README.md                            installation, warnings, development
```

---

### Task 1: Repository and installable shell

**Files:**
- Create: `package.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/app/App.tsx`, `src/app/styles.css`, `src/test/setup.ts`, `src/app/App.test.tsx`, `public/icons/*.png`

**Interfaces:**
- Produces: `App(): JSX.Element`; scripts `dev`, `build`, `test:run`, `e2e`; manifest and service worker scoped to `/pic-to-course/`.

- [ ] **Step 1: Initialize and install dependencies**

```powershell
git init
git branch -M main
git remote add origin https://github.com/rdaudt/pic-to-course.git
npm init -y
npm install react react-dom dexie pdf-lib @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -D vite typescript @vitejs/plugin-react vite-plugin-pwa vitest jsdom fake-indexeddb @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: initialization and installation succeed.

- [ ] **Step 2: Write the failing shell test**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';
it('opens on the library', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'My ebooks' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'New ebook' })).toBeVisible();
});
```

- [ ] **Step 3: Verify RED**

Run: `npm run test:run -- src/app/App.test.tsx`
Expected: FAIL because App/test configuration is absent.

- [ ] **Step 4: Implement shell and configuration**

Set Vite `base: '/pic-to-course/'`; configure React, jsdom Vitest, and `VitePWA({registerType:'prompt'})` with standalone display, any orientation, regular/maskable icons, and theme/background colors. Implement:

```tsx
export function App() {
  return <main className="app"><h1>My ebooks</h1><button type="button">New ebook</button></main>;
}
```

Set 48px minimum controls and responsive spacing; create matching 192px/512px icons.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:run && npm run build`
Expected: PASS and generated manifest/service worker.
Commit: `git add . && git commit -m "chore: scaffold offline photo ebook PWA"`

---

### Task 2: Domain model and atomic persistence

**Files:**
- Create: `src/domain/models.ts`, `src/db/database.ts`, `src/db/database.test.ts`

**Interfaces:**
- Produces: `EbookRecord`, `PageRecord`, `PageAsset`; `createEbook`, `listEbooks`, `renameEbook`, `appendPage`, `reorderPages`, `rotatePage`, `deletePage`, `deleteEbook`.

- [ ] **Step 1: Write failing tests**

Using fake-indexeddb, assert blank-title rejection; newest-first books; atomic append; rejection of missing/foreign reorder IDs; rotation `0→90→180→270→0`; page deletion removes blob and ID; ebook deletion removes owned pages.

```ts
const book = await createEbook('Field Notes');
const page = await appendPage(book.id, asset);
expect((await db.ebooks.get(book.id))?.pageIds).toEqual([page.id]);
expect(await db.pages.get(page.id)).toMatchObject({ ebookId: book.id, rotation: 0 });
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- src/db/database.test.ts`
Expected: FAIL with missing database API.

- [ ] **Step 3: Implement types and transactions**

```ts
export type Rotation = 0|90|180|270;
export interface EbookRecord { id:string; title:string; createdAt:number; updatedAt:number; pageIds:string[] }
export interface PageRecord { id:string; ebookId:string; imageBlob:Blob; thumbnailBlob:Blob; width:number; height:number; rotation:Rotation; capturedAt:number }
export type PageAsset = Pick<PageRecord,'imageBlob'|'thumbnailBlob'|'width'|'height'>;
```

Use Dexie stores `ebooks: '&id, updatedAt'` and `pages: '&id, ebookId, capturedAt'`. Implement every mutation in `db.transaction('rw', ...)`, with `crypto.randomUUID()`, trimmed-title and ownership validation, and one `updatedAt` write.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/db/database.test.ts`
Expected: PASS.
Commit: `git add src/domain src/db && git commit -m "feat: add atomic local ebook storage"`

---

### Task 3: Image processing and storage health

**Files:**
- Create: `src/image/processImage.ts`, `src/image/processImage.test.ts`, `src/storage/storageHealth.ts`, `src/storage/storageHealth.test.ts`

**Interfaces:**
- Produces: `processCapturedImage(source:Blob):Promise<PageAsset>`; `requestPersistentStorage():Promise<boolean|undefined>`; `getStorageHealth():Promise<{usage?:number;quota?:number;free?:number;level:'ok'|'warning'|'critical'|'unknown'}>`.

- [ ] **Step 1: Write failing policy tests**

Assert full longest edge ≤2400px at JPEG quality 0.86; thumbnail ≤360px at 0.76; dimensions honor decoded orientation; source is not returned. Assert warning below 200MB free, critical below 50MB, ok otherwise, unknown without APIs.

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- src/image src/storage`
Expected: FAIL with missing modules.

- [ ] **Step 3: Implement processing with Safari fallback**

```ts
const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
const width = Math.round(bitmap.width * scale);
const height = Math.round(bitmap.height * scale);
```

Decode via `createImageBitmap(blob,{imageOrientation:'from-image'})`. Encode full and thumbnail canvases; feature-detect OffscreenCanvas and fall back to HTML canvas/`toBlob`; close bitmap in `finally`. Feature-detect `navigator.storage.persist/estimate`.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/image src/storage`
Expected: PASS.
Commit: `git add src/image src/storage && git commit -m "feat: process captures and monitor storage"`

---

### Task 4: Ebook library

**Files:**
- Create: `src/library/LibraryScreen.tsx`, `src/library/LibraryScreen.test.tsx`, `src/app/SaveStatus.tsx`
- Modify: `src/app/App.tsx`, `src/app/styles.css`

**Interfaces:**
- Consumes: Task 2 persistence API.
- Produces: `LibraryScreen({onOpen}:{onOpen:(id:string)=>void})`; create, rename, delete dialogs.

- [ ] **Step 1: Write failing UI tests**

Test required trimmed titles; newest-first cards showing first-page cover, count, and date; open/rename; confirmed/cancelled deletion; local-data-loss notice.

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- src/library`
Expected: FAIL with missing component.

- [ ] **Step 3: Implement library and routing**

```ts
type Route = {screen:'library'} | {screen:'editor';ebookId:string} |
 {screen:'camera';ebookId:string} | {screen:'export';ebookId:string};
```

Use accessible dialogs and forms, `role="alert"` errors, object URLs for covers with cleanup, and refresh after successful mutations.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/library src/app/App.test.tsx`
Expected: PASS.
Commit: `git add src/app src/library && git commit -m "feat: manage local ebook library"`

---

### Task 5: Page manager

**Files:**
- Create: `src/editor/EditorScreen.tsx`, `src/editor/PageGrid.tsx`, `src/editor/EditorScreen.test.tsx`
- Modify: `src/app/App.tsx`, `src/app/styles.css`

**Interfaces:**
- Produces: `EditorScreen({ebookId,onClose,onCapture,onExport})`.

- [ ] **Step 1: Write failing editor tests**

Assert pageIds ordering, first-page cover label, dedicated-handle drag reorder, rotate visualization, confirmed delete, Close disabled during mutation, and capture/export navigation.

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- src/editor`
Expected: FAIL.

- [ ] **Step 3: Implement editor**

Use DndContext/SortableContext/arrayMove with activation on labelled handles. Wrap awaited mutations with `isSaving`, expose `aria-live="polite"` Saving…/Saved, revoke thumbnail URLs, and rotate inside a fixed viewport.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/editor`
Expected: PASS.
Commit: `git add src/editor src/app && git commit -m "feat: organize ebook pages"`

---

### Task 6: Sequential camera capture

**Files:**
- Create: `src/camera/CameraScreen.tsx`, `src/camera/captureFrame.ts`, `src/camera/CameraScreen.test.tsx`
- Modify: `src/app/App.tsx`, `src/app/styles.css`

**Interfaces:**
- Consumes: `processCapturedImage`, `appendPage`, `getStorageHealth`.
- Produces: `CameraScreen({ebookId,onClose})`; `captureFrame(video):Promise<Blob>`.

- [ ] **Step 1: Write failing state tests**

Mock getUserMedia, frame capture, processing, and persistence. Test environment camera constraints, denied permission guidance, sequential Capture disablement, counter only after append resolves, critical-storage blocking, retry after failure, Close waiting for save, and track cleanup.

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- src/camera`
Expected: FAIL.

- [ ] **Step 3: Implement capture**

```ts
await navigator.mediaDevices.getUserMedia({
 audio:false,
 video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1440}}
});
```

Draw the video frame to canvas, transiently encode JPEG 0.95, then process and append. Disable Capture through the chain, stop tracks on unmount, never store the transient source, and show actionable NotAllowedError/iPad Settings guidance.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/camera`
Expected: PASS.
Commit: `git add src/camera src/app && git commit -m "feat: capture consecutive ebook pages"`

---

### Task 7: PDF export and sharing

**Files:**
- Create: `src/export/createPdf.ts`, `src/export/createPdf.test.ts`, `src/export/ExportScreen.tsx`, `src/export/ExportScreen.test.tsx`
- Modify: `src/app/App.tsx`, `src/app/styles.css`

**Interfaces:**
- Produces: `createPdf(ebook,{signal,onProgress}):Promise<Blob>`; `ExportScreen({ebookId,onClose})`.

- [ ] **Step 1: Write failing export tests**

Using distinct tiny JPEG fixtures, assert order; natural dimensions at 72 points per 96 pixels; width/height swap for 90/270; progress 1..N; AbortError cancellation; file sharing only when canShare; download fallback and URL cleanup.

- [ ] **Step 2: Verify RED**

Run: `npm run test:run -- src/export`
Expected: FAIL.

- [ ] **Step 3: Implement sequential export**

```ts
const points = (pixels:number) => pixels * 72 / 96;
const rotated = page.rotation === 90 || page.rotation === 270;
const pdfPage = pdf.addPage([
 points(rotated ? page.height : page.width),
 points(rotated ? page.width : page.height)
]);
```

Load/embed one page at a time, apply matching pdf-lib degree/translation transform, release each record before the next, check AbortSignal between pages, report progress, create an application/pdf Blob, share a sanitized filename, and offer a temporary download fallback.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run -- src/export`
Expected: PASS.
Commit: `git add src/export src/app && git commit -m "feat: export ebooks through iPad share sheet"`

---

### Task 8: End-to-end delivery and GitHub Pages

**Files:**
- Create: `playwright.config.ts`, `tests/ebook-flow.spec.ts`, `.github/workflows/deploy.yml`, `README.md`
- Modify: `src/app/App.tsx`, `vite.config.ts`

**Interfaces:**
- Produces: full routed PWA, safe update prompt, CI verification, Pages deployment.

- [ ] **Step 1: Write failing browser workflows**

Test create/close/reopen; inject three deterministic test-mode capture assets; reorder, rotate, delete, reload and verify persistence. Build/load once, set context offline, reload, and find My ebooks.

- [ ] **Step 2: Verify RED**

Run: `npm run build && npm run e2e`
Expected: FAIL until test-mode capture adapter, update prompt, and Playwright web server are wired.

- [ ] **Step 3: Finish integration and docs**

Wire all four routes. Request persistent storage after a user gesture. Offer service-worker updates only in the library. Document Home Screen installation, permissions, offline use, PDF sharing, permanent local-data-loss warning, commands, and deployment URL.

- [ ] **Step 4: Configure deployment**

Add a main-push workflow with Pages write/id-token permissions, concurrency `pages`, Node setup, `npm ci`, unit tests, build, upload-pages-artifact, and deploy-pages.

- [ ] **Step 5: Verify everything**

```powershell
npm run test:run
npm run build
npm run e2e
git status --short
```

Expected: all tests PASS, build succeeds, workflows pass, only intended files remain.

- [ ] **Step 6: Commit, push, and verify**

```powershell
git add .
git commit -m "feat: deliver offline iPad photo ebook PWA"
git push -u origin main
gh run watch --exit-status
```

Expected: push and Pages workflow succeed; deployed URL launches.

- [ ] **Step 7: Physical-iPad acceptance**

Run all nine target-device checks in the design spec. Record iPad-only defects as GitHub issues. Do not claim camera, 100-page memory behavior, persistent storage, or Files/Books sharing verified until this pass is performed.

