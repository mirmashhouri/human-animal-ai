# Private teaching and comparison benchmark — 28 October 2026

The private creator workspace is at `http://localhost:8093/teach` (also `/?studio=teach`). It adds photo upload and person cropping, accepted/rejected animal labels, decisive observations, creative mappings, optional annotations for 30 traits, certainty, related-group train/validation/test splits, revision-aware saves, archive/restore and JSONL export. The three creator-supplied examples are loaded from the existing private dataset. Feedback collection does not train a model or change the public portrait matching/generation instructions.

The benchmark supports offline prediction imports and an explicitly consented current-matcher run of 1–5 prepared subject crops. Current-matcher runs make Spark selection calls only, with no SAM, image generation or automatic retry, and do not include accepted labels in the model prompt. Cancellation records a partial run and stops later cases. Runs freeze labels, groups, partitions, input-reference hashes and version metadata. Comparison excludes changed/missing cases rather than silently rescoring against new labels. Missing predictions count as misses and coverage is reported. Animal names use case/whitespace normalization, with no hidden taxonomy/fuzzy matching.

The initial baseline **Your original group comparison** contains the bear/deer/owl predictions supplied by the creator, against horse / fish-or-frog / owl accepted labels: 1 of 3 accepted, all from one related photo. Its model version is unknown and stated as such. This is an imported calibration example, not a new live-model test or held-out accuracy estimate.

Privacy: teaching data and photos require a local password/session; routes independently reject non-loopback access, disallowed origins and mutation requests without the private header. The password is salted/PBKDF2-hashed and sessions are HttpOnly/SameSite. The local `evaluation/private/` folder remains ignored by Git. Test passwords and synthetic benchmark runs live only in isolated `.artifacts` fixture folders, not the owner dataset. The owner chooses a password on first opening the studio.

Verification:

- All 39 teaching backend checks passed, covering persistence and library order, alternatives, revision conflicts, safe photo paths, invalid annotations, grouped splits and history, frozen snapshots, changed-label/split/input exclusion, missing predictions, top-1/top-3 scoring, authentication/password persistence/sign-out, consent/crop gating, model/prompt version metadata, label-leak prevention and cancellation before/during a model request. All provider calls in tests are simulated.
- The existing 43 WildLens backend checks passed. The public single/group one-click browser regression also passed with zero model calls and no page errors.
- The private browser flow passed against an isolated API on port 5097 with real model access disabled: first-time password setup, unauthorized dataset/photo denial, origin/header enforcement, saved feedback, person crop and protected image loading, trait annotations, group split propagation, reload persistence, unsaved-change protection and discard/reload, JSONL download, two imported fixture runs and fair comparison, photo upload, archive/restore, sign-out and 390px layout without horizontal overflow. Screenshots in `.artifacts/teaching-*.png` use the isolated fixture data. The 100% fixture run is synthetic test input, not a claimed model improvement.
- TypeScript validation passed. A production web export to a fresh `.artifacts` directory passed. An earlier staging export bundled successfully but could not persist into a locked OneDrive output folder; verification used the requested `C:\programming` project instead.

No real Meta requests, model training, public deployment, remote account setup or Git push were performed for this feature. See TEACHING.md for use and storage details. Earlier reports below describe their respective versions.

---

# Group-photo support — 28 October 2026

Current version: `wildlens-art-direction-v1-groups`, extending the restored pushed shape/pose matching approach. The single-portrait image prompt remains unchanged. The rejected continuity-v2 and structure-first-v3 rules remain absent.

One Spark request returns a group flag and a position-bound animal assignment for each clear portrait (up to 20). Multiple people no longer cause the one-main-subject rejection. Groups bypass SAM and single-person cutouts, then one Muse Image edit receives the whole original and every assignment. Unclear/obscured people are left unchanged. The single-portrait path still uses SAM on web. The one-click UX, side-by-side comparison and shared palette/story remain; group results add an explanation per person using their image position.

Confirmed:

- 43 backend checks passed with simulated provider responses, including two/three-person groups, repeated animal species, one clear face in a group, invalid or duplicate assignments, full-photo image reference, per-person mapping, and no SAM call or discarded people through a cutout. No rejected feature-ranking rules are used.
- TypeScript validation and the production web export passed. Backend build: zero warnings/errors.
- Isolated browser checks passed for single and group response formats, one-click creation, per-person explanations, no group cutout, full original passed to generation, desktop/390px layout, cancellation, error handling, download and reset. No page exceptions. All model-facing browser requests were intercepted.
- One manual live test used only the two-person photo area cropped from the screenshot supplied for this feature. Spark accepted both portraits and assigned Owl to the left person and Deer to the right person. One combined Muse Image edit completed; no SAM request or automatic retry was made. Visual inspection confirmed two separate animal subjects, with the original arrangement, cap/glasses and straw hat retained. This checks this group case, not general species-choice or likeness accuracy. Exact cost and remaining credit were not measured.

Real result: ignored `.artifacts/meta-live-group.png`; plan: `.artifacts/meta-live-group-inspection.json`; summary: `.artifacts/meta-live-group-summary.json`. These contain the user's test photo/result and remain local. The browser screenshot `wildlens-group-details-mobile.png` uses simulated responses and is a UI check, not the real generated group image.

Earlier reports below describe their respective versions. Native device behavior and large/complex groups remain unverified.

---

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

# Fast teaching and RAG memory — October 29, 2026

Implemented the approved flow: 100 attributed, visually reviewed Wikimedia portraits; English/Persian animal search; 20 quick −5…+5 trait sliders and independent standout checkboxes; Save & next, queue filtering and reload/resume; persistent trait vectors; runtime retrieval; baseline/personalized benchmark modes. The public one-click UI remains unchanged.

Evidence:

- Owner library: **103 cases**, comprising the original 3 and 100 distinct-person starter cases. All 100 starter labels remain empty. Exactly 100 JPEGs and complete author/license/source metadata were verified. All original fields and the existing password hash match the pre-change backup.
- **25 memory checks**, **39 teaching checks**, **43 existing WildLens checks** passed with simulated provider responses. They cover null versus midpoint, legacy scale preservation, split/group/duplicate exclusions, label-independent retrieval, context photo delivery, rendering hints, group context distribution, persisted settings/vectors, cancellation, and frozen request provenance under concurrent edits.
- **Fast teaching browser suite passed** against a disposable API/data copy: all starter rows, bilingual search, 20 sliders, salience, explicit zero, save/next, reload/resume, exports, memory switch, benchmark selector, private access and 390px layout. No browser errors or real model calls.
- **Legacy teaching browser suite passed**: crop, legacy rating, group partitions, frozen-run comparison, exports, upload, archive/restore, sign-out and mobile.
- **Public browser suite passed**: one click, hidden defaults, no pre-generation upload, original/result side by side at desktop and 390px, per-person group mappings, whole-group reference, cancellation and reset.
- TypeScript and backend builds passed; production web export succeeded at `.artifacts/teaching-rag-web-build`. The teaching code/CSS remain lazy-loaded (about 60 KB JS and 13 KB CSS); public main JS is about 926 KB.
- **Live Meta compatibility passed** in an isolated synthetic fixture with licensed photos: one geometry request, one art-direction request, one retrieved example, segmentation skipped, no image generation and no automatic retries. Owner feedback was not used or modified. Summary: `.artifacts/live-memory-contract-summary.json`. This is API compatibility evidence, not measured preference accuracy.

Runtime data stays under `evaluation/private/`; a full local backup was taken before import. API 5086 and web 8093 remain running. Temporary fixture APIs were stopped. No fine-tuning, Git commit/push or public deployment was performed. Native teaching remains browser-only. Real quality/generalization remains to be measured once the creator supplies labels, especially on the held-out people.

