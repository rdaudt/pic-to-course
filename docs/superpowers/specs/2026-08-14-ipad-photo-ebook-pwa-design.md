# iPad Photo Ebook PWA Design

## Purpose

Build an installable, offline-first Progressive Web App for a first-generation
11-inch iPad Pro running iPadOS 26.5. A user creates an editable ebook by taking
photographs. Every successfully saved photograph becomes one page at the end of
the ebook. The user can organize those pages and export the result as a PDF.

The app is designed for one iPad. It has no accounts, server, cloud backup, or
cross-device synchronization.

## Product goals

- Make capturing a 30–100-page photo ebook quick and interruption-free.
- Autosave every successful change locally so closing the app loses no work.
- Keep editable ebooks available after export so they can be revised and
  exported again.
- Work after installation without an internet connection.
- Generate a high-quality, manageable PDF and pass it to the iPad share sheet.
- Remain understandable to a user without technical knowledge.

## Non-goals

The first version will not provide:

- Accounts, cloud synchronization, or server backups.
- Multiple pictures on one page or pages without a picture.
- Captions, OCR, drawing, filters, cropping, or tonal adjustments.
- Importing existing PDFs.
- An internal library of generated PDFs.
- EPUB export.

## Core concepts

An **ebook** is an editable local project with a title and an ordered list of
pages. A **page** contains exactly one locally stored photograph. Deleting the
photograph therefore deletes its page. A **PDF** is an exported snapshot of an
ebook and is not retained inside the app.

## User workflow

### Ebook library

The app opens to a library of locally saved ebooks. Each ebook card shows its
title, cover thumbnail (the current first page when present), page count, and
last-edited date.

The user can:

- Create an ebook by entering a required title.
- Open an existing ebook.
- Rename an ebook.
- Permanently delete an ebook after confirmation.

### Editing an ebook

An ebook opens in the page manager. The user can:

- Enter camera capture mode.
- Review pages in a responsive thumbnail grid.
- Reorder pages by dragging a dedicated drag handle.
- Rotate a page in 90-degree increments.
- Delete a page after confirmation.
- Create a PDF.
- Close the ebook and return to the library.

All changes autosave. A brief **Saving… / Saved** indicator communicates state.
Close is disabled while a local write is still completing, so it never acts as
a discard operation and requires no save prompt.

### Camera capture

Capture mode uses an in-app camera viewfinder with a large Capture button. The
user remains in this mode while taking consecutive photographs. For every
successful shot, the app:

1. Captures the still image.
2. Corrects its encoded orientation when necessary.
3. Resizes and compresses it using the fixed high-quality profile.
4. Produces a separate small thumbnail.
5. Atomically stores the page image, thumbnail, and updated ebook ordering.
6. Increases the visible page counter only after the transaction succeeds.

The stored page is appended to the end of the current ebook. Capture immediately
becomes ready for another picture after processing is complete. Leaving capture
mode waits for an in-progress shot to finish saving.

This first version deliberately uses one-at-a-time processing rather than
queuing multiple unsaved camera shots. The Capture button shows a processing
state and is temporarily disabled until the current shot is safely stored.

### PDF export

The exporter reads pages sequentially in their current order. Each PDF page
uses the corresponding photo's natural aspect ratio and orientation, with no
standard paper size, margins, or cropping. A saved 90-degree rotation is applied
before the page is embedded.

The exporter uses the fixed high-quality image profile and processes full-size
images one at a time to limit peak memory use. It displays page-based progress
and offers cancellation. Cancelling or failing an export leaves the editable
ebook unchanged.

When generation succeeds, the app invokes the iPad share sheet for destinations
such as Files, Apple Books, and AirDrop. If the Web Share API cannot share the
generated file, the app falls back to presenting a downloadable PDF link. The
PWA does not keep a second copy of the generated PDF.

## Architecture

The application is divided into four feature units:

1. **Library** owns ebook creation, listing, opening, renaming, and deletion.
2. **Page manager** owns page presentation, ordering, rotation, and deletion.
3. **Camera capture** owns camera permission, still capture, image processing,
   and append operations.
4. **PDF exporter** owns ordered page reading, PDF construction, progress,
   cancellation, and sharing.

A shared persistence layer is the only unit that directly accesses IndexedDB.
It exposes explicit operations for books, pages, ordering, and storage health.
A shared image processor exposes the capture compression and thumbnail rules.
This keeps browser storage and image-encoding details out of the screens.

A service worker caches only the versioned application shell and required static
assets. User ebooks remain in IndexedDB rather than the service-worker cache.

## Local data model

### Ebook record

- `id`: stable generated identifier.
- `title`: required, trimmed user-visible title.
- `createdAt`: creation timestamp.
- `updatedAt`: timestamp of the most recent successful edit.
- `pageIds`: ordered list of page identifiers.

### Page record

- `id`: stable generated identifier.
- `ebookId`: owning ebook identifier.
- `imageBlob`: processed high-quality image.
- `thumbnailBlob`: independently encoded grid thumbnail.
- `width` and `height`: processed image dimensions.
- `rotation`: one of 0, 90, 180, or 270 degrees.
- `capturedAt`: successful capture timestamp.

Referential changes use IndexedDB transactions. Creating or deleting a page and
updating its ebook ordering must succeed or fail together. Ebook deletion removes
the ebook and all owned page blobs in one logical operation. If browser limits
require batched physical deletion, the ebook is first hidden and marked for
cleanup so a partially deleted project cannot reappear.

## Storage and image policy

The app requests persistent browser storage when the platform supports it. It
checks the Storage Estimate API where available and warns the user when free
space is becoming low. Before capture, it blocks the operation only when there
is clearly insufficient headroom for another processed image; otherwise the
IndexedDB transaction remains the authoritative capacity check.

The image processor uses a single tested high-quality profile suitable for
photographed text. Exact pixel bounds and encoder quality are implementation
constants selected through on-device testing, with these acceptance criteria:

- Fine printed text remains comfortably readable at normal PDF zoom.
- A 100-page representative ebook can be stored and exported on the target iPad.
- The original camera asset is discarded after the processed page commits.

Thumbnails are stored separately so opening a large ebook does not decode every
full-resolution image. Full images are loaded only for focused page operations
and export.

Because the app is local-only, it prominently explains that clearing Safari
website data or deleting the PWA's stored website data can permanently erase all
editable ebooks. Exported PDFs saved through the share sheet are unaffected.

## Interaction and visual design

The interface supports portrait and landscape orientations on the target iPad.
It uses large touch targets, readable labels, and visible feedback rather than
hover-only interactions. Its primary screens are:

- Ebook library.
- Page manager.
- Camera capture.
- PDF export progress.

The page grid has dedicated drag handles so scrolling does not accidentally
reorder pages. Destructive controls are visually separated and require explicit
confirmation. Long operations expose their current state. Capture, reorder, and
export operations cannot mutate the same ebook concurrently.

## Error handling and recovery

- **Camera permission denied:** explain that permission is required and how to
  enable camera access for the app in iPad Settings.
- **Camera unavailable:** keep the ebook open and offer retry without creating a
  page.
- **Image processing or storage failure:** do not increment the page counter or
  insert a partial page; show a retryable message.
- **Low storage:** warn early and block new capture when a save cannot be made
  safely. Existing ebooks remain readable and deletable.
- **Interrupted autosave:** use transactions so the previous consistent state
  remains available after relaunch.
- **Interrupted export:** discard temporary export state and preserve the ebook.
- **Share failure:** retain the generated PDF in memory long enough to retry or
  use the download fallback, then release it when the user leaves export.
- **Service-worker update:** activate a new app shell only at a safe navigation
  point rather than interrupting capture or export.

## Testing and acceptance

### Automated tests

- Unit tests cover ebook and page operations, ordered insertion and movement,
  rotation normalization, image-profile decisions, and natural PDF page sizing.
- IndexedDB integration tests cover autosave, atomic page creation/deletion,
  ebook cleanup, and recovery from failed transactions.
- Service-worker tests confirm cached offline startup and safe app-shell updates.
- Browser workflow tests cover create, rename, close, reopen, reorder, rotate,
  delete, export, and cancellation paths.

Camera permission prompts, native sharing, storage persistence, and resource
limits require physical-device testing and are not considered proven by desktop
browser emulation alone.

### Target-device acceptance tests

On the first-generation 11-inch iPad Pro running iPadOS 26.5:

1. Install the PWA to the Home Screen and launch it while offline.
2. Create, close, and reopen an ebook without losing edits.
3. Take repeated photographs and confirm every successfully saved shot adds one
   page at the end in capture order.
4. Reorder, rotate, and delete pages, relaunch, and confirm the changes persist.
5. Build a representative 100-page ebook without an app crash or unreadable text.
6. Export that ebook with visible progress and share it to Files and Apple Books.
7. Cancel and interrupt exports and confirm the editable ebook remains intact.
8. Deny and restore camera permission and confirm the guidance is accurate.
9. Simulate low storage and confirm warnings and failed saves never create
   partial pages.

## Success criteria

The design succeeds when a user can install the app, work entirely offline,
capture and organize a 30–100-page photographic ebook, leave and reopen it with
all successful changes preserved, and export a readable PDF through the native
iPad share sheet without relying on an account or server.
