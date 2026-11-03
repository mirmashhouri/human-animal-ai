# Teaching with animal choices

Open the local teaching studio and select **Animal choices**. Add your own single-person portrait or import an attributed collection as described in the [teaching guide](TEACHING.md). A fresh clone does not include downloaded teaching photos or generated alternatives.

Prepare three AI suggestions for a portrait, then generate their corresponding images. Each option has three short visual-cue phrases, such as “long neck” or “round cheeks”. Compare the original with all three finished alternatives. Select one, edit its reasons if needed, or enter a different animal and your own reasons as the fourth choice. Nothing becomes confirmed feedback until you save it.

The app records the selected option, offered alternatives, viewed/selected artwork provenance, confirmed reasons and the portrait's separately marked AI geometry. Manual ratings take precedence over that geometry. Saved preferences describe that example; they are not a global animal whitelist. The [bounded ranking policy](PERSONALIZATION.md) controls their effect on future portraits.

Preparation and image generation are separate, potentially billed actions. A complete three-image comparison uses Spark suggestions/reason preparation plus three Muse Image edits. Completed outputs are stored and reused by resumable preparation; failed or refused work is recorded rather than silently retried. Saving your final choice itself makes no model request.

Draft suggestions/images live under the private data root's `studio/` folder. Confirmed choices enter `preferences.jsonl`; only eligible Training examples can teach the runtime. Validation/Test groups remain held out. Exports contain metadata and file references; back up the whole private data folder to preserve images too.

For another feedback style, see [Agree or correct](RESULT-FEEDBACK.md). For storage, imports and access controls, see [the teaching guide](TEACHING.md).
