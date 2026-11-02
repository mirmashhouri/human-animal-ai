# Animal choices verification — 1 November 2026

Story: existing portrait → three Meta animals and three reasons each → human selection or custom animal/reasons → explicit confirmation → persistent preference dataset and runtime retrieval.

## Confirmed

- API build passed with zero warnings/errors; TypeScript passed.
- **27 new backend checks** passed with a simulated provider: three distinct choices/nine reasons, no label leakage, drafts excluded from memory, confirmation provenance, custom fourth choice, stale/conflicting photo/revision checks, explicit replacement of existing labels, manual-rating precedence, held-out/group exclusion, draft reuse, stop/cancel without starting further portraits, interrupted jobs, and explicit resume.
- **25 existing memory**, **39 teaching**, and **43 WildLens** checks passed: **134 backend checks** total. File-heavy regression checks were completed outside OneDrive after its temporary-file replacement lock interrupted a staging test run.
- **Choice browser flow passed** against a disposable API on 5097 with real provider access disabled: four radios, nine reasons, no automatic choice, editable reasons, unsaved-navigation guard, confirm/next, custom animal, train/test memory behavior, reload persistence, JSONL and draft exports, and 390px layout. Zero page errors and zero real Meta calls in browser tests.
- **Public browser regression passed** with simulated responses: one-click behavior, hidden defaults, no upload before generation, side-by-side results at desktop/390px, whole-group generation references, per-person animal assignment, cancellation, and no page errors. No added model calls.
- The actual licensed starter batch finished: **100/100 portraits**, **300 animal suggestions**, **900 reasons**, **zero failed or structurally invalid drafts**, **100 Spark requests**, no SAM/image generation and no retries. Each draft contains a versioned AI geometry profile and reported token usage.
- The original private `preferences.jsonl` SHA-256 matched its pre-batch backup after preparation. Existing labels, ratings, splits and password were not changed by preparing drafts. No human choices were auto-confirmed.

Runtime project: `C:\programming\human-animal-ai`. Full local batch summary: `.artifacts/animal-choices-preparation.json`. Browser screenshots: `.artifacts/animal-choices-desktop.png` and `animal-choices-mobile.png` (simulated choice fixtures, not quality evidence).

The two real services remain available at web 8093/API 5086; disposable browser-test APIs were stopped. No fine-tuning, deployment, Git commit or push was performed. The batch proves preparation/validation and provider compatibility, not preference accuracy or generalization. Future creator agreement must be measured after human review, ideally on a separate blindly labeled set.

## Generated comparison portraits and short reasons

The requested image stage is finished for all 100 photos: **294 saved Muse Image portraits and 6 recorded content-policy refusals**, covering all 300 candidate slots. Every photo has nine short reason phrases (900 total). The existing animal suggestions and `preferences.jsonl` hash remain unchanged from the pre-image backup. All 294 PNG hashes and all 100 original-photo hashes were verified. Files are Git-ignored under `evaluation/private/studio/suggestions/artworks/`.

The first short-reason response exceeded the initial allowance; the batch stopped, the completion budget was increased, and saved work was explicitly resumed. A later image rejection initially stopped the batch; candidate-specific policy handling was added so unrelated portraits could finish. Known refusals are now retained as unavailable and are not resubmitted. Technical/rate/access errors still stop without automatic retries. The final running server was restarted normally, without preparation flags or ongoing paid work.

Verification now includes **43 choice/image checks**, 25 memory checks, 39 teaching checks and 43 public WildLens checks: **150 backend checks**. The new checks cover six generated outputs from two photos, stored image hashes/metadata, concise phrases, no label/index changes from generation, selected and loaded-image provenance, stale preview rejection, interrupted image reuse, per-candidate policy outcomes, no repeated policy submissions, and technical-error handling.

The final choice browser flow passed with three loaded images, nine short phrases, custom feedback, export/reload, viewed-image feedback, unavailable-option display and 390px layout. A separate browser check loaded the three real saved pilot images at full resolution using a disposable local data copy/login; zero browser errors, extra Meta calls or owner-feedback edits. Screenshots: `.artifacts/real-animal-comparison-desktop.png` and `real-animal-comparison-mobile.png`.

Full local completion report: `.artifacts/candidate-images-preparation.json`. Model output quality and creator agreement remain human evaluation tasks; a loaded image is recorded as available for comparison, not proof of visual attention. No fine-tuning was performed.
