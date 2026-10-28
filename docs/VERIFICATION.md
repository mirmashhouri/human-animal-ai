# Live-test update — 26 October 2026

The real WildLens API now connects successfully to Muse Spark 1.3, SAM 3.1 and Muse Image 1.0 using the user's locally entered key. The licensed fox-photo test produced one real generated artwork and one valid SAM mask. Browser replay of these real results verified transparent cutout rendering and the result UI without additional model requests. See META-LIVE-TEST.md for exact coverage, manual attempts and remaining limits. The updated Meta regression suite has 29 checks; the earlier report below describes the initial offline build.

---
# WildLens verification — 26 October 2026

Target: C:\programming\human-animal-ai. Adapted from the original idea project without modifying it or copying credentials.

Story: choose a photo → consent → Spark interpretation and SAM segmentation → decode a subject cutout → review the direction → Muse Image editing with original and cutout → display and export artwork/story.

## Confirmed

- .NET build: zero warnings/errors.
- New Meta service tests: 25 checks passed, using fake HTTP responses. The actual photo is attached to Spark and Muse Image; requests use the intended Meta host/models. Signed plans reject tampering, another photo and mood changes. Disabled billing and absent consent make no provider call. Errors are not retried.
- Inherited .NET tests: 70/70 passed.
- Node tests: 12/12 passed, including measured palettes and official SAM mask decoding.
- TypeScript validation and production Expo web export passed.
- The real local API started from the requested destination, reports the three Meta model names, and keeps live requests disabled with no key configured.
- Isolated headless browser test passed against the local app: desktop rendering, local demo with zero photo uploads, 390px layout without horizontal overflow, consent gating, JPEG normalization, pixel color sampling, decoded SAM cutout included as a PNG editing reference, original photo preserved, PNG download, explicit provider error with no retry, and session clearing. No page exceptions.
- Browser live-flow responses were simulated inside that isolated test. No consented or sample photo was sent to an external model. The tiny exported test PNG is a fixture, not a generated portrait.
- PowerShell helper scripts passed syntax parsing. The evaluation CLI was checked in its offline help mode.

Screenshots in `.artifacts/wildlens-home-desktop.png`, `.artifacts/wildlens-home-mobile.png`, and `.artifacts/wildlens-local-demo.png` show the real local interface, not paid model quality.

## Deliberately deferred

The user requested live testing later. No Meta key was saved, credit was not independently verified, and no paid Meta API request, Muse Code authenticated coding run, custom training or fine-tuning was performed. Provider compatibility follows current official docs and mocked request contracts; account-specific behavior, quality, cost and latency still require the later live test.

Native devices, camera permissions on real devices, native sharing and store builds remain unverified. Exact mask extraction currently runs in the browser studio; native users can disable isolation. The app is a local prototype, with no public deployment, production spend ledger or hard dollar cap. Historical Kinform verification is preserved in KINFORM-VERIFICATION.md and does not establish current Meta quality.

