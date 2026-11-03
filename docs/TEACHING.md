# Private teaching studio

Open [the local teaching screen](http://localhost:8093/teach), or use `/?studio=teach`. Create a password of 10–200 characters on first use. A fresh clone starts with an empty library; private datasets and prior judgments are not distributed in this repository.

## Choose a workflow

| Screen | What you review |
| --- | --- |
| Result feedback | One generated animal portrait; agree or supply a corrected animal and reason |
| Animal choices | Three generated alternatives with short reasons, or your own fourth choice |
| Teach | Accepted/rejected animals, optional feature ratings, standout traits and subject crop |
| Benchmark | Saved predictions compared with held-out labels |
| Memory · RAG | Runtime preference toggle, index status and vector export |

See [result feedback](RESULT-FEEDBACK.md), [animal choices](ANIMAL-CHOICES.md) and [personalization](PERSONALIZATION.md) for details.

Upload a photo you have permission to use. Crop group images to one person for teaching. Put related photos of the same person in the same group; the app does not identify people or discover all duplicates for you. Assign groups to Training, Validation or Test. Saving an annotation updates local storage and the index without a model request.

Only confirmed, usable training examples enter runtime memory. Draft guesses do not. Numeric features are optional subjective scales from −5 to +5; zero is a midpoint, not a population norm, and unknown should remain blank. Existing annotations keep their stored scale. Archive/restore and optimistic revision checks prevent silent data loss.

## Prepare an attributed starter collection

Downloaded portraits are optional and are not included in Git. The preparation script requires Python and Pillow, downloads eligible Wikimedia images, records source/license metadata, writes contact sheets and resumes interrupted work.

```powershell
python -m pip install Pillow
python scripts/prepare-teaching-portraits.py --output evaluation/private/starter-portraits --count 100
dotnet run --project server/Teaching.Tools -- --seed-portraits evaluation/private evaluation/private/starter-portraits/manifest.json
```

The importer creates unlabeled cases. It does not generate model output or infer your preferences. Review each image, crop as needed, and retain its attribution records. An additional collection can use `--people-file scripts/feedback-portrait-people.json` and `--exclude-manifest evaluation/private/starter-portraits/manifest.json`; import it using `--seed-feedback` instead. These are download/import commands, not paid model-generation commands.

## Benchmark

Use unseen validation/test groups to compare the independent matcher with bounded preference ranking. Select 1–5 subject-ready cases for a live selection run, or import predictions without API requests. Live selection uses Spark only, without SAM or image generation. Evaluation labels, related groups and exact duplicate photo bytes are excluded from retrieval.

Compare first-choice acceptance, accepted animals in the top three, rejected-choice rate and coverage. The current matcher returns one final animal per case, so its top-3 metric equals top-1; imported ranked predictions can measure top-3 separately. Snapshot comparisons require matching evaluated labels/splits/inputs. Small calibration samples are not evidence of general improvement. See the [evaluation workflow](../evaluation/README.md).

## Storage, backup and export

The default data root is `evaluation/private/`, relative to the repository. A deployment can override it with `Teaching:DataRoot`.

| Path under the data root | Contents |
| --- | --- |
| `preferences.jsonl` | Saved labels, observations, revisions and dataset groups/splits |
| `references/` | Uploaded originals and subject crops |
| `studio/history.jsonl` | Earlier revisions |
| `studio/runs/` | Benchmark snapshots |
| `studio/memory-index.json` | Rebuildable trait vectors |
| `studio/memory-settings.json` | Persistent memory toggle |
| `studio/auth.json` | Salted password hash |

Saved work survives restarts. Sessions expire after 12 hours or an API restart; sign in again. Unsaved form edits are not autosaved. JSON/JSONL/vector exports contain references and metadata, not all JPEG/PNG files. Back up the entire private data root to continue on another machine with the images and history intact.

The teaching API requires a private session, rejects non-loopback clients and checks origins on mutations. The data folder is ordinary disk storage, not an encrypted vault. Keep it out of Git, frontend deployment uploads and public static directories. Public teaching hosting is not enabled by the public studio's access flag.
