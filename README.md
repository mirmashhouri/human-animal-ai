# Wildfie

Turn a selfie or group photo into an animal-inspired portrait with Meta AI. Upload a photo or use your camera, choose **Create my animal**, and see the original on the left while a line-art animation plays in the animal card on the right. Download both portraits and their caption as one PNG.

[Live demo](https://wildfie.vercel.app/)

## How it works

- **Muse Spark** chooses an artistic animal analogy from visible shapes and pose. Each clear face in a group gets its own animal.
- **SAM** optionally isolates a single subject. Group photos keep the full scene.
- **Muse Image** creates the animal portrait, guided by the original framing, pose and aspect ratio.
- The React/Expo frontend shows a side-by-side comparison and exports a combined image. The backend is ASP.NET Core 10.

Animal choices and caption moods are creative interpretations, not identity, personality or emotion assessments.

## Run locally

Requirements: Node.js 22.20 or later, npm, and the .NET 10 SDK.

```powershell
git clone https://github.com/mirmashhouri/human-animal-ai.git
cd human-animal-ai
.\scripts\dev.ps1
```

Open [the studio](http://localhost:8093/). The API listens on `http://localhost:5086`. The Windows launcher installs dependencies when needed and reuses running services. Stop the web preview before running a clean `npm ci` to avoid Windows file locks.

You can also run `npm ci`, then use separate terminals for `npm run api` and `npm run web`. Live generation stays disabled until the backend is configured.

## Configure Meta

Run `scripts/setup-meta.ps1` to enter a key with hidden input. It creates the ignored backend file `server/Kinform.Api/.env` without making model requests. Alternatively, copy the backend `.env.example` and fill in your own key locally.

After confirming your account's billing/credits, enable these backend settings and restart the API:

```dotenv
MODEL_API_KEY=YOUR_META_API_KEY
META_VISION_MODEL=muse-spark-1.3
META_SEGMENTATION_MODEL=sam-3.1
META_IMAGE_MODEL=muse-image-1.0
META_CREDIT_CONFIRMED=true
META_ENABLE_PAID_REQUESTS=true
```

The `.env` loader is Development-only; deployed backends use host environment variables or protected server configuration. Never put a provider key in `EXPO_PUBLIC_*`, frontend code, a commit, or an issue.

Choosing a photo makes no model request. **Create** starts paid processing: one Spark request and one image edit, plus optional SAM. Eligible preference memory adds one Spark request. A group still produces one combined image edit. There are no automatic retries. Stopping prevents later stages but cannot undo work already accepted by the provider. The billing flag is your declaration, not a balance check or spending cap.

## Optional private teaching

The local [teaching studio](http://localhost:8093/teach) supports animal choices, agree/correct feedback, feature ratings and held-out comparisons. A fresh clone contains **no private teaching dataset, generated portraits or saved judgments**. Upload your own examples or prepare an attributed starter collection using the [teaching guide](docs/TEACHING.md).

With eligible memory enabled, selection uses **85% independent visual fit + 15% local preference support**. The configurable preference weight cannot exceed 20%. These are ranking weights, not probabilities or a promise that 15% of results will change. Repeated labels do not accumulate votes, and new animal species remain possible. This is retrieval and local scoring, not fine-tuning. See [personalization](docs/PERSONALIZATION.md).

## Deploy

The frontend can run on Vercel; the backend needs a separate .NET host, such as IIS. `vercel.json` contains the frontend build settings. Set `EXPO_PUBLIC_API_URL` to your HTTPS API origin, and allow that exact frontend origin in backend CORS settings.

See [deployment and updates](docs/IIS.md) for Vercel settings, HTTPS, IIS publishing and optional server-side card storage. Deployment secrets and private data are excluded from source control and frontend deployment uploads.

## Checks

```powershell
npm test
npm run typecheck
npm run test:meta
npm run test:memory
npm run web:build
```

Additional backend checks are in `server/Feedback.Tests`, `server/Teaching.Tests`, `server/Suggestions.Tests` and `server/Archive.Tests`. Run their built test DLLs from the repository root when a test uses relative fixture paths. Automated tests use fake provider responses unless a live test is explicitly requested.

`scripts/browser-loading.cjs` checks the loading flow, desktop/mobile layout, reduced motion, cancellation and combined-image download with intercepted model requests. Browser scripts require Playwright; set `WILDLENS_PLAYWRIGHT_PATH` if it is installed outside this repository. Scripts labeled `live` can make paid requests; they are not part of the default checks.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/mobile/` | Expo/React web UI, camera, comparison cards and local teaching UI |
| `server/Kinform.Api/` | API, Meta integration, private teaching storage and card archive |
| `server/*Tests/`, `tests/` | Simulated-provider and offline checks |
| `scripts/` | Local setup, attributed portrait preparation and verification tools |
| `evaluation/` | Evaluation instructions; private data is ignored |
| `docs/` | Deployment, teaching and personalization guides |

Some internal identifiers and optional legacy demo components retain the earlier Kinform/WildLens names. The current app entry point is `apps/mobile/WildLensApp.tsx`.

## Data and scope

- Browser use is the primary tested experience. Native device builds have not been fully verified.
- Photos go to Meta only after the user starts generation. Provider retention follows the account/provider settings.
- Teaching data stays in the ignored `evaluation/private/` folder by default. Under the bounded ranking policy, saved teaching photos and free-form feedback are not sent as prompt context.
- Optional server card storage is disabled by default. When enabled, it retains the combined original/generated card in a private backend folder; it does not add those cards to teaching memory.
- The backend defaults to loopback access. Public hosting requires deliberate host/CORS configuration and operational controls. The prototype has no per-user accounts, billing ledger or guaranteed dollar cap.

Bundled photos have separate licenses and attribution in [third-party notices](THIRD_PARTY_NOTICES.md). Downloaded teaching collections keep their own source/license manifests outside Git.
