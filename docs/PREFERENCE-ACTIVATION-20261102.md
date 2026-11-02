# Preference activation — 2 November 2026

The creator completed all 100 starter choices, including 34 custom animals. All 100 confirmed retrieval profiles/photos validated; the existing split remains 80 training, 10 validation and 10 test. The three older group-photo cases remain unassigned. No labels, reasons, artwork choices or splits were changed by activation.

The local trait-vector index was refreshed and Memory explicitly enabled. Main-app requests retrieve relevant training examples automatically; the evaluation cases remain excluded. This is retrieval context, not fine-tuning or a model-weight update. The result now shows **Guided by your preferences** when the backend reports that examples were included. Demo and baseline results do not show that label.

## Evidence

- Activation report: `.artifacts/preference-activation-20261102-7926b5b7621a4af6814daf4c342b5c86/activation.json`.
- With explicit creator approval, one new licensed CC0 portrait outside the corpus passed the normal browser pipeline: two Spark stages, SAM segmentation, and one Muse Image output. Three relevant examples were included; the result was White-tailed deer. Browser errors: zero. Saved feedback hash: unchanged.
- Live report/output: `.artifacts/personalized-main-live-20261102-bd921578e3bd4105b4a15f0a3c0244cc/summary.json`, `artwork.png`, and `main-app-personalized.png`.
- The live transfer initially failed automatic approval review. No calls were made in that rejected attempt. The creator then explicitly approved the specified private reference/context transfer and maximum four calls before execution.

## Lighter guidance requested afterward

Guidance version: `wildlens-light-example-guidance-v1`, separate from the unchanged vector format `wildlens-trait-memory-v2-choices`.

The new portrait's own shapes/pose lead selection. Earlier judgments are weak, person-specific visual examples used mainly between similarly strong fits. Animal labels are neither a shortlist nor species-frequency preferences; rejected choices are not global bans. Any suitable species, including one never chosen in teaching, remains possible. Variety can arise naturally without forcing novelty. The original baseline art-direction and image-generation prompts remain intact.

The lighter revision passed 29 simulated memory/pipeline checks, including selection and rendering of a Pangolin absent from the corpus, allowing a Bear rejected only for a different reference, held-out/group exclusions, and frozen retrieval provenance. The main-app browser regression also passed with zero extra provider calls. The earlier live example demonstrates the working integration before this final prompt revision; it is not a measured accuracy/generalization score for the lighter version. No additional paid test was run for that revision.

To refresh activation again without model calls:

```powershell
dotnet run --project server/Teaching.Tools -- --activate-memory evaluation/private .artifacts/new-preference-activation-report
```

Use a fresh report folder. The command validates confirmed profiles/photos, preserves labels and partitions, backs up the previous memory index/settings, rebuilds the index, and switches memory on. Ordinary future requests and restarts read this persistent memory automatically.
