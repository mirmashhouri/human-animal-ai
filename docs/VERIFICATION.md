# Pushed matching and generation restored — 28 October 2026

Current state: at the user's request, the animal-detection and image-generation implementation is restored exactly from GitHub `origin/main`, commit `8afa99262b660ad2002353f6ad5a029927542d88`. `server/Kinform.Api/WildLens.cs`, its regression tests and the live-test helper match that commit. Both subsequent continuity-v2 and structure-first-v3 algorithm changes are reverted. Reports below describe superseded experiments.

The minimal interface remains: upload, one Create click, original and animal side by side, with the animal explanation, colors and story below. It uses the original API response without requiring the newer signature, candidate-ranking or expression fields. The runtime reports `wildlens-art-direction-v1`; each creation uses one Spark call, SAM on web, and one image edit.

Verification: forced .NET rebuild succeeded with zero warnings/errors; the restored 29 backend checks passed; TypeScript validation passed; the browser test passed with original-format simulated responses at desktop and 390px widths, including one-click creation, side-by-side placement, details below, cancellation, reset and download. No page exceptions. No paid Meta calls were made during this restoration. The local API key and billing configuration were untouched. Git history and the remote were not changed.

---

# Structural animal matching correction — 28 October 2026 (superseded)

Story: choose a photo → one Create action → independent face observations without animals/styling → compare species by natural facial geometry → validate the winner → transfer personal details into that fixed species → show human and animal side by side.

The prior continuity prompt could let braids or a toothy smile dominate species selection. `wildlens-structure-first-v3` uses three sequential Muse Spark passes. First observe geometry; second recheck the original image and compare 3–5 candidates; then the server selects/locks the species before a separate third pass plans detail transfers. The comparison schema cannot return transfers and the transfer schema cannot select species. The server weights face outline 30%, face length/projection 30%, eye layout 25%, and nose/mouth arrangement 15%. Major contradictions and weak outline/length/eye support are excluded. A separate length-class check vetoes naturally elongated animal heads for compact/balanced portraits, even if numeric scores overrate them. The species and its checked structural explanation are fixed before rendering; hair, teeth, accessories and iris color affect only the later translation. Uncertain observations are not invented.

## Evidence

- All 66 backend regression checks passed. They cover original-photo analysis passes, species-free observation schema, observation-to-comparison data flow, deterministic ranking, major mismatch veto, an overrated long-head veto, permitting elongated animals for elongated portraits, missing/duplicate/out-of-range data, uncertain-length early stop, rejection before image generation/transfer planning, and feature transfer after the species is fixed. Even a simulated transfer response attempting to substitute a horse cannot replace the server-selected fox.
- TypeScript validation and production web export passed. The isolated browser test passed for one-click creation, hidden defaults, side-by-side images at desktop/390px widths, details below, session clearing, error handling and cancellation. Its model responses are intercepted; no page exceptions occurred.
- The first two manual live **analysis-only** submissions used only the original-photo area cropped from the screenshot supplied for this bug report. The generated horse side was excluded. Neither submission requested SAM or Muse Image. The first stopped with a generic validation error, whose precise field was not captured. Stage-specific validation messages and first-pass visibility ownership were then added. The second completed, comparing deer, seal, meerkat and owl, with deer ranked first. This did not establish a satisfactory final match; it motivated the categorical long-head veto and the separate post-selection transfer pass. That earlier result is preserved in ignored `.artifacts/structure-first-portrait-analysis-before-length-veto.json`.
- A third manual analysis-only submission tested the final three-pass sequence and length-class guard. The profile reported balanced/oval face structure. The model compared Rhesus Macaque, Sea Otter, Quokka and Green Sea Turtle; server ranking selected Rhesus Macaque on outline, chin taper and eye placement, with a more projecting muzzle noted as a mismatch. The final response is in ignored `.artifacts/structure-first-portrait-analysis.json`. The transfer pass completed for the locked species. No SAM or image-generation request was made, and no generated human-to-animal quality result is claimed. These were explicit manual submissions after code changes, not automatic retries. Exact billed cost was not measured.
- The model still supplies observations, anatomical classes and scores, so this remains a creative resemblance system rather than an objective animal detector. One successful portrait check is not a general accuracy benchmark.

Runtime: the existing local key stays backend-only. Create now makes three Spark calls instead of one, plus SAM on web and one image edit only if the match passes. No automatic retries or forced frog/fish answer were introduced. Minimal UX is preserved.

---

# Minimal portrait flow — 28 October 2026

Target: `C:\programming\human-animal-ai`. Photo selection stays local. One **Create my animal** action runs Spark/SAM analysis, mask decoding and Muse Image generation with fixed Painterly / Dreamlike / Suggested defaults. Original and animal stay side by side at desktop and 390px widths; all interpretation appears below. Direction controls and the extra consent checkbox are removed; the Create disclosure confirms permission. Web save downloads one artwork PNG.

The `wildlens-portrait-continuity-v2` analysis adds visible expression, artistic atmosphere and structured signature features with observations, animal translations, visibility and priority. Clear features guide the generation prompt; uncertain features cannot supply a translation. Usable subjects require at least two clear features. Relative feature size, visible iris color and smile curvature/asymmetry receive explicit preservation instructions. This is prompt conditioning, not custom training or a measured likeness result.

Confirmed for this change:

- Meta backend regression suite: 35 checks passed with fake provider responses, including exact feature transfer into the prompt, exclusion of uncertain observations, and rejection of missing/invalid signature details.
- TypeScript validation, 12 Node checks and the production Expo web export passed. The .NET build completed with zero warnings/errors.
- Isolated browser checks passed: no upload before Create, exactly one analysis and one render request per Create, hidden defaults, original image preserved, real mask decoding into a PNG editing reference, signature explanations, desktop/mobile side-by-side placement, details below the images, no horizontal overflow, PNG download, session reset, provider failure without retry or stale artwork, and cancellation preventing the next paid stage. No page exceptions.
- All model-facing browser requests were intercepted. The saved fox artwork is an existing licensed-animal live-test result used as a UI fixture; the bundled human portrait stayed local. This test does not establish a human-to-animal resemblance result. No new Meta requests were made.

Screenshots: `.artifacts/wildlens-minimal-home.png`, `wildlens-minimal-comparison-desktop.png`, `wildlens-minimal-comparison-mobile.png` and `wildlens-minimal-details.png`. The comparison screenshots use simulated analysis and an existing fox artwork; they demonstrate layout only.

Remaining limits: a new consented human-photo comparison is needed to assess actual feature continuity. Native device builds, camera permissions and sharing remain unverified. Mask extraction is automatic on web and skipped on native. Historical reports below describe their respective versions.

---

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

