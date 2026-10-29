# Private teaching studio

Open **http://localhost:8093/teach**. The query form **http://localhost:8093/?studio=teach** also works. On first use, choose a private studio password of at least 10 characters. The public portrait studio stays at `/`.

The studio collects your preferences, compares predictions and builds persistent trait vectors. Eligible training examples guide the public matcher when Memory is on; this is RAG, not fine-tuning. Saving makes no Meta calls. See [Fast teaching and retrieval memory](PERSONALIZATION.md) for the 100-photo starter set, quick controls, memory and exports.

## Teach a portrait

Your three existing preferences are already loaded: horse over bear on the left; fish or frog over deer in the middle; owl accepted on the right. Their original explanations and feedback quotes are preserved.

1. Add a photo, or select an existing example. Uploads are normalized JPEGs stored locally; uploading does not call Meta.
2. Select the person with the crop tool, including useful body/posture cues and excluding other clear faces. Numeric crop controls are available for keyboard use. A single-person photo can be marked as such without cropping.
3. Enter accepted alternatives, rejected animals, and your decisive observations. Add creative mappings such as fish + hair/dress → fins. Labels are sets of acceptable choices, not a forced single answer.
4. Tick standout features and optionally use 20 quick sliders from −5 to +5. Zero is a subjective midpoint; unknown is blank. Existing −100…+100 ratings retain their stored scale. Advanced annotations and per-example importance remain available.
5. Assign a related group ID and dataset split. A split change moves all cases in that group together. Use a shared group ID for related photos of the same person; the app does not identify people automatically.
6. Save the example. Archive hides an example without deleting it, and Restore brings it back. Discard reloads the saved revision. Conflicting edits are rejected rather than silently overwriting another revision.

“Add another person from this photo” reuses the original image and related group while starting a fresh annotation. Accepted/rejected animal names cannot overlap. Certainty and numeric annotations remain unspecified until you set them.

## Comparison benchmark

The initial baseline is **Your original group comparison**, imported from the supplied screenshot: bear, deer, owl. It matches 1 of your 3 accepted choices. These cases come from one related photo and are initially unassigned, so this is a calibration example, not a held-out accuracy estimate. Its original model version is explicitly unknown.

Select a scope of labeled cases and either:

- **Import predictions:** paste or load a JSON array of `{ "caseId": "...", "animals": ["first choice", "second choice"] }`, optionally wrapped in `predictions`. Set a run name and prediction version. The selected-case template contains empty predictions, not invented answers. Importing makes no model calls.
- **Run current matcher:** explicitly confirm photo permission and credit use, then run 1–5 subject-ready cases. Choose Original (one Spark selection request) or Personalized (geometry extraction plus retrieved training context). Evaluation labels and all evaluated groups are excluded from teaching context. No SAM or artwork generation is requested, and there are no automatic retries. A crop that still contains multiple people is recorded as a failed case. Stop prevents subsequent cases and preserves a partial run; work already accepted by Meta may still be billed.

The current matcher produces one prediction per case, so its top-3 score equals its top-1 score. Imported ranked lists can measure top-3 separately.

Metrics:

- **First choice accepted:** first prediction belongs to the accepted set.
- **Accepted in top 3:** at least one of the first three predictions belongs to the accepted set.
- **Prediction coverage:** cases with a usable prediction, alongside missing/failed cases and related-group count.
- **Rejected first choices:** first prediction appears in the explicit rejected set.

Names match after case and whitespace normalization. Include accepted species-name variants in the label set when needed; the benchmark does not silently infer taxonomy or fuzzy matches. Missing and failed predictions count as misses against the entire requested scope.

Runs store frozen labels, input-reference hashes, revisions, partitions, predictions and version metadata. Later annotation edits do not rewrite old scores. Comparing A and B uses only common cases with the same frozen labels, group, split and input reference. Different or missing comparison cases are reported; no common cases produces no percentage delta. Live runs include the configured model id and prompt version.

Keep held-out test cases separate from examples used to develop matching rules. The split UI helps maintain groups; it cannot discover undeclared duplicates or relationships between photos.

## Local storage and access

All data is under the Git-ignored `evaluation/private/` folder:

| File/folder | Contents |
| --- | --- |
| `preferences.jsonl` | Feedback cases, original metadata, labels, mappings and annotations |
| `references/` | Immutable uploaded originals and subject crops |
| `studio/history.jsonl` | Prior revisions, including related cases affected by split changes |
| `studio/runs/` | Immutable benchmark snapshots |
| `studio/auth.json` | Salted PBKDF2 password hash; no plaintext password |

The API requires a private session for data/photos and rejects non-loopback clients even if public prototype access is enabled. Sessions use HttpOnly, SameSite cookies and expire after 12 hours or a server restart. Mutation requests require the studio header and allowed origin. Password setup/login is rate-limited. The password protects web access; the dataset is ordinary local storage, not encrypted file storage.

Export feedback downloads JSONL; it does not bundle photos or authentication data. Memory → Export trait vectors downloads the persistent vector index. Download run snapshot exports a complete benchmark result. Keep private-folder backups if you need both labels and photos. If the private password is lost, stop the backend and move `studio/auth.json` to a local backup name, then restart and set a new password. Feedback and runs are separate from that credential file.

## Development checks

```powershell
npm run test:teaching
npm run test:meta
npm run typecheck
```

`scripts/start-teaching-test.ps1` starts a separate fixture API on port 5097 with a fresh folder under `.artifacts` and model calls disabled. With the normal web preview running, set `WILDLENS_TEACHING_TEST_API=http://localhost:5097` and run `scripts/browser-teaching.cjs` using Playwright. It forwards private browser requests to the isolated API and leaves the owner dataset/password untouched. Synthetic comparison runs created by that test are fixtures, not measured model improvements.

For an offline manifest import, `server/Teaching.Tools` accepts `--import <private-data-folder> <manifest.json>`. The manifest contains `name`, `version`, `caseIds` and `predictions`. It uses the same snapshot/scoring code as the studio and makes no model requests.
