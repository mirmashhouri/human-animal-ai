# Agree or correct a generated result

Open **Result feedback** in the local teaching studio. Upload a single-person portrait or import an attributed feedback collection. Choose **Generate my animal** to create an image using the current independent/bounded-preference policy.

- **Agree:** confirms the proposed animal for this portrait.
- **Disagree:** requires your preferred animal and an explanation. You can keep the same animal when the issue is its rendering rather than the species.
- **Save & next:** records the judgment and opens another case without a model call.

Unreviewed generations are drafts, not training labels. The same photo and person group are excluded when predicting that example. The saved choice has a separately recorded AI geometry profile; it does not pretend you manually rated those features. Related photos must share a group ID. Validation/Test groups remain excluded from runtime memory.

## Cost and context

A new feedback generation uses two Spark requests (independent direction plus geometry/candidates) and one Muse Image edit, without SAM. The geometry request is required here even with memory off so reviewed examples can later be indexed. The current bounded policy compares saved labels/trait similarity locally; it does not send the saved teaching photos or arbitrary feedback prose to Meta. Only the new portrait is sent for analysis/editing. These are ranking heuristics, not fine-tuning or demonstrated improvement. See [personalization](PERSONALIZATION.md).

Generation can be billed even if stopped after provider work begins. There are no automatic retries. Reopening a completed saved result does not regenerate it.

## Continue and export

The default root is `evaluation/private/`; `Teaching:DataRoot` can override it.

| Location | Contents |
| --- | --- |
| `preferences.jsonl` | Confirmed judgments, explanations, revisions and splits |
| `references/` | Originals and subject crops |
| `studio/feedback/rounds/` | Analysis, attempts, model/policy versions and evidence |
| `studio/feedback/artworks/` | Generated PNGs |
| `studio/memory-index.json` | Rebuildable retrieval vectors |

Saved feedback, images and history survive a restart; sign in again. Export feedback, result history or vectors through the studio. Those JSON exports do not bundle every image. Copy the entire private data root for a full backup.

## Optional batch preparation

`server/Feedback.Batch` can prepare draft results from a fixed local snapshot. It leaves human judgments unchanged and records completed work for resumption. Planning is offline:

```powershell
dotnet run --project server/Feedback.Batch -- --plan evaluation/private server/Kinform.Api evaluation/private/studio/feedback/batches/my-batch
```

Inspect the plan before using its explicit live-worker mode. A fresh 100-portrait batch can use up to 200 Spark calls and 100 Muse Image edits. The current bounded ranking policy keeps preference examples local. The batch's snapshots, photos and progress belong in the ignored private root, never in a public repository or frontend upload. Technical errors stop new work; already-started requests may finish and be billed. Refresh the studio to review saved drafts afterward.
