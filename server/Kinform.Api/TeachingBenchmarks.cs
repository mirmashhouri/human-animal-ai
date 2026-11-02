namespace Kinform.Api;

public sealed class TeachingBenchmarks(TeachingStore store, WildLensMeta meta, IConfiguration config) {
    public async Task<TeachingRun> RunAsync(string name, string[] ids, bool consent, CancellationToken token, bool useMemory = false) {
        if (!consent) throw new TeachingIssue("consent_required", "Confirm permission to send the selected subject crops to Meta.");
        if (ids is null || ids.Length is < 1 or > 5) throw new TeachingIssue("benchmark_limit", "Run 1–5 examples at a time.");
        var cases = store.SelectCases(ids);
        if (cases.Any(c => !c.Reference.PersonOnly))
            throw new TeachingIssue("subject_crop_needed", "Select a subject crop, or mark a single-person photo, before running the matcher.");
        var predictions = new List<TeachingPrediction>(); var cancelled = false; var memoryHashes = new List<string>();
        var excludedGroups = cases.Select(c => c.GroupId).Distinct().ToArray();
        foreach (var item in cases) {
            if (token.IsCancellationRequested) { cancelled = true; predictions.Add(new(item.CaseId, [], "Cancelled before this case.")); continue; }
            try {
                var bytes = await File.ReadAllBytesAsync(store.PhotoPath(item.Reference.File), token);
                try {
                    // Selection benchmark only: no SAM and no image generation, no teaching labels in the prompt.
                    var result = await meta.InspectAsync(new(Convert.ToBase64String(bytes), true, Segment: false), token, useMemory, excludedGroups);
                    if (result.MemoryHash is { } hash) memoryHashes.Add(hash);
                    predictions.Add(result.Analysis.GroupPhoto
                        ? new(item.CaseId, [], "Multiple people remain in this crop. Adjust the crop to one person.")
                        : new(item.CaseId, [result.Analysis.AnimalName], Evidence: result.MemoryEvidence));
                } finally { Array.Clear(bytes); }
            } catch (OperationCanceledException) { cancelled = token.IsCancellationRequested; predictions.Add(new(item.CaseId, [], cancelled ? "Cancelled." : "Model request timed out.")); }
            catch (MatchException error) { predictions.Add(new(item.CaseId, [], error.Message)); }
            catch (HttpRequestException) { predictions.Add(new(item.CaseId, [], "Meta could not be reached. No retry made.")); }
        }
        return store.SaveRun(name, WildLensMeta.Spark(config) + " / " + WildLensMeta.PromptVersion + (useMemory ? "+" + TeachingMemory.Version + "/" + WildLensMeta.MemoryGuidanceVersion : ""),
            useMemory ? "meta-personalized-selection" : "meta-selection-only", cases, predictions.ToArray(), cancelled ? "cancelled" : "complete",
            useMemory ? TeachingScoring.Hash(memoryHashes) : null);
    }
}
