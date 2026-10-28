# Kinform

A React Native / Expo app with an ASP.NET Core 10 backend. Create **one cartoon animal character from the user's actual portrait**, automatically choosing a species suited to its distinctive visible shapes. Show the original and character together in a shareable card. Offline demos and optional legacy Reference mode use credited animal photographs instead.

This is a **local development prototype**, not a store-ready launch. The working brand is Kinform; name and bundle-ID availability have not been checked.

## What works now

- Responsive, shared React Native interface for iOS, Android and a browser preview.
- Camera/photo-library entry points, portrait preview, JPEG resizing, permission disclosure, and consent before server submission.
- Three bundled animal photographs with source/author/licence records, selection between results, and a local stock-portrait example.
- A card containing the original portrait and character. Both images fit in full in character mode. Browser export downloads a 1080 × 1350 PNG; native builds open the operating system’s share sheet.
- Photo credits, privacy information, clear-session action and informative failure states.
- ASP.NET Core API with bounded JPEG/container checks, catalogue-ID validation, a global prototype rate limit and explicit demo/live modes.
- Two-stage OpenAI Responses adapter: a portrait request studies 20 features from a painter/caricaturist's viewpoint, separating observed shapes from hypothetical artistic emphasis. Up to three distinctive structural features lead a text-only comparison of eight species. The server ranks signature fit first, overall geometry second, selecting just one animal for the character. No invented percentages. Design notes are optional, not the main result.
- Generated mode automatically makes one OpenAI Images **edit** request using the actual resized portrait, selected species and supported visual descriptors. The existing server key and independently configured `gpt-image-2` model create a clearly recognizable cartoon animal inspired by the person's eyes, expression and facial shapes. Separate portrait-edit consent is required. No automatic retries or substitute images; a failed character cannot be exported.
- Optional Reference mode: iNaturalist verifies exact species names and retrieves attributed CC0/CC BY/CC BY-SA photos. Unavailable/unverified references are explicit, never substituted with unrelated animals. Generated mode skips both this resolver and animal-photo review.
- Optional animal-photo review inspects up to six licensed candidates per species with a separate vision call. It selects a visible, sharp, unobstructed face or rejects the whole batch. It never receives the user's portrait or resemblance reasons. Approved selections are cached and the live animal image is fitted in full in the comparison/export.
- An additional animal-image search panel combines the selected animal with AI-suggested visible-feature keywords. Users can edit the query and open Pinterest or Google Images; no separate search API key is needed. These are outbound searches, not embedded or AI-reviewed image results.
- Connected GBIF species explorer: common/scientific-name search, pagination, species keys, record/dataset attribution links, bounded requests and short-lived server-side caching. This is taxonomy discovery, not automatic promotion into matching.
- Backend tests use a fake HTTP handler: they make no paid AI calls.

## Deliberate limits

- **Demo mode is the default.** Its three results are fixed examples, not face analysis. The stock portrait is always local, even if a live API is configured.
- **Only three demo animal types are bundled.** They illustrate the layout, not generated cartoon quality. Live AI chooses from broader model knowledge, not an exhaustive 10,000-animal search or domestic-breed database. A character is creative artwork, not a detected identity or validated biometric match. Likeness, species readability and anatomy need real evaluation.
- The main portrait-to-animal character runs through `/api/matches`. The old separate `/api/hybrids` route remains an unused `501` placeholder; its “coming next” UI has been removed. No fake generated results or ad unlocks.
- No advertising SDK, user accounts, SQL Server integration, persisted scan jobs, production spend ledger, public gallery, store submission or deployment has been performed.
- Native camera, native sharing and store builds still require real-device verification. Browser testing does not prove native functionality.
- Automated backend tests use mocked OpenAI responses, not a paid quality evaluation. Any manual live test is reported separately in `docs/VERIFICATION.md`.

## Run the browser preview

Use Node.js 24 LTS (the browser-testing tool requires Node 24), npm and the .NET 10 SDK. The application itself was also type-checked and web-bundled using the installed Node 22.20 runtime.

From this repository:

```powershell
npm install
npm run web
```

Open **http://localhost:8081**. No API key or backend is needed for local demo mode. Choose “Explore the offline layout demo”, or upload your own portrait and confirm “Show demo comparison”. The three fixed animal photos are a layout demo, not generated characters. Live character creation needs the API and billing settings below.

To launch Expo for a phone:

```powershell
npm start
```

Use a compatible Expo Go version or an Expo development build. Windows cannot run the iOS Simulator; use a physical iPhone or an appropriately configured Mac/cloud build workflow. No cloud build is started by these files.

## Run the .NET API

In a second terminal:

```powershell
dotnet run --project server/Kinform.Api
```

Health check: **http://localhost:5078/health**. The API starts in demo mode, accepts only local connections by default, and does not persist portraits/results.

To connect the browser app to that API, copy `apps/mobile/.env.example` to `apps/mobile/.env.local`, set the following, then restart Expo:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:5078
```

`localhost` on a phone refers to the phone, not your development computer. Physical-phone API testing needs a reachable development address, HTTPS and an explicit review of allowed hosts/CORS/public-access settings. Do not publish this prototype by simply turning its local-only guard off.

### Optional live matching

Keep credentials **only on the server**. Local development loads `server/Kinform.Api/.env` automatically. Never put the key in `EXPO_PUBLIC_*`, the mobile app, source control or a chat.

**Quick setup on Windows:** run this from the project directory:

```powershell
.\scripts\open-ai-settings.ps1
```

This opens `server/Kinform.Api/.env` in VS Code. If missing, it initializes that file and preserves the key/model/billing preference from the previous .NET user-secrets setup. Existing `.env` files are never overwritten. The old user-secrets file is left intact, but is no longer loaded during normal startup. Alternatively, copy `server/Kinform.Api/.env.example` to `.env` and fill it yourself.

Create an **OpenAI project API key** at [API keys](https://platform.openai.com/api-keys). The exact model is [`gpt-5.4-mini`](https://developers.openai.com/api/docs/models/gpt-5.4-mini), which supports image input and structured outputs. Account access and API billing must be available; the placeholder does not grant access. The backend `.env` format is:

```dotenv
OPENAI_API_KEY=sk-REPLACE-WITH-YOUR-OPENAI-API-KEY
OPENAI_MODEL=gpt-5.4-mini
AI_MODE=OpenAI
AI_ENABLE_PAID_REQUESTS=false
AI_ANIMAL_IMAGE_SOURCE=Generated
OPENAI_IMAGE_MODEL=gpt-image-2
AI_IMAGE_QUALITY=medium
```

When ready to pay for comparisons, set `AI_ENABLE_PAID_REQUESTS=true`. Restart the .NET API after any backend `.env` edit; refresh the browser. The file supports single-line literal values, optional quotes and comments; no shell execution or variable expansion. The seven names above and the two photo-review settings below are accepted. Explicit host environment variables and command-line options override `.env`. `.env` is loaded only in Development; IIS Production should use protected server environment variables. It is git-ignored and excluded from build/publish output, but is plaintext and can still sync through OneDrive because of the project location.

### The caricaturist's viewpoint

The visual profile covers face outline and length/width, forehead, cheekbone width and fullness, jaw width/contour, chin, eye shape/size/spacing/tilt, eyelid contour, brow shape and spacing, nose width/length, mouth width, lip contour and iris colour. Each field has a faithful keyword/observation, visibility status, artistic prominence (`salience`, 0–3) and, for distinctive visible shapes, a separate hypothetical drawing direction (`artisticEmphasis`). The AI looks for proportions, contrasts and composition that a portrait painter or caricaturist would preserve and amplify, without inventing photographic details, mocking the person or mapping appearance to personality. Prominence is not confidence, attractiveness or statistical rarity. No identity, ancestry or skin-to-fur colour inference is requested.

The server selects up to three clearly visible structural fields rated distinctive/dominant, ordered by prominence, editorial geometry weight and field order. Uncertain/hidden details get zero prominence and no drawing direction; iris colour cannot become a structural signature. If there is no supported focal shape or too little visible geometry, analysis stops explicitly instead of inventing an animal result. Under **Show design notes**, the interface separates observations from hypothetical artistic emphasis. The original portrait stays unchanged; the image editor creates a new animal artwork using it as reference.

The second stage receives this profile, not the portrait. It considers eight species whose anatomy can echo the focal shapes. Scores remain grounded in visible observations. Ranking prioritizes signature scores × prominence, then overall geometry, then scientific name. The selected animal needs partial support (2/4) on all focal shapes, strong support (3/4) on one, and two strong shape matches overall. Generated mode requires only one supported candidate; Reference mode still requires three. Up to three grounded keywords accompany the selected species. The subsequent image editor receives **the actual portrait**, too; imagined drawing directions and personal resemblance reasons are not copied into its prompt.

**Validation troubleshooting:** analysis version `portrait-animal-character-v1-no-cache` retains named objects for all 20 profile fields/scores and bounded artistic emphasis. Hidden/uncertain keywords are excluded from evidence. Invalid fields, species and scores fail explicitly, with a safe rule code and no portrait/provider body/credential logging. No automatic paid retry is made. Restart the existing API with Ctrl+C followed by `dotnet run --project server/Kinform.Api`, then refresh the browser. Live Generated configuration reports `experience: animal-character`, `matchingStrategy: portrait-to-animal-character`, `resultCount: 1` and `portraitUsedForGeneration: true`. `/api/matches` requires both `consent: true` and `portraitEditConsent: true`; older clients must refresh and read the new disclosure. Responses have `experience: animal-character` and exactly one match. Demo/Reference responses retain `experience: comparison` and three results. No key change is needed.

**No analysis caching:** every submission runs both analysis stages again, including identical and concurrent uploads. No profile, selected ranking or portrait digest is retained for future matching, and failed submissions cannot fall back to an earlier success. The result stays in the current interface until cleared. The same photo can receive different AI suggestions on different submissions; removing reuse does not establish better accuracy. `/api/config` reports `analysisCacheEnabled: false`. Generated images were already requested afresh and have no shared server image cache. Separate caches for public GBIF taxonomy and optional iNaturalist reference metadata/review remain unchanged; Generated mode never uses the reference cache.

These checks establish validation and fixed ranking mechanics, **not validated animal-match accuracy**. Candidate choice and compatibility ratings remain subjective AI judgments, not an exhaustive 10,000-species retrieval system or biometric measurement. The analysis model is still the existing `OPENAI_MODEL` (`gpt-5.4-mini` on this workstation); this change does not silently upgrade models. The [OpenAI structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs) notes that schema-conforming outputs can still contain mistakes. A consenting portrait evaluation set and measured agreement/repeatability are needed before quality claims.

### One portrait-based GPT animal character

With `AI_ANIMAL_IMAGE_SOURCE=Generated`, each consenting creation makes **two billed analysis requests**, then, if analysis succeeds, **one billed image-edit request**. Repeating can bill all three requests again. The [OpenAI Images edit endpoint](https://developers.openai.com/api/reference/resources/images/methods/edit) receives the resized JPEG as multipart `image[]`, plus [`gpt-image-2`](https://developers.openai.com/api/docs/models/gpt-image-2), `n=1`, `1024x1536`, JPEG output and `medium` quality. Input-image processing contributes to cost. `AI_IMAGE_QUALITY` also accepts `low` or `high`. The existing server key must have image-model access and API billing. The analysis model is unchanged. `input_fidelity` is omitted because `gpt-image-2` always processes inputs at high fidelity.

The actual portrait guides the drawing. The prompt prioritizes instantly recognizable animal anatomy, then translates the person's visible eyes/spacing, expression, cheeks, outline and mouth into respectful cartoon forms. It requests clean linework and soft painterly shading, not photorealism, a generic mascot, human skin patches or a human face pasted onto an animal. No identity, personality or ancestry inference is requested. The UI shows the original beside **one character**, optional design notes and a share action. The exported card preserves AI provenance and the configured model, without invented photographer/licence credits. These instructions are quality goals, not guarantees.

The global gate allows at most three active image calls across separate submissions, not three images per person. Creation can take several minutes; the UI timeout is six minutes, each analysis timeout is 75 seconds and the image timeout is 150 seconds. A failed image shows an error and cannot be exported. No automatic billed retries, old-image reuse or internet-photo fallbacks. Cancellation/timeout does not guarantee the provider stopped processing or charging. A manual new creation can bill everything again. Configure provider spending controls before testing.

Images travel as bounded JPEG data in the current response and UI memory; there is no server gallery, disk storage, shared image cache or database. This local prototype still needs durable job/idempotency records, cost metering and per-user quotas before production. Google and Pinterest remain **links only**, with no screenshot worker, iframe, or production browser dependency. Generated mode skips iNaturalist and photo review even if the old review flag is true. Set `AI_ANIMAL_IMAGE_SOURCE=Reference` explicitly to return to licensed internet photos.

### Pinterest / Google Images exploration

On a result, scroll to **Explore similar animal looks**. The selected animal name plus up to three short AI descriptors (for example, `Lion broad face almond shaped eyes face portrait`) prefill an editable query. Switching animals or starting over resets edits. Sample/older results use species-only queries. You can manually add a breed or colour; this is search refinement, not AI breed identification.

Descriptors come from the 20-feature profile and candidate evidence; opening a search link makes no additional AI request. No new key or `.env` setting is required. New AI descriptors require a new comparison after restarting the updated backend; existing results use the fallback. Restarting/reloading alone makes no AI calls.

Only an explicit search-button tap opens the chosen website with URL-encoded text. Kinform does not send the portrait, embed trackers/widgets, proxy arbitrary URLs, or scrape images. The destination receives the search words (which may describe visible features) and normal network information under its own privacy rules. Pinterest may ask users to sign in. Keywords remain in the current result/UI, not an analysis cache, and never enter the generic public photo cache. Search results are unreviewed and are **not** imported into exports or used to replace the generated/reference image.

The panel deliberately uses external search links, not an iframe gallery. Pinterest's [official widgets](https://developers.pinterest.com/docs/web-features/widgets/) cover Pins, boards and profiles, not arbitrary keyword-search results. Google's [Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) is closed to new customers, with existing users required to transition by January 1, 2027. A future in-app result grid needs a supported image-search provider/API agreement, credentials, usage limits, photo-rights handling and an additional content-review path. Search links need none of those credentials.

### Animal-photo review (Reference mode only)

To use internet photographs instead of generated images, add these backend-only settings for the additional billed review step. The review flag is ignored in Generated mode:

```dotenv
AI_PHOTO_REVIEW_ENABLED=true
AI_PHOTO_REVIEW_MODEL=gpt-5.4-mini
AI_ANIMAL_IMAGE_SOURCE=Reference
```

This uses the same OpenAI key. `OPENAI_MODEL` remains the independently configured portrait-analysis model. Both `AI_ENABLE_PAID_REQUESTS` and `AI_PHOTO_REVIEW_ENABLED` must be true. The example file leaves both billing/review disabled.

For each uncached species, one bounded request reviews at most six distinct, individually licensed iNaturalist images. A top-three result can therefore add up to three billed calls (18 animal-image inputs), in addition to the human analysis. No automatic billed retries occur. Approved photo selections and source/credit metadata are cached in process memory for up to six hours; rejected batches for 15 minutes; temporary failures for two minutes. The shared 128-entry cache can evict entries sooner and clears on server restart. Concurrent requests for the same species share the cached outcome. No human image/features/reasons enter this cache or the review request. Durable/distributed caching and a production spend ledger are not implemented.

The reviewer checks face visibility, sharpness, a single animal, useful viewing angle, framing and visual consistency with the species. AI approval is not a guarantee. It can reject the entire batch. If review fails, the result keeps its species suggestion but shows no unreviewed fallback photograph. Disabling review restores an explicitly unreviewed reference image when one is available. Live photos are shown in full, avoiding a center crop that could remove the selected face.

Manual opt-in live review test, **billed**, using public lion photographs only (never a human portrait):

```powershell
dotnet run --project server/Kinform.Tests -- --check-reviewed-reference
```

This loads backend `.env` settings, makes at most one review request and prints only public photo metadata and a safe diagnostic code. Ordinary unit tests remain fully mocked and free of external AI calls.

To run it yourself, open **two PowerShell terminals in the project folder**:

```powershell
# Terminal 1: .NET API (loads server/Kinform.Api/.env)
dotnet run --project server/Kinform.Api
```

```powershell
# Terminal 2: Expo browser preview
npm.cmd run web
```

Open **http://localhost:8081**. Keep both terminals running; stop each with **Ctrl+C**. Use **Create my character**, choose your photo, read the new disclosure, agree and press **Create my animal character**. The offline layout demo never calls AI. `apps/mobile/.env.local` already points to `http://localhost:5078` on this workstation; it must never contain the API key. If setup is needed, check the server key, `AI_MODE=OpenAI`, `AI_ANIMAL_IMAGE_SOURCE=Generated` and `AI_ENABLE_PAID_REQUESTS=true`, then restart the API and refresh. Safe configuration check without billing or key disclosure:

```powershell
dotnet run --project server/Kinform.Api -- --check-config
```

If port `5078` is already in use, do not start a second API. Press **Ctrl+C in the terminal running the existing API**, then run the command again and refresh the browser. When building/checking configuration while the Debug API remains running, add `-c Release` to avoid its locked executable. This update does not stop or replace your existing server automatically.

To return to fixed server demos, set `AI_MODE=Demo` and restart the API. The source-controlled default is also Demo. Live mode is not restricted to those three demo animals; GBIF remains a separate discovery tool.

The server needs all of the following before it can make paid requests:

| Setting | Value |
| --- | --- |
| `Ai:Mode` / `Ai__Mode` | `OpenAI` |
| `Ai:Model` / `Ai__Model` | `gpt-5.4-mini` |
| `Ai:ApiKey` / `Ai__ApiKey` | Secret key, supplied outside source control |
| `Ai:EnablePaidRequests` / `Ai__EnablePaidRequests` | `true` |

Use provider-side spending restrictions and consenting test portraits. Analysis requests set `store: false`, which does **not** mean zero retention by the provider. A global per-process rate limit is not a daily billing cap, an authentication system or distributed abuse prevention. There are no automatic AI retries; manual retries can cause another charge. Evaluate accuracy, latency, refusals and cost before inviting users.

Implementation references: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [provider data controls](https://developers.openai.com/api/docs/guides/your-data).

### Connected animal website: GBIF

Open **The animals → Search GBIF**. Search by a common name (e.g. `fox`) or select scientific name (e.g. `Vulpes`). The .NET backend calls the [public GBIF Species API](https://techdocs.gbif.org/en/openapi/v1/species); **no GBIF API key is needed** for this search. GBIF keys are animal/taxon record IDs, not secret credentials. Every result includes its GBIF species page and source-dataset link. Only search text is sent to GBIF, never portraits or your OpenAI key.

The endpoint is `GET /api/catalogue/search?q=fox&field=common&offset=0`. It restricts discovery to accepted Animalia species, requests 12 records per page, limits browsing to offset 240, caches up to 128 searches for 10 minutes, and permits 20 searches/minute across this local process. Search is user-triggered, not a bulk scraper. GBIF v1's indexed taxonomy and common-name coverage have limitations; records may overlap between checklists, and domestic breeds are not a complete taxonomic species list. The displayed total is GBIF's record count, not a count of unique match-ready animal types. Add your own contact URL/email to the GBIF HTTP User-Agent before public deployment, per [GBIF API guidance](https://techdocs.gbif.org/en/openapi/).

GBIF provides discoverable species keys, not a licensed photo index. In optional **Reference mode**, photographs come from the [iNaturalist API](https://api.inaturalist.org/v1/docs/), with no API key needed for these public reads. The server requires an exact active Animalia species match, checks each photo's licence (CC0, CC BY or CC BY-SA), rejects hidden/flagged photos, and accepts URLs only from the known public iNaturalist photo host. The original photo page supplies its detailed licence and attribution. A public metadata cache excludes portrait-specific reasons; requests are bounded and spaced at least one second apart. If lookup fails, the paid AI result remains visible with a missing-photo notice and species link. This is not a reviewed 10,000-photo index or proof of visual accuracy. Add a real contact identity to the API User-Agent before deployment. Generated mode does not perform these lookups.

Public-photo connectivity check (no portrait, no OpenAI key or charge):

```powershell
dotnet run --project server/Kinform.Tests -- --check-public-reference
```

## Verify

```powershell
npm run typecheck
npm test
dotnet run --project server/Kinform.Tests --configuration Release
npm run web:build
```

With the API running in **demo mode**, also run:

```powershell
node scripts/test-api.mjs
```

The API integration script refuses live mode before sending an image. It intentionally exercises the rate limiter, so wait one minute before repeating it. Tests are a lightweight dependency-free console harness plus Node’s built-in test runner; a failing assertion returns a nonzero exit code. Under a sandbox that blocks test-runner subprocesses, `node tests/catalogue.test.mjs` runs the same Node checks directly.

Web export is written to `apps/mobile/dist/`. Native binaries are not generated by the web export. See `docs/VERIFICATION.md` for the recorded checks and outstanding release gates.

Optional browser automation: start an isolated agent-browser session at the local preview, retrieve its CDP URL with `agent-browser get cdp-url`, then run `scripts/browser-smoke.cjs` with `KINFORM_CDP_URL` set to that URL and Playwright available through `NODE_PATH` or the local environment. The script refuses a non-local-demo client before using the bundled sample as an upload fixture. It does not connect to a personal browser.

## Project layout

```text
apps/mobile/             Expo client, native and browser export implementations
apps/mobile/assets/     Bundled photographs and provenance metadata
data/animals.json       Small, versioned reference catalogue
server/Kinform.Api/     ASP.NET Core API and demo/live matching adapters
server/Kinform.Tests/   Backend checks; provider responses are mocked
tests/                  Catalogue and safe-default checks
scripts/                Asset ingestion and API integration checks
docs/                   Hosting notes and verification record
```

## Photographs and privacy

Bundled photo provenance is recorded in `apps/mobile/assets/photos/credits.json`; live reference provenance travels with the result. Caracal and eagle-owl photographs carry share-alike licences; exported cards include author, licence and source information. Demo images are cropped; live animal photos are fitted in full. The sample portrait is a local layout example, not an AI evaluation, endorsement or production advertising asset. Review personality/model-release rights before any public campaign. Hybrid eligibility remains false pending a separate rights/provider review.

Do not use a biodiversity record’s metadata licence as permission for the photograph. The ingestion script downloads a fixed, reviewed list and stops on unexpected licences; it is not a 10,000-animal scraper. Additional catalogue entries need identity, rights, useful views and matching validation.

Clear session removes portrait/result state from the UI. Native image manipulation can leave cache files until the operating system cleans them up; saved exports, shared copies and external provider retention are separate. Production needs explicit cache cleanup, retention/deletion controls and reviewed privacy notices. No photo pixels are written to application logs or sent to analytics.

## Before production

Evaluate one-character generation with consenting portraits for likeness, clear animal anatomy, failures, cost and latency; verify camera/sharing on devices; add session authentication, quotas and durable spend/idempotency records; harden/decode uploads; finish retention, moderation/reporting and privacy; integrate AdMob only after cost measurements; replace placeholder app IDs; and load-test hosting. Ads are not assumed to cover image costs. See `MOBILE_APP_BUILD_PLAN.md` and `docs/IIS.md` for the historical rollout plan and hosting prerequisites.
