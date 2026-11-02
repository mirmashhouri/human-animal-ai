# Fast teaching and retrieval memory

Open http://localhost:8093/teach and sign in with the existing private password. Public portrait creation remains one click at `/`.

The default **Result feedback** screen generates one animal portrait with the current preference context, then asks for **Agree** or **Disagree**. Disagree requires your preferred animal and reason. There are 100 new portraits and an upload option. Confirmed feedback immediately updates retrieval memory; unreviewed generations never enter it. See [Result feedback](RESULT-FEEDBACK.md) for the workflow, storage and exports.

**Animal choices** still compares three generated portraits with three short reason phrases each and a custom fourth option. See [Teaching by animal choices](ANIMAL-CHOICES.md). The slider workflow remains under **Teach**. All workflows share the same private dataset and light, person-specific retrieval guidance.

## The 100-photo starter set

The library contains 100 **unlabeled** Wikimedia portraits plus the original three creator judgments. The JPEGs, attribution file, source/license manifest and four contact sheets are in `evaluation/private/starter-portraits/`. Names/source identity metadata are for the private library only, not model context. The source set was visually reviewed for readable portraits; glasses, angled heads and some covered features are intentional. Hidden or unclear features should remain unrated.

Each starter represents a distinct person/group. The initial partition is 80 training, 10 validation and 10 test. Related photos should share a group; changing a group member's partition moves all members together. Images and data are private and Git-ignored. Source licenses and modification notes are available beside the photo and in `ATTRIBUTION.txt`.

The downloader is resumable, caches metadata, uses a contact URL in its User-Agent, bounds concurrency and honors rate-limit backoff. To add another curated batch, extend the names in `scripts/prepare-teaching-portraits.py`, prepare a manifest, then use the offline importer. The current curated name list is not a ready-made 500-person set.

## Rate a portrait with the mouse

1. Search an animal in English or Persian and click it. Multiple selections are equally acceptable alternatives. Custom names are allowed.
2. Tick the features that stand out to your caricaturist's eye. A very small feature can be the important one.
3. Optionally rate any of 20 sliders from −5 to +5. Click **0** to explicitly record a midpoint; untouched sliders remain null. Zero is a subjective visual anchor, not a measured population norm. Clear a rating if the feature is obscured or uncertain.
4. Appearance details such as eye color, hair and glasses are optional categorical rendering notes. Rejected animals, reasons, confidence, creative mappings and advanced annotations remain available.
5. Click **Save & next**, or press **Alt+Enter**, to save and move to the next unlabeled portrait. Previous/Skip do not save edits; save or discard before changing examples.

The photo stays beside the feature controls on desktop. The library has thumbnails, search, pending/labeled queues and progress. This browser remembers the last selected case. Photos, feedback, partition, revisions, vectors and the memory setting survive server restarts; sign in again after an API restart. Unsaved form edits are not autosaved. Earlier −100…+100 annotations keep their stored scale and appear proportionally on quick sliders; they are not silently migrated.

## What the vectors contain

`studio/memory-index.json` contains 20 normalized trait dimensions, null masks, standout flags, case revisions, groups, partitions and JPEG hashes. These are interpretable geometric feature vectors, **not learned image embeddings or identity recognition**. Accepted animal names do not participate in similarity calculations. Index files rebuild on save and can recover if missing/stale.

Rated/salience-only cases can be indexed; a confirmed animal-choice case can instead use its separately stored AI geometry. Plain labels with neither features nor a confirmed retrieval profile remain saved but are not retrieval-ready. Only active, labeled **training** cases with a single-person reference and usable geometry/standout features are eligible. Manual values override AI estimates, including explicitly hidden/unknown traits. Unassigned, validation, test and archived cases cannot teach the runtime. Unknown values stay null and are not compared as zero.

Search compares shared observed traits, optional user importance and explicit salience. With numeric overlap, opposite values cannot be rescued simply because the same feature is marked standout. With no numeric overlap, shared standout flags can retrieve examples. The score and threshold are versioned engineering heuristics, **not probabilities, verified likeness scores or learned creator weights**. No shared evidence means no match. This is the first approach to evaluate, not evidence that the app has learned the creator's taste.

## How Meta uses it

Memory defaults on and can be disabled under **Memory · RAG**. The switch persists in `studio/memory-settings.json`.

For a new person photo, if an eligible training pool exists:

1. One additional Spark request extracts the same 20 subjective geometry features, before any species is chosen. Unclear features are null. Group profiles use positional descriptions, not identities.
2. Local vector search selects up to three examples per person, bounded to six example assignments per group request. Exact duplicate JPEG bytes and declared excluded groups are rejected.
3. The normal Spark art-direction request receives the **new photo plus actual selected reference crops**, creator choices, rejected alternatives, cues, ratings and rendering notes. The new portrait's visible shapes lead selection. The examples are weak, person-specific supporting context, primarily helping between similarly strong fits. Their animal names are not a shortlist or a species-frequency preference; rejected choices are not global bans. Any suitable animal, including one never labeled in the teaching set, remains possible. Variety is allowed to arise naturally without a novelty quota. Source names, celebrity identities, paths and URLs are omitted.
4. Species selection feeds the existing Muse Image editing pipeline. Compatible creative mappings guide rendering after selection. The original photo stays authoritative for its own visible details and group arrangement.

The public response reports only memory status/example count; private case IDs are retained only in benchmark evidence. No eligible pool, Memory off, or animal-subject mode preserves the baseline request flow. If profiles yield no relevant match, the original selection prompt is used; the already-made geometry call may still be billed. A provider/invalid-profile error stops without automatic retry or image generation.

Saving, local search, import and export make **no Meta calls**. Live personalization costs an extra geometry request plus example image/text context. No fine-tuning or external vector database is required.

## Fair comparison

Benchmark → Run the current matcher offers **Original** and **Personalized**. Both require explicit consent and are limited to 1–5 single-person cases. No SAM or image generation occurs. Original makes one selection request per crop. Personalized additionally uses the geometry/retrieval stage if a training pool exists.

All groups selected for evaluation are excluded from retrieval, including when evaluating training cases as a calibration check. Evaluation labels are never sent as teaching answers. Keep different photos of the same person in the same group; the app cannot discover undeclared identities. Exact byte-hash checks cannot detect every resized/re-encoded duplicate.

Runs freeze predictions, evaluated labels, model/prompt version, a memory hash and retrieved case IDs/revisions/scores. Empty evidence is visible as no teaching examples used. Historical case revisions remain in `studio/history.jsonl`. Existing snapshot comparison continues to require matching evaluated labels, split and input reference. Prefer held-out results; the original three judgments are one calibration group, not accuracy evidence.

## Storage and exports

All paths below are relative to `C:\programming\human-animal-ai\evaluation\private`:

| Path | Contents |
| --- | --- |
| `preferences.jsonl` | All feedback, ratings, standout flags, source metadata and partitions |
| `references/` | Originals and subject crops used by the teaching app |
| `starter-portraits/` | 100 JPEGs, source/license manifest, attribution, contact sheets and download cache |
| `studio/memory-index.json` | Versioned trait vectors, null masks and photo hashes |
| `studio/memory-settings.json` | Persistent runtime memory switch |
| `studio/runs/` | Immutable benchmark snapshots |
| `studio/history.jsonl` | Previous feedback revisions |
| `studio/auth.json` | Existing salted password hash |

**Export feedback** downloads JSONL. **Memory → Export trait vectors** downloads the index. **Download run snapshot** exports a benchmark. These exports do not include JPEGs or credentials; copy the whole private folder for a complete backup. A local backup was taken before adding the starter set. Password/session protections are unchanged.

## Checks

```powershell
npm run typecheck
npm run test:teaching
npm run test:memory
npm run test:meta
```

`scripts/start-teaching-test.ps1` makes a disposable copy of feedback/references without owner authentication. `browser-teaching-quick.cjs` tests all 100 starter rows, bilingual animal selection, 20 sliders, salience, null versus zero, Save & next, reload/resume, vector persistence/export, memory settings and mobile. `browser-teaching.cjs` retains the crop, legacy-rating, snapshot comparison and archive/restore regressions. Both use the fixture API on port 5097 with model calls disabled.

The backend memory tests simulate Meta and inspect actual outbound bodies. A separate bounded live compatibility check also succeeded with two licensed starter photos and an explicitly synthetic training fixture: Spark extracted geometry, retrieved one example and completed art direction. No SAM/image generation or owner feedback changes occurred. This proves API compatibility, not creator agreement. `scripts/check-memory-live.ps1` repeats that paid two-request check only when explicitly run; it never reads/prints a key and uses a disposable data root.

No creator agreement improvement is claimed until real annotations are collected and evaluated.
