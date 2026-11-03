# Bounded preference memory

Wildfie's optional memory adjusts animal selection using reviewed examples. It does not fine-tune Meta models. Start in [the local teaching studio](http://localhost:8093/teach); fresh clones contain no private portraits or judgments. See [teaching](TEACHING.md), [animal choices](ANIMAL-CHOICES.md) and [result feedback](RESULT-FEEDBACK.md) for collecting examples.

## Traits and retrieval

The local index contains 20 interpretable geometry dimensions, null masks, standout flags, case revisions, related groups, dataset partitions and photo hashes. These are subjective trait vectors, not identity embeddings or learned face-recognition features. The feature definitions are in `TeachingMemory.Features`.

Use quick sliders from −5 to +5 and optional standout checkboxes. Zero is a subjective midpoint, not a population norm; leave uncertain/hidden features blank. Saved animal-choice/result feedback can use its separately marked AI geometry. Manual annotations take precedence. Old annotations keep their stored scale.

Only active, labeled **Training** examples with a single-person reference and usable features/salience are eligible. Unassigned, Validation, Test and archived cases cannot teach runtime selection. Animal names do not enter geometric similarity calculations. Search compares shared observed traits and their salience, rejects exact duplicate photo bytes and excluded groups, and returns no match without sufficient shared evidence. Similarity is an engineering heuristic, not a probability or verified likeness measurement.

## Selection policy

With memory on, a positive configured weight and eligible training examples:

1. The original Spark art director chooses animals from the **new photo alone**, without teaching labels, reference photos or notes.
2. One additional blind Spark request estimates geometry and proposes up to three candidates per person. The baseline has relative visual fit 1; at most two alternatives have scores from 0 to 1. Any species is eligible. Scores are relative rankings, not calibrated probabilities.
3. Local retrieval finds up to three examples per person, at most six assignments for a group. The code compares candidate names and blind common-species aliases with saved accepted/rejected labels. It takes the maximum similarity for each type of support; repeated labels do not accumulate votes.
4. The server scores each candidate:

```text
preference support = (1 + maximum accepted similarity − maximum rejected similarity) / 2
final score = (1 − weight) × visual fit + weight × preference support
```

`Teaching:PreferenceWeight` defaults to **0.15**, giving **85% visual fit + 15% preference support**, and clamps to **0…0.20**. Neutral preference support is 0.5. Close candidates can change; a sufficiently large visual gap cannot be overturned. Exact ties keep the independent baseline. Only independently proposed candidates can win.

The weight is a share of the ranking formula, not a probability or a guarantee that 15% of results will change. Measure held-out agreement before deciding whether this policy improves your results.

The selected animal, its own visual reason/caption and the new photo feed Muse Image. Saved teaching photos, labels and arbitrary free-form rendering notes are **not** forwarded to Spark or Muse Image under this policy. Saved reasons remain available for review; the bounded adjustment uses accepted/rejected labels and geometric similarity rather than an unconstrained interpretation of that prose.

## Switch off or change the weight

**Memory · RAG** persists the on/off switch in the private root's `studio/memory-settings.json`. `{"enabled":false}` disables runtime preference use. Do not edit the file during an in-progress request if you expect that request to use the new setting.

An optional backend setting controls the weight:

```json
{ "Teaching": { "PreferenceWeight": 0.15 } }
```

Memory off, zero weight, no eligible pool or animal-subject mode preserves the original one-Spark analysis flow. With no relevant retrieved match, the independent choice is kept. Optional calibration failure keeps that result without retrying and reports `unavailable`; feedback generation still requires its geometry profile before saving a new review round. Cancellation propagates without starting later stages.

The public response reports status, example count, effective weight and whether selection changed. Private case IDs/revisions stay in benchmark evidence. The ranking policy version includes its weight. Personalization uses two Spark requests total, not one call per reference, followed by the existing optional SAM and one image edit.

## Continue, export and compare

The default private root is `evaluation/private/`; deployed backends can set `Teaching:DataRoot`. Saved feedback and the memory setting survive restarts. `studio/memory-index.json` is rebuilt when needed. Exports contain JSON/JSONL/vector data, not every referenced image; copy the entire private root for a full backup.

Saving, indexing, searching, importing and exporting make no Meta calls. Live benchmark runs are separate paid actions. Use independent held-out groups, exclude related people/photos, compare the same inputs and labels, and inspect coverage as well as agreement. Self-confirming training results are not generalization evidence. See [evaluation](../evaluation/README.md).
