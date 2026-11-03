# Wildfie

A Meta AI hackathon adaptation of the existing Kinform app, previously named WildLens. Upload a portrait and choose **Create my animal** once. See the original and animal side by side, with a short positive artwork caption below. **Save image** downloads both portraits and the caption together as one PNG.

## Save comparison cards on the backend

Server saving is opt-in. Merge `"Archive": { "Enabled": true, "Root": "C:\\ProgramData\\Wildfie\\cards" }` into the deployed `appsettings.Production.json`, and grant the dedicated IIS application pool Modify permission to that private folder. Keep it outside `wwwroot`. Restart that application pool and deploy the updated frontend as well.

For each new successful public generation, the browser automatically saves the exact combined PNG used by **Save image**: original, generated animal and the styled caption. Files are retained in `Archive:Root/yyyy-MM-dd/HHmmss-<id>.png` using UTC dates and generated IDs. The default total storage limit is 1 GiB, configurable with `Archive:MaxTotalBytes`; each PNG is limited to 8 MiB. No extra Meta call is made, and stored cards do not become preference/training examples. Visitors see the retention notice before generation. A storage failure preserves their result and download, with a separate retry action that never regenerates the artwork.

Uploads require a short-lived signed permit issued only after a successful public generation. Retries save one immutable file, and existing PNGs survive restarts and software updates. There is no public endpoint for listing or downloading the stored cards. A new process invalidates outstanding permits, but leaves files untouched. Old results and uploads that never completed generation are not backfilled automatically.

## Pipeline

1. Expo/React resizes the upload to a bounded JPEG and samples whole-image colors locally in the browser.
2. One Create action starts the full pipeline. Muse Spark 1.3 produces structured observations of pose, composition, colors and an artistic animal suggestion. For group photos, it assigns an animal separately to each clear portrait and records that person's image position.
3. For a single subject on web, SAM 3.1 supplies a mask and the official `@meta-sam/parser` decodes it into a transparent editing reference. Groups use the entire original photo and skip SAM/cutouts, so a one-person mask cannot remove other people.
4. Muse Image 1.0 receives the original photo and, for single portraits, the isolated reference. The request uses the uploaded JPEG's aspect ratio and asks to preserve its landscape, square or portrait framing. A group makes one combined artwork with each person mapped to their own suggested animal, retaining positions, relative sizes, poses, clothing and interactions. People with unclear faces remain unchanged. Painterly / Dreamlike defaults are internal; there are no direction controls.
5. Original and artwork appear side by side in frames matching the source ratio, including on mobile. One phrase such as “A dreamy, wise Great horned owl” appears beneath, with the full animal name bold. Individual card labels, feature subtitles, explanations, color swatches and stories are hidden. The public app uses white surfaces, system sans-serif typography, blue actions and gradient accents inspired by Instagram. Browser export draws both complete images and the same styled phrase into one 1800-pixel-wide PNG whose height follows the source ratio; native sharing captures the combined card. The phrase comes from the existing Spark request after species selection. Emotion/character words describe the creative animal artwork, not the person's actual feelings or personality.

The backend remains ASP.NET Core 10, reusing the working project instead of rewriting it in Python. The inherited Kinform source is preserved, but the entry point is now `apps/mobile/WildLensApp.tsx`. Its old OpenAI routes stay in demo mode and are not used by WildLens. Original project notes are archived under `docs/KINFORM-*`.

## Start on Windows

Prerequisites: Node 22.20 or later, npm and .NET 10 SDK. Node 22.20 works for the web app; the optional legacy browser-testing CLI is not part of the normal install.

```powershell
cd C:\programming\human-animal-ai
.\scripts\dev.ps1
```

Open **http://localhost:8093**. API: **http://localhost:5086**.

The launcher installs pinned dependencies with `npm ci` when needed, checks the API before opening the web preview, and reuses running services. Keep its terminal open; Ctrl+C stops the foreground preview and the API started by that launcher. `scripts/dev.ps1 -Background` starts hidden local servers with logs in `.artifacts/dev-*.log`.

For a deliberate clean reinstall, stop the web preview first, then run `npm ci`. If a previous install was interrupted, the launcher preserves the incomplete `node_modules` folder in `.artifacts/npm-install-leftovers-*` before reinstalling. Code, `.env` and `evaluation/private` are not moved or deleted. Do not run dependency installation while Metro is using the same folder.

Or run two terminals: `npm run api` and `npm run web`.

Tall uploads fit within a screen-sized preview without cropping the photo; the create button stays accessible on desktop and phone screens. **Use camera** opens a live browser preview, requests camera access (never microphone access), and lets you take a photo for review before generation. Browser cameras require HTTPS or localhost; a plain HTTP LAN address on a phone cannot request a live camera. Native iOS/Android builds use the system camera and its permission dialog. Closing the preview, taking a photo or switching cameras stops the previous camera stream. The public footer and demo entry have been removed. The Wildfie camera-and-paw icon is used in the app and browser tab; internal project identifiers and private teaching data keep their existing paths.

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

Selecting a photo does not upload it to Meta. Choosing Create confirms permission and makes one Spark selection request and one image-edit request, plus one SAM request for single portraits on web. With eligible RAG memory enabled, one additional Spark geometry request and selected reference-image context guide selection. A group uses one combined image edit, not an image request per person. No intermediate action is required. Repeating Create can incur another charge. No automatic retries are made; Stop prevents subsequent stages but cannot guarantee cancellation of work already accepted by Meta. Credit confirmation is a local declaration, not an automated balance check. The prototype's request/concurrency limits are not a dollar spending cap.

## Private teaching and benchmark

Open **http://localhost:8093/teach** and choose a private password on first use. Annotate accepted/rejected animals, reasons, creative mappings and optional traits; crop each person; organize related cases into training/validation/test splits; export feedback; and compare saved prediction runs. Your three supplied preferences and the original bear/deer/owl comparison are seeded as the first dataset and baseline.

Feedback stays in Git-ignored local files. Eligible training examples can guide the public matcher through retrieved context when Memory is on; this does not train a model. Imports and comparisons make no model calls. Optional current-matcher benchmarks require explicit credit/permission consent and make Spark selection requests only. See [the teaching guide](docs/TEACHING.md).

## Muse Code

Muse Code is a development assistant, separate from the runtime image pipeline. See the [official Windows installation and authentication instructions](https://dev.meta.ai/docs/muse-code), then run `scripts/muse.ps1` to open it in this project. The launcher does not install a subscription, launch billed coding work automatically, or alter your Codex settings. Development can continue in Codex too.

## Output quality and training

The base matching approach is from pushed commit `8afa99262b660ad2002353f6ad5a029927542d88`. The later continuity-v2 and structure-first-v3 algorithms remain reverted. `wildlens-art-direction-v1-groups` adds group-photo handling using the same shape/pose analogy independently for each clear face; the single-portrait image prompt remains unchanged. No feature-priority ranking or additional Spark passes were added. Group plans support up to 20 clear portraits within the bounded analysis output. Animal choice and rendered likeness remain creative model outputs, not measured accuracy claims.

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

- Browser studio is the primary verified experience. Native image picking/sharing is retained; pixel-mask extraction runs on web and is skipped automatically on native. Native device builds are not yet verified.
- Colors and animal similarities are creative directions. The app does not identify people, infer personality or diagnose emotion from appearance.
- Public-studio portraits/results are held in the browser session rather than persisted by the backend. Private teaching references, generated comparison PNGs and confirmed feedback are saved under `evaluation/private/`. Provider-side storage/retention remains subject to its terms; zero retention is not promised.
- Signed analysis tickets are bound to the photo and expire after 15 minutes or a server restart. The server is restricted to local access by default.
- No public deployment, accounts, gallery, production payment controls or app-store submission has been performed. Contest reuse and submission requirements must be checked against the final participant rules.

## Official integration references

- [Meta image understanding](https://dev.meta.ai/docs/image-understanding)
- [Meta structured output](https://dev.meta.ai/docs/structured-output)
- [SAM segmentation](https://dev.meta.ai/docs/sam/overview)
- [Official SAM parser and protocol](https://github.com/meta-models/meta-sam)
- [Muse Image generation and editing](https://dev.meta.ai/docs/image-generation)
- [Hackathon event](https://dev.meta.ai/events/global-hackathon)

### Fast teaching and RAG memory

The private teaching studio now includes 100 attributed, unlabeled starter portraits, bilingual animal search, 20 quick feature sliders, standout checkboxes, Save & next, persistent vectors and optional runtime retrieval. See [the personalization guide](docs/PERSONALIZATION.md). No fine-tuning or automatic starter labels.

### Choice-based teaching

The **Animal choices** tab compares three generated Meta animal portraits with the original, with three short reason phrases and a custom fourth choice. Confirmed choices and edited reasons feed memory without sliders. Drafts remain separate from human labels. Resumable preparation saves three Muse Image edits per photo and reuses completed PNGs and short reasons. See [the animal-choice guide](docs/ANIMAL-CHOICES.md). `dotnet run --project server/Suggestions.Tests` verifies this flow with simulated provider responses.

### Result feedback

The default **Result feedback** tab offers 100 new attributed portraits or a photo upload. Generate one animal using the latest preference context, then Agree or Disagree. Disagree requires a preferred animal and explanation. Save & next updates retrieval immediately without more model calls; unreviewed guesses never teach the app. Feedback remains person-specific and allows any animal for other portraits. See [the result-feedback guide](docs/RESULT-FEEDBACK.md). `dotnet run --project server/Feedback.Tests` checks generation, corrections, retrieval, persistence and failure handling with simulated Meta responses.
