# Group-photo live test — 28 October 2026

The current `wildlens-art-direction-v1-groups` version accepted both clear portraits in the user's supplied two-person photo. One Spark analysis assigned Owl to the viewer-left person and Deer to the viewer-right person, with position, pose and reason for each. Groups use the full original photo and skip SAM to avoid excluding anyone through a single-person cutout. One Muse Image edit produced a combined image containing both assigned animals, retaining the cap/glasses, straw hat, relative placement and shared background. The result was visually inspected.

One manual analysis submission and one image-edit submission were made for this test, with no automatic retry. No general quality benchmark, exact billed cost or remaining balance is claimed. The input was the photo area cropped from the screenshot supplied with the group-support request; the local-demo portrait was not sent to Meta.

Ignored local artifacts: `.artifacts/meta-live-group.png`, `.artifacts/meta-live-group-inspection.json`, `.artifacts/meta-live-group-summary.json`. The key stays in the backend configuration and was not copied or displayed. See VERIFICATION.md for offline and browser coverage. The current pipeline uses one Spark call and one image edit for a group; single portraits additionally use SAM on web.

---

# Meta live integration test — 26 October 2026

The user entered the Meta key locally and enabled the backend credit and live-request flags. The key remains in C:\programming\human-animal-ai\server\Kinform.Api\.env; it was not printed, copied back to staging, or included in generated artifacts.

## Verified through the real WildLens API

- The local API loaded the key and reported liveReady=true for Muse Spark 1.3, SAM 3.1 and Muse Image 1.0.
- A first analysis attempt returned an unreadable/incomplete result. Image generation did not start. The original generic error did not establish which upstream response was responsible.
- Improved the Spark request to low reasoning effort with a 4096-token maximum and added stage-specific handling for empty completions, output-limit exhaustion, malformed analysis and malformed SAM envelopes. Four regression checks were added.
- A manual test after the fix succeeded: Spark returned a structured visual direction for the bundled CC0 red-fox photograph; SAM returned one valid mask, decoded using Meta's official parser; Muse Image edited the actual original fox photo and returned a real PNG artwork.
- Across these app test attempts there were two analysis submissions and one image-generation submission. No automatic retries were introduced. Exact billed cost and remaining credit were not measured.
- Output: `.artifacts/meta-live-fox.png`; visual direction: `.artifacts/meta-live-fox-direction.json`. The artwork visibly retains the left-facing fox profile and translates the photo into a painterly composition.

## Browser validation without another model request

A separate isolated browser replayed the saved real analysis/mask and generated image through the studio. It decoded the actual SAM mask, composited a 705552-byte transparent subject PNG, and included that cutout in the browser's editing payload. It displayed the real generated artwork, palette and story, with no page exceptions. Screenshot: `.artifacts/wildlens-real-meta-result.png`.

This was a saved-response replay at the browser/API boundary. The paid image-edit request used the original photo only; another paid generation with the browser-composited cutout was not performed. Human-to-animal portrait quality, native devices and systematic quality evaluation remain future tests.

## Earlier account preflight

The signed-in Meta billing page showed $150 in active free credits. Its payment-method warning did not block the small Muse Spark playground test. Spark returned `WildLens connection OK` with low reasoning effort and a 1024-token budget. An earlier 128-token playground request exhausted its reasoning budget. Those were two additional real playground requests, separate from the app tests above.

## Repeating the test

`node scripts/test-meta-live.mjs` checks local configuration without calling Meta. `node scripts/test-meta-live.mjs --run` submits one Spark/SAM analysis and one Muse Image edit, with no automatic retries. `--spark-only` alongside `--run` checks just Spark. Repeated live runs can use more credit.
