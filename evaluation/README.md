# Evaluating Wildfie

This project uses existing Meta models and versioned art-direction prompts. Preference memory uses local retrieval and bounded ranking; no model is trained or fine-tuned. Evaluate improvements instead of assuming them.

Start with 12-20 consented photos covering frontal and three-quarter poses, different lighting, glasses, hair/head coverings, plain and busy backgrounds, more than one subject, and both people and animals. Keep originals outside source control in `evaluation/private/`. Use the same held-out cases for controlled comparisons; exclude their entire related groups from retrieval and reserve additional unseen cases for a final check. Do not use the bundled sample portrait as paid training/evaluation data: it is designated local-demo-only.

For each case, compare the original and artwork and score each dimension from 1 (fails) through 3 (partly works) to 5 (clearly succeeds):

| Field | Criterion |
| --- | --- |
| pose | Head angle, gesture and framing remain recognizable. |
| species | The selected animal reads clearly. |
| composition | The original visual structure meaningfully guides the artwork. |
| palette | The scene palette guides lighting/background without mapping skin to fur. |
| anatomy | No extra limbs/eyes, pasted human face, broken ears or accidental text. |
| story | Grounded in visible composition, with creative atmosphere clearly distinguished from real emotion. |

Record one JSON object per result in `evaluation/private/reviews.jsonl`, for example:

```json
{"caseId":"owned-photo-01","promptVersion":"wildlens-art-direction-v1","pose":4,"species":5,"composition":4,"palette":4,"anatomy":5,"story":4,"seconds":42,"costUsd":0.02}
```

The line above is a format illustration, not a measured result or current price. Enter actual latency and cost from your own run. Summarize offline with `node scripts/evaluate.mjs evaluation/private/reviews.jsonl`.

Improve prompts and reference conditioning before training. Use SAM's actual mask rather than a guessed rectangle, preserve source framing, and compare the independent matcher against bounded preference ranking. Change one factor at a time and keep the prompt-version label. Review at least two outputs per case before assuming a prompt improvement is consistent.

Fine-tuning is a later experiment if a suitable trainable model, a substantial rights-cleared dataset and an evaluation baseline exist. Do not assume hosted Muse Image or Spark accepts custom fine-tuning. Confirm the supported training route, license, hardware and cost separately; API credits are not a promise of GPU training resources. For this hackathon, the reference-image editing pipeline and repeatable evaluation provide a practical first route to better results.
