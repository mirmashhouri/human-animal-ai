# Bounded preferences and creation animation

Implemented in the local project at C:\programming\human-animal-ai.

The independent Spark art director remains unchanged when memory is disabled. With eligible memory and a positive preference weight, a second blind request extracts geometry and relative candidate scores. Local code combines visual fit (85%) with accepted/rejected label support (15%), capped at 20% preference weight. Repeated labels do not stack. Private teaching photos and free-form feedback are not sent to the model by this policy. This is a transparent ranking heuristic, not a calibrated probability or fine-tuning.

The main creation panel now morphs a continuous line outline from human to fox to rabbit, with real pipeline stage messages and a Stop creating button. It fits a 375x667 viewport. Reduced motion disables the animated paths and decorative CSS motion. Loading unmounts on cancellation, success and errors. The combined card export and server storage remain compatible.

Verified without paid Meta requests:

- 42 memory/ranking checks: 85/15 math, 20% ceiling, strong visual gap, ties, aliases, duplicate-label protection, baseline/off/zero modes, group assignments, hidden private references, snapshot provenance, held-out exclusion and optional calibration fallback.
- 57 public WildLens checks: analysis, segmentation, generation, group assignments, aspect ratios and captions.
- 25 feedback checks: private teaching saves, geometry capture with memory off, exclusions and persistence.
- 27 archive checks, including real localhost PNG upload/storage and idempotency.
- TypeScript typecheck and Expo production web export passed.
- Final headless Chrome browser flow passed at desktop and 375x667: morphing SVG, stage updates, reduced-motion change, Stop preventing the next image request, success/error cleanup, combined PNG download, zero page errors. All model endpoints were intercepted before any photo upload.

Screenshots: .artifacts/wildfie-loading-desktop.png and .artifacts/wildfie-loading-mobile.png.

No teaching labels or the existing enabled memory setting were changed. No live Meta output or improvement in creator agreement was measured in this run. A held-out before/after comparison is still needed to measure whether the 15% policy improves results for this dataset.

Deployment: the local API was restarted. The production IIS API and Vercel site were not changed. Use .artifacts/wildfie-iis-preference-update.zip for the backend and push/redeploy the frontend through its existing Vercel Git integration.
