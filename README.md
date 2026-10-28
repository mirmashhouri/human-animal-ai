# WildLens

A Meta AI hackathon adaptation of the existing Kinform app. Upload a photo, explore a visual interpretation and color palette, then create an animal-inspired portrait and keep the image and visual story.

## Pipeline

1. Expo/React resizes the upload to a bounded JPEG and samples whole-image colors locally in the browser.
2. Muse Spark 1.3 produces structured observations of pose, composition and an artistic animal suggestion. SAM 3.1 optionally segments the subject in parallel.
3. The official `@meta-sam/parser` decodes SAM's actual mask. The browser creates a transparent subject reference. If several subjects are returned, the largest bounding region is selected and the interface says so.
4. After the user reviews the direction, Muse Image 1.0 receives the original portrait and optional isolated reference, plus the selected animal, style, palette and atmosphere.
5. The studio displays the portrait, palette and visual story. Browser export downloads the PNG and a JSON story; native export uses the device share sheet.

The backend remains ASP.NET Core 10, reusing the working project instead of rewriting it in Python. The inherited Kinform source is preserved, but the entry point is now `apps/mobile/WildLensApp.tsx`. Its old OpenAI routes stay in demo mode and are not used by WildLens. Original project notes are archived under `docs/KINFORM-*`.

## Start on Windows

Prerequisites: Node 22.20+ (Node 24 LTS recommended), npm and .NET 10 SDK.

```powershell
cd C:\programming\human-animal-ai
npm ci
.\scripts\dev.ps1
```

Open **http://localhost:8093**. API: **http://localhost:5086**.

Or run two terminals: `npm run api` and `npm run web`. The local layout demo works without a key, performs no image analysis and is explicitly labeled. It shows a bundled animal reference photo, not a generated transformation.

## Connect Meta

Run `scripts/setup-meta.ps1` to enter a replacement key with hidden input. It creates a backend-only `.env`, makes no API requests, and leaves live requests disabled. Existing files are not overwritten.

After your Meta dashboard shows the credit or you have confirmed your intended billing arrangement, set these in `server/Kinform.Api/.env` and restart the API:

```dotenv
MODEL_API_KEY=YOUR-REPLACEMENT-META-KEY
META_VISION_MODEL=muse-spark-1.3
META_SEGMENTATION_MODEL=sam-3.1
META_IMAGE_MODEL=muse-image-1.0
META_CREDIT_CONFIRMED=true
META_ENABLE_PAID_REQUESTS=true
AI_MODE=Demo
AI_ENABLE_PAID_REQUESTS=false
```

Alternatively, the first setup accepts `-CreditConfirmed -EnablePaidRequests` if you have already verified billing. Never put the key in `EXPO_PUBLIC_*`. Credentials were not copied from `idea`, and no key shared in chat was reused. Configuration names also accept host environment variables. Backend `.env` is Development-only.

One Analyze action makes one Spark request and, when isolation is enabled, one SAM request. Each Create action makes one image-edit request. Repeating an action can incur another charge. No automatic retries are made; stopping a browser request cannot guarantee cancellation of work already accepted by Meta. Credit confirmation is a local declaration, not an automated balance check. The prototype's request/concurrency limits are not a dollar spending cap.

## Muse Code

Muse Code is a development assistant, separate from the runtime image pipeline. See the [official Windows installation and authentication instructions](https://dev.meta.ai/docs/muse-code), then run `scripts/muse.ps1` to open it in this project. The launcher does not install a subscription, launch billed coding work automatically, or alter your Codex settings. Development can continue in Codex too.

## Output quality and training

The first quality improvements are original-photo editing, real mask conditioning, measured colors, strict analysis output, user-adjustable animal/style/atmosphere and versioned prompts. These are implemented techniques, not a claim of measured quality gains.

Use [the evaluation workflow](evaluation/README.md) to compare results on a consented, varied photo set. `npm run evaluate -- evaluation/private/reviews.jsonl` summarizes human scores without making API calls. No custom training or fine-tuning has been run; a training decision needs suitable data, a supported model and a measured baseline.

## Verification

```powershell
npm test
npm run typecheck
npm run test:meta
npm run api:test
npm run web:build
```

`scripts/browser-wildlens.cjs` tests the browser flow with simulated responses. Install Playwright as a test dependency or set `WILDLENS_PLAYWRIGHT_PATH` to an available package. See `docs/VERIFICATION.md` for actual results and limitations.

## Current scope

- Browser studio is the primary verified experience. Native image picking/sharing is retained, but pixel-mask extraction is browser-only; native users can turn isolation off. Native device builds are not yet verified.
- Colors and animal similarities are creative directions. The app does not identify people, infer personality or diagnose emotion from appearance.
- Portraits/results are not persisted by the backend. The browser holds the current session; original uploads, resized photos and provider-side handling remain subject to their respective storage/retention behavior. Provider zero retention is not promised.
- Signed analysis tickets are bound to the photo and expire after 15 minutes or a server restart. The server is restricted to local access by default.
- No public deployment, accounts, gallery, production payment controls or app-store submission has been performed. Contest reuse and submission requirements must be checked against the final participant rules.

## Official integration references

- [Meta image understanding](https://dev.meta.ai/docs/image-understanding)
- [Meta structured output](https://dev.meta.ai/docs/structured-output)
- [SAM segmentation](https://dev.meta.ai/docs/sam/overview)
- [Official SAM parser and protocol](https://github.com/meta-models/meta-sam)
- [Muse Image generation and editing](https://dev.meta.ai/docs/image-generation)
- [Hackathon event](https://dev.meta.ai/events/global-hackathon)
