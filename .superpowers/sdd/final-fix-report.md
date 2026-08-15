# Final Review Fix Report

## Outcome

Status: **DONE_WITH_CONCERNS**

Implementation commit: `b499a55 fix: bound PDF export and harden iPad workflows`

The final review blockers are resolved in code and automated tests. Physical-iPad resource use, camera permission UI, native share destinations, and actual Safari/PWA lifecycle behavior remain target-device acceptance work; desktop automation cannot establish those claims.

## What changed

### Bounded JPEG-to-PDF export

- Replaced production `pdf-lib` generation with a minimal browser PDF 1.7 writer in `src/export/createPdf.ts`.
- Reads `pageIds` serially from IndexedDB and emits one page's objects at a time.
- Retains each stored JPEG as a `Blob` part in the composite output rather than calling `arrayBuffer()`, decoding JPEGs, retaining pdf-lib image objects, or slicing a second monolithic output buffer.
- Emits catalog, page tree, page, DCT image, and content-stream objects plus a classic byte-accurate xref table, trailer, and `startxref`.
- Preserves natural point sizing and explicit 0/90/180/270 transforms.
- Preserves page order, progress callbacks, `AbortError`, missing-page validation, and a read-only database contract.
- Moved `pdf-lib` from runtime dependencies to dev dependencies; it remains an independent parser in tests.

Files:

- `src/export/createPdf.ts`
- `src/export/createPdf.test.ts`
- `package.json`
- `package-lock.json`

### Persistent download fallback and share lifecycle

- Replaced the hidden synchronous click/revoke fallback with a visible `Download PDF` anchor.
- Keeps the object URL live until a replacement PDF is ready or the export screen unmounts, then revokes exactly that URL.
- Reuses the same fallback URL for the same retained PDF.
- Creates the visible fallback after unavailable or failed native sharing.
- Disables and guards Back during non-cancelable native sharing.
- Guards export/share continuations against post-unmount React updates.
- Keeps the previous PDF/link available while a replacement is still generating.

Files:

- `src/export/ExportScreen.tsx`
- `src/export/ExportScreen.test.tsx`
- `src/app/styles.css`

### Browser workflow and deterministic assets

- The full-size deterministic capture asset is now a structurally valid JPEG whose encoded dimensions match its page metadata.
- Deterministic SVG thumbnail identity remains available for order assertions.
- Playwright now covers library rename, confirms stored full images are JPEGs, generates and downloads the actual application PDF, parses the PDF, asserts page/image counts, and verifies its sanitized renamed filename.
- Playwright cancellation uses 30 actual JPEG-backed IndexedDB pages and clicks the real Cancel control immediately when React renders it; it adds no production-only export hook or delay.
- Cancellation verifies no fallback is produced and the complete editable page sequence/rotations remain unchanged.

Files:

- `src/camera/testCaptureAdapter.ts`
- `src/camera/testCaptureAdapter.test.ts`
- `tests/ebook-flow.spec.ts`

### Minor review fixes

- Quarter-turned editor thumbnails scale into their fixed viewport.
- Rotated library covers use their stored rotation and a fixed clipped viewport.
- Forward SPA navigation focuses the new screen heading; intentional returns focus the originating editor action or ebook Open button.
- The existing service-worker update prompt remains restricted to the safe library route, with its existing route-gating test; no update activation was added to capture/export routes.
- Official GitHub actions are pinned to immutable SHAs resolved directly from each official repository's current major tag.

Files:

- `src/editor/PageGrid.tsx`
- `src/editor/EditorScreen.tsx`
- `src/editor/EditorScreen.test.tsx`
- `src/library/LibraryScreen.tsx`
- `src/library/LibraryScreen.test.tsx`
- `src/camera/CameraScreen.tsx`
- `src/camera/CameraScreen.test.tsx`
- `src/app/App.tsx`
- `src/app/App.camera.test.tsx`
- `.github/workflows/deploy.yml`

Verified official tag resolutions on 2026-08-14:

```text
actions/checkout v4              11d5960a326750d5838078e36cf38b85af677262
actions/setup-node v4            49933ea5288caeca8642d1e84afbd3f7d6820020
actions/upload-pages-artifact v3 56afc609e74202658d3ffba0e8f6dda462b719fa
actions/deploy-pages v4          d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e
```

## RED/GREEN evidence

### PDF writer

RED:

```text
rtk proxy npm.cmd run test:run -- src/export/createPdf.test.ts
3 failed, 3 passed
- old output did not expose the required classic xref position
- old compressed content streams did not expose explicit rotation matrices
- old pdf-lib path called Blob.arrayBuffer 100 times and retained no input Blob parts
```

GREEN:

```text
rtk proxy npm.cmd run test:run -- src/export/createPdf.test.ts
1 file passed, 6 tests passed
```

Coverage includes independent `PDFDocument.load` validity, byte-correct `startxref`, page order, natural dimensions, all four rotation matrices, progress, cancellation between pages, no model mutation, and a 100-page allocation-shape stress test. The stress test proves one database read in flight, zero JPEG `arrayBuffer()` calls, original JPEG Blob identity in output parts, and no monolithic `ArrayBuffer` output part.

### Download/share lifecycle

RED:

```text
rtk proxy npm.cmd run test:run -- src/export/ExportScreen.test.tsx
4 failed, 5 passed
- no persistent fallback link
- synchronous click/revoke behavior
- no replacement/unmount URL lifecycle
- Back enabled during native sharing
```

GREEN:

```text
rtk proxy npm.cmd run test:run -- src/export/ExportScreen.test.tsx
1 file passed, 9 tests passed
```

The subsequent focus test raised the file total to 10 tests and remained green in the combined/final runs.

### Rotation and route focus

```text
rtk proxy npm.cmd run test:run -- src/editor/EditorScreen.test.tsx src/library/LibraryScreen.test.tsx
RED: 2 failed, 20 passed
GREEN: 2 files passed, 22 tests passed

rtk proxy npm.cmd run test:run -- src/editor/EditorScreen.test.tsx src/library/LibraryScreen.test.tsx src/camera/CameraScreen.test.tsx src/export/ExportScreen.test.tsx src/app/App.camera.test.tsx
RED: 5 failed, 43 passed
GREEN: 5 files passed, 48 tests passed

rtk proxy npm.cmd run test:run -- src/library/LibraryScreen.test.tsx
RED for fixed cover viewport: 1 failed, 12 passed
GREEN: 1 file passed, 13 tests passed
```

### Deterministic JPEG adapter

```text
rtk proxy npm.cmd run test:run -- src/camera/testCaptureAdapter.test.ts
RED: 1 failed (full image was SVG)
GREEN: 1 file passed, 1 test passed
```

The green test checks JPEG SOI/EOI, parses encoded SOF dimensions, matches stored width/height, and preserves SVG thumbnail identity.

### Browser cancellation timing

The first full Playwright attempt exposed a test-actionability race: the real Cancel button existed but detached while Playwright waited for visual stability, yielding 2 passes and 1 timeout. The test was corrected to install a DOM observer before starting generation and click the real Cancel button as soon as it mounts. No application delay or test-only production hook was introduced.

```text
rtk proxy npm.cmd run e2e -- --grep "cancels an actual"
1 passed (test body 3.7s)
```

## Final verification

```text
rtk proxy npm.cmd run test:run
13 test files passed, 75 tests passed, 0 failed

rtk proxy npm.cmd run build
TypeScript build and Vite production build passed
PWA generateSW produced 9 precache entries, sw.js, and workbox runtime

rtk grep "__PHOTO_EBOOK_TEST__|setCaptureCount|Test page|image/svg\+xml" dist
0 matches

rtk grep "pdf-lib|PDFDocument" dist
0 matches

rtk proxy npm.cmd run e2e
3 passed, 0 failed
- rename/order/edit/reload plus actual JPEG-backed PDF download and parse
- 30-page actual export cancellation with editable state preserved
- service-worker cached offline startup

rtk git diff --check
exit 0, no whitespace errors
```

The production-hook source audit found the test API only in `src/camera/testCaptureAdapter.ts`, its unit test, and Playwright. The production bundle contained none of the test API/asset markers.

## Concerns and claims not established by automation

- The 100-page stress test establishes sequential access and the JavaScript allocation shape. The browser's internal Blob backing-store strategy and peak resident memory on the first-generation 11-inch iPad Pro still require the target-device 100-page acceptance run.
- Native iPad share-sheet completion to Files, Apple Books, and AirDrop is not desktop-testable. Unit tests cover the Web Share pending/failure lifecycle and Safari-like fallback URL behavior; physical Safari/PWA confirmation remains required.
- Physical camera permission prompts/recovery, persistent-storage grants, low-storage behavior, PWA installation/update activation, and offline Home Screen relaunch remain on the design's nine-item target-device checklist.
- The deterministic E2E JPEG is deliberately tiny to keep browser tests fast. Capture image readability and representative 100-page photographic data remain physical-device acceptance criteria.
- Action SHAs were verified from the official remotes at the time above. Dependabot or a deliberate maintenance pass should update them when newer reviewed action commits are desired.

No push, merge, deployment, or physical-device claim was made.
