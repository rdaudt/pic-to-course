# Photo Ebook

Photo Ebook is an offline-first iPad web app for capturing photographs into an
editable ebook and sharing a PDF. It stores ebooks only in this browser on this
iPad—there are no accounts or cloud backups.

Production is deployed automatically by the Vercel project connected to this
GitHub repository. Use the production URL shown in the Vercel dashboard.

## Install on an iPad

1. Open the deployment URL in Safari while connected to the internet.
2. Tap **Share**, then **Add to Home Screen**.
3. Open **Photo Ebook** from the Home Screen once before going offline.

After that first successful load, the app shell works offline. Ebooks and their
photos are stored locally in the PWA, not in the service-worker cache.

## Important local-data warning

Editable ebooks exist only on this iPad. Clearing Safari website data, removing
the PWA's stored website data, or resetting the device can permanently erase
them. Export and save important PDFs through the share sheet; saved PDFs are
not affected by deleting local app data.

## Camera recovery

The app needs Camera permission to capture pages. If access was denied, open
**Settings** on the iPad, find the app (or Safari's website settings), allow
Camera access, and return to the ebook. The capture screen also offers a retry
when the camera is unavailable.

## Offline and PDF sharing

Create and organize ebooks after the first load without a network connection.
Exports make a temporary PDF and offer the iPad share sheet for Files, Apple
Books, AirDrop, and other installed destinations. If the browser cannot use
native file sharing, the app offers a download instead. The app does not retain
an internal copy of an exported PDF.

## Development

```sh
npm ci
npm run test:run
npm run build
npm run e2e
npm run dev
```

`npm run e2e` builds a test-mode app with deterministic capture assets, starts a
local preview server, and runs the browser workflow. Install its local browser
once when needed with `npx playwright install chromium`.

## Deployment

Pushing or merging to `main` triggers the connected Vercel production
deployment. The Vite and PWA base paths are rooted at `/`, so no GitHub Pages
subpath or additional Vercel rewrite is required.

## Physical-iPad validation still required

Desktop browser tests do not prove physical-iPad camera prompts, persistent
storage grants, resource limits for a 100-page ebook, or Files/Books native
sharing. Run the versioned [nine-item target-device acceptance checklist](docs/superpowers/specs/2026-08-14-ipad-photo-ebook-pwa-design.md#target-device-acceptance-tests)
before claiming those behaviours are verified:

1. Install from Safari and launch offline from the Home Screen.
2. Create, close, and reopen an ebook without losing edits.
3. Capture repeated photos and verify capture order.
4. Reorder, rotate, delete, relaunch, and verify persistence.
5. Build a representative 100-page ebook without crashes or unreadable text.
6. Export and share to Files and Apple Books with visible progress.
7. Cancel and interrupt exports without changing the editable ebook.
8. Deny then restore camera permission and verify the guidance.
9. Simulate low storage and verify warnings and atomic failed saves.
