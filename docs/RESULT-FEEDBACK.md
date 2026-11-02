# Teach from the generated result

Open `http://localhost:8093/teach`, sign in with your existing password, and choose **Result feedback** (the default tab). The earlier three-candidate workflow stays under **Animal choices**, and manual sliders stay under **Teach**.

1. Choose one of the 100 new portraits, or **Upload a new photo**.
2. Click **Generate my animal**. This sends that portrait and relevant training examples to Meta and makes two Spark requests plus one Muse Image request. It uses the current main-app selection and rendering prompts and light, person-specific preference context. There is no automatic batch generation or retry.
3. Inspect the original and generated animal side by side. **Agree** confirms the animal; a reason is optional. **Disagree** requires your preferred animal and an explanation of what should change. You can retain the same animal if the problem is the rendering.
4. Click **Save feedback & next**. Saving makes no model calls. The next portrait is selected; generate it when ready, so its request can use feedback just saved.

No verdict is selected automatically. An unreviewed result never becomes a teaching label. Agree does not silently copy the model's explanation into your human reasons. New judgments immediately update local retrieval vectors, using separately stored AI geometry unless you supply manual ratings. The same person's group and exact photo are excluded when generating that person's teaching result. For a group photo, use **Crop this photo** to select one person first. For additional photos of the same person, keep their group IDs together under Teach.

Corrections are examples for that person, not global animal favorites or bans. A new portrait can become any animal. Runtime retrieval remains a weak guide based on relevant visible traits. This changes request context, not Meta's model weights; it does not establish that quality has improved. Use the held-out benchmark to measure that. Existing validation/test cases remain excluded from runtime teaching. The new feedback collection is for training examples, not an independent benchmark.

## Persistence and export

All data is under `C:\programming\human-animal-ai\evaluation\private`:

| Location | Contents |
| --- | --- |
| `feedback-portraits/photos/` | The new 100 downloaded portraits |
| `feedback-portraits/manifest.json`, `ATTRIBUTION.txt`, contact sheets | Source, author, license, checksum and previews |
| `references/` | Stored originals/crops used by the app, including uploads |
| `preferences.jsonl` | Confirmed feedback: proposed/preferred animal, verdict, explanation, photo hash, AI geometry, revision and split |
| `studio/feedback/rounds/` | Analysis, generation status, model/prompt version, retrieved evidence and verdict for each attempt |
| `studio/feedback/artworks/` | Generated animal PNGs |
| `studio/memory-index.json` | Rebuildable local trait vectors |
| `studio/history.jsonl` | Previous case revisions |

Restarting preserves saved feedback, results, images and memory settings. Sign in again after an API restart. Unsaved form edits are not autosaved. Interrupted requests are marked stopped/interrupted; the app does not retry automatically, and work already accepted by Meta may still be billed.

**Export feedback** downloads all confirmed judgments, including their explanations and geometry. **Export result history** downloads attempt metadata and verdicts. **Memory · RAG → Export vectors** downloads the search index. JSON exports contain file references, not the image bytes. Back up the entire `evaluation/private` folder to preserve originals, generated images and authentication along with the feedback.

## Prepare another collection

The 100 new portraits were prepared separately from the original starter set, without duplicate people or identical photo hashes. Photos keep their Wikimedia source and CC/public-domain attribution records; some may need cropping for a closer face.

```powershell
python scripts/prepare-teaching-portraits.py --output evaluation/private/feedback-portraits --count 100 --people-file scripts/feedback-portrait-people.json --exclude-manifest evaluation/private/starter-portraits/manifest.json
dotnet run --project server/Teaching.Tools -- --seed-feedback evaluation/private evaluation/private/feedback-portraits/manifest.json
```

The downloader is resumable; the importer is idempotent. Importing creates unlabeled cases and makes no Meta calls. Use a separate output directory and exclude both existing manifests when preparing another batch.

## Owner-invoked image batch

`server/Feedback.Batch` can prepare all 100 new feedback results with the same fixed snapshot of the latest preferences. This generates drafts only, leaving Agree/Disagree and all saved judgments unchanged. It reuses complete matching results and retains individual PNGs/round records as they finish. Three separate workers use independent local memory snapshots and distinct target portraits.

Planning is offline:

```powershell
dotnet run --project server/Feedback.Batch -- --plan evaluation/private server/Kinform.Api evaluation/private/studio/feedback/batches/my-batch
```

After authorizing the external transfer and paid generation, run each worker `0`, `1`, `2` with `--live-plan <absolute-path-to-plan.json> <worker-number>`. A fresh 100-photo batch can make up to 200 Spark calls and 100 Muse Image calls. Each Spark direction request can include up to three relevant private teaching photos with their saved choices/reasons, sent to Meta. The snapshot, plan and per-worker progress stay in that batch folder; credentials are loaded through the normal backend configuration and are never copied into it.

The runner does not auto-approve images or retry failed requests. Known content refusals are recorded while other portraits continue. A technical failure writes `STOP` so workers stop before starting their next portrait; requests already in progress may finish and be billed. Inspect failures before explicitly resuming. Refresh Result feedback to load new cached results.
