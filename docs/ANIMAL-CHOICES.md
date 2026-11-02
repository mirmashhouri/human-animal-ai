# Teaching by animal choices

Open `http://localhost:8093/teach` and choose **Animal choices**. The default **Result feedback** tab teaches from one personalized generated result; **Teach** keeps the earlier feature editor available.

**Portrait collection** switches between the starter set and all active single-person uploads/crops. The prepare button selects the next missing portraits, up to 100 per batch, so later collections can be processed in several batches without paying again for completed drafts.

For each starter portrait, Spark proposes three different animals and a separate AI geometry profile for retrieval. **Generate animal portraits** then creates three finished Muse Image transformations from the original photo, using the public studio's Painterly/Dreamlike prompt and image settings. Compare the actual outputs beside the original, with three short reason phrases such as “long neck,” “round eyes,” or “wide smile.” The earlier full explanations remain stored; shortening does not replace your confirmed feedback.

Names, existing labels, and private memory are not sent in the proposal/preview prompts. Each preview uses the fixed candidate animal rather than asking Spark to choose again. Single-person reference crops are sent directly for image editing; no SAM calls are needed. These are creative outputs to judge, not guaranteed likenesses.

Choose a generated portrait and review/edit its short reasons, or choose **My own animal**, search/type a name, and enter one to three reasons. Nothing is selected automatically. **Confirm & next** saves the human decision, which preview files loaded for comparison, and the selected artwork reference when it loaded. Loading is not a claim about visual attention. The screen then advances to the next prepared portrait. Existing animal labels/reasons require the explicit replacement checkbox; other annotations remain intact. Unchosen suggestions are saved as alternatives shown, not automatically rejected animals. A custom fourth animal remains a written creator choice; it does not automatically trigger another paid image request.

## Preparing and resuming

Expand **Prepare animal portraits**, confirm sending portraits to Meta, and start. Missing text suggestions use one Spark request per photo. Image preparation first compresses existing long reasons with up to one text-only Spark request per photo, then makes three Muse Image edits per photo. Already-short reasons and completed images are reused. Text preparation uses two slots; comparison image generation uses six separate slots, retaining the public studio's existing two slots.

At most 100 photos / 300 target images per batch. Every completed PNG is saved immediately. A candidate-specific Meta content-policy refusal is recorded as unavailable while unrelated portraits continue; known policy refusals are not resubmitted on restart. The screen shows the number unavailable separately from completed images. Technical, access, credit or rate errors stop the batch without automatic retries. Stop cancels active requests where possible; work already accepted may still be billed. An explicit restart resumes missing work, reusing completed current images and recorded policy outcomes. A photo change requires a fresh draft.

Closing the browser does not stop a backend batch. Stopping the backend interrupts it; restart preserves completed work without automatically resuming spending. The local CLI flags `--prepare-starter-choices` and `--prepare-starter-artworks` explicitly start text/image preparation when launched. `--Teaching:StarterLimit 1` limits an explicit pilot to one photo. Normal `scripts/dev.ps1` startup does not use these flags.

## What enters memory

Draft suggestions alone never change labels, vectors, or runtime behavior. A confirmed **Training** example uses the chosen animal and approved/edited reasons as retrieval context. Its AI geometry is used for finding nearby portraits, with provenance separate from human slider ratings. Manual geometry overrides AI estimates, including explicit unknown/hidden values. The animal label itself is not part of the similarity calculation.

Validation/test examples stay excluded from runtime retrieval, as do related evaluation groups and duplicate input bytes. Since this screen shows model suggestions before labeling, these examples are AI-assisted judgments; reserve separate, blindly labeled people for a final quality benchmark. Confirmation is not fine-tuning and does not update Meta's model weights. With Memory on, the app retrieves relevant confirmed training examples and sends their photos and judgments on future requests.

## Storage and export

All paths are relative to `evaluation/private/` in the running project:

- `studio/suggestions/<case-id>.json`: draft animals, full explanations, short reason phrases, AI geometry, photo hash, versions, usage, artwork metadata and any unavailable-option outcomes. Only a safe provider error category is saved, not a raw provider error body.
- `studio/suggestions/artworks/`: saved PNG comparison portraits, served only through authenticated private-studio routes.
- `studio/suggestions/jobs/<job-id>.json`: persistent per-portrait progress and safe error messages.
- `preferences.jsonl`: confirmed animal, approved reasons, provenance, all alternatives shown, and original annotations.
- `studio/history.jsonl`: prior case revisions.
- `studio/memory-index.json`: rebuilt retrieval vectors.
- `references/`: portrait JPEGs.

**Export suggestions** downloads draft metadata and job progress. **Export feedback** includes confirmed choices, offered alternatives and the selected artwork reference for later preference analysis/training preparation. These JSON exports do not embed source photos, generated PNGs or credentials. Back up the entire private folder to retain all images. Data survives restarts and is Git-ignored; it is not encrypted at rest.

Image generation is paid model usage. No fine-tuning job or model-weight update is performed.
