using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;

namespace Kinform.Api;

public sealed record TeachingAnimalOption(string Animal, string[] Reasons, string[]? Phrases = null);
public sealed record SuggestionUsage(int InputTokens, int OutputTokens, int CachedInputTokens);
public sealed record PortraitSuggestions(string Id, string CaseId, string ReferenceFile, string PhotoHash, string Version,
    DateTimeOffset CreatedAt, PortraitProfile Profile, TeachingAnimalOption[] Candidates, SuggestionUsage Usage,
    CandidateArtwork[]? Artworks = null, SuggestionUsage? PhraseUsage = null, CandidateArtworkFailure[]? ArtworkFailures = null);
public sealed record TeachingPreference(string ProposalId, string ReferenceFile, string PhotoHash, string Animal,
    string[] Reasons, string ReasonSource, bool Custom, DateTimeOffset ConfirmedAt, PortraitProfile RetrievalProfile,
    TeachingAnimalOption[] OfferedChoices, CandidateArtwork? SelectedArtwork = null, CandidateArtwork[]? ViewedArtworks = null);
public sealed record SuggestionReview(string CaseId, string ProposalId, int ExpectedRevision, int? Choice,
    string? CustomAnimal, string[] Reasons, bool ReplaceExisting = false, string[]? ViewedArtworks = null);
public sealed record SuggestionWork(string CaseId, string ReferenceFile, string PhotoHash, string State = "pending", string? Error = null);
public sealed record SuggestionJob(string Id, string Status, DateTimeOffset CreatedAt, SuggestionWork[] Items, string Kind = "suggestions");
public sealed record SuggestionStart(string[] CaseIds, bool Consent, bool Artworks = false);

// Drafts never change human labels. Persistent, bounded jobs resume only when explicitly requested.
public sealed partial class TeachingSuggestions(TeachingStore store, IServiceScopeFactory scopes) : BackgroundService {
    private readonly object sync = new();
    private readonly Channel<string> queue = Channel.CreateUnbounded<string>();
    private readonly Dictionary<string, CancellationTokenSource> active = [];
    private string Folder => Path.Combine(store.StudioRoot, "suggestions");
    private string JobsFolder => Path.Combine(Folder, "jobs");
    private static bool SafeId(string value) => value is not null && Regex.IsMatch(value, "^[a-zA-Z0-9_-]{1,100}$");
    private string DraftPath(string caseId) {
        if (!SafeId(caseId)) throw new TeachingIssue("invalid_case", "Select a stored portrait.");
        Directory.CreateDirectory(Folder); return Path.Combine(Folder, caseId + ".json");
    }
    private string JobPath(string id) {
        if (!SafeId(id)) throw new TeachingIssue("invalid_job", "Select a suggestion batch.");
        Directory.CreateDirectory(JobsFolder); return Path.Combine(JobsFolder, id + ".json");
    }
    private T Read<T>(string path) => JsonSerializer.Deserialize<T>(File.ReadAllText(path), TeachingScoring.Json) ?? throw new IOException("Invalid suggestion file.");
    private void Write<T>(string path, T value) => TeachingStore.Atomic(path, JsonSerializer.Serialize(value, TeachingScoring.Json));
    public PortraitSuggestions? Draft(string caseId) { lock (sync) { var path = DraftPath(caseId); return File.Exists(path) ? Read<PortraitSuggestions>(path) : null; } }
    public object Library() => new { proposals = Proposals(), jobs = Jobs(), version = WildLensMeta.SuggestionsVersion };
    public PortraitSuggestions[] Proposals() { lock (sync) {
        Directory.CreateDirectory(Folder);
        return Directory.GetFiles(Folder, "*.json").Select(Read<PortraitSuggestions>).ToArray();
    } }
    public SuggestionJob[] Jobs() { lock (sync) {
        Directory.CreateDirectory(JobsFolder);
        return Directory.GetFiles(JobsFolder, "*.json").Select(Read<SuggestionJob>).Select(job =>
            !active.ContainsKey(job.Id) && job.Status is "running" or "queued" ? job with {
                Status = "interrupted", Items = job.Items.Select(i => i.State == "running" ? i with { State = "interrupted", Error = "Stopped during a request; it may have been billed. Retry only explicitly." } : i).ToArray()
            } : job).OrderByDescending(j => j.CreatedAt).ToArray();
    } }
    public SuggestionJob Start(SuggestionStart input) { lock (sync) {
        if (!input.Consent) throw new TeachingIssue("consent_required", "Confirm sending the selected portraits to Meta for animal suggestions.");
        if (active.Count > 0) throw new TeachingIssue("suggestions_busy", "A suggestion batch is already active. Stop it or wait for completion.", 409);
        if (input.CaseIds is null || input.CaseIds.Length is < 1 or > 100 || input.CaseIds.Distinct().Count() != input.CaseIds.Length)
            throw new TeachingIssue("suggestion_limit", "Select 1–100 distinct portraits.");
        var cases = store.Cases().ToDictionary(c => c.CaseId);
        var work = input.CaseIds.Select(id => {
            if (!cases.TryGetValue(id, out var c) || c.Archived || !c.Reference.PersonOnly)
                throw new TeachingIssue("subject_crop_needed", "Every portrait needs an active single-person reference.");
            var hash = TeachingMemory.PhotoHash(store, c); var draft = Draft(id);
            var current = draft?.PhotoHash == hash && draft.ReferenceFile == c.Reference.File && draft.Version.StartsWith(WildLensMeta.SuggestionsVersion + "/", StringComparison.Ordinal);
            if (input.Artworks && !current) throw new TeachingIssue("suggestions_missing", "Prepare current animal suggestions before generating their portraits.");
            var state = current && (!input.Artworks || ArtworkReady(draft!)) ? "complete" : input.Artworks && current && ArtworkSettled(draft!) ? "partial" : "pending";
            return new SuggestionWork(id, c.Reference.File, hash, state);
        }).ToArray();
        var job = new SuggestionJob(Guid.NewGuid().ToString("N"), work.All(w => w.State == "complete") ? "complete" : work.All(w => w.State is "complete" or "partial") ? "partial" : "queued", DateTimeOffset.UtcNow, work, input.Artworks ? "artworks" : "suggestions");
        Write(JobPath(job.Id), job);
        if (job.Status == "queued") { active.Add(job.Id, new()); queue.Writer.TryWrite(job.Id); }
        return job;
    } }
    public SuggestionJob Stop(string id) { lock (sync) {
        var job = Jobs().FirstOrDefault(j => j.Id == id) ?? throw new TeachingIssue("job_missing", "Batch not found.", 404);
        if (active.TryGetValue(id, out var cancellation)) cancellation.Cancel();
        return job;
    } }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
        await foreach (var id in queue.Reader.ReadAllAsync(stoppingToken)) await ProcessAsync(id, stoppingToken);
    }
    private async Task ProcessAsync(string id, CancellationToken stoppingToken) {
        CancellationTokenSource cancellation;
        lock (sync) { cancellation = active[id]; var job = Read<SuggestionJob>(JobPath(id)); Write(JobPath(id), job with { Status = "running" }); }
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, cancellation.Token);
        try {
            SuggestionWork[] todo; lock (sync) todo = Read<SuggestionJob>(JobPath(id)).Items.Where(i => i.State == "pending").ToArray();
            bool imageBatch; lock (sync) imageBatch = Read<SuggestionJob>(JobPath(id)).Kind == "artworks";
            if (imageBatch) {
                await Parallel.ForEachAsync(todo, new ParallelOptions { MaxDegreeOfParallelism = 2, CancellationToken = linked.Token }, async (item, token) => {
                    try {
                        using var scope = scopes.CreateScope();
                        await PreparePhrasesAsync(scope.ServiceProvider.GetRequiredService<WildLensMeta>(), item, token);
                    } catch (Exception error) when (error is TeachingIssue or MatchException or HttpRequestException or OperationCanceledException or IOException) {
                        Update(id, item.CaseId, "failed", error is TeachingIssue or MatchException ? error.Message : "Short reasons could not be completed. No retry made.");
                        cancellation.Cancel();
                    }
                });
                linked.Token.ThrowIfCancellationRequested();
            }
            await Parallel.ForEachAsync(todo, new ParallelOptions { MaxDegreeOfParallelism = imageBatch ? 6 : 2, CancellationToken = linked.Token }, async (item, token) => {
                Update(id, item.CaseId, "running");
                try {
                    var current = store.Cases().SingleOrDefault(c => c.CaseId == item.CaseId);
                    if (current is null || current.Archived || !current.Reference.PersonOnly || current.Reference.File != item.ReferenceFile || TeachingMemory.PhotoHash(store, current) != item.PhotoHash)
                        throw new TeachingIssue("portrait_changed", "Portrait changed before its request. No request made.");
                    using var scope = scopes.CreateScope();
                    if (imageBatch) {
                        await PrepareArtworkAsync(scope.ServiceProvider.GetRequiredService<WildLensMeta>(), item, token);
                        var ready = ArtworkReady(Draft(item.CaseId)!);
                        Update(id, item.CaseId, ready ? "complete" : "partial", ready ? null : "Meta could not render one or more options. Other portraits were saved."); return;
                    }
                    var bytes = await File.ReadAllBytesAsync(store.PhotoPath(item.ReferenceFile), token);
                    PortraitSuggestions proposal;
                    try { proposal = await scope.ServiceProvider.GetRequiredService<WildLensMeta>().SuggestAnimalsAsync(bytes, item.CaseId, item.ReferenceFile, item.PhotoHash, token); }
                    finally { Array.Clear(bytes); }
                    lock (sync) { Write(DraftPath(item.CaseId), proposal); Update(id, item.CaseId, "complete"); }
                } catch (Exception error) when (error is TeachingIssue or MatchException or HttpRequestException or OperationCanceledException or IOException) {
                    var message = error switch { TeachingIssue e => e.Message, MatchException e => e.Message, OperationCanceledException => "Request stopped or timed out; it may have been billed. No retry made.", _ => "Request or storage failed. No retry made." };
                    Update(id, item.CaseId, "failed", message); cancellation.Cancel();
                }
            });
        } catch (OperationCanceledException) { }
        finally { lock (sync) {
            var job = Read<SuggestionJob>(JobPath(id));
            Write(JobPath(id), job with { Status = job.Items.All(i => i.State == "complete") ? "complete" :
                job.Items.All(i => i.State is "complete" or "partial") ? "partial" : "stopped" });
            active.Remove(id); cancellation.Dispose();
        } }
    }
    private void Update(string id, string caseId, string state, string? error = null) { lock (sync) {
        var job = Read<SuggestionJob>(JobPath(id)); Write(JobPath(id), job with { Items = job.Items.Select(i => i.CaseId == caseId ? i with { State = state, Error = error } : i).ToArray() });
    } }
    public TeachingCase Review(SuggestionReview review) { lock (sync) {
        var proposal = Draft(review.CaseId) ?? throw new TeachingIssue("suggestions_missing", "Generate suggestions for this portrait first.");
        var c = store.Cases().SingleOrDefault(c => c.CaseId == review.CaseId) ?? throw new TeachingIssue("case_missing", "Portrait not found.", 404);
        if (c.Revision != review.ExpectedRevision) throw new TeachingIssue("case_conflict", "This portrait changed. Reload it before confirming.", 409);
        if (c.Archived || !c.Reference.PersonOnly || proposal.Id != review.ProposalId || proposal.ReferenceFile != c.Reference.File || proposal.PhotoHash != TeachingMemory.PhotoHash(store, c))
            throw new TeachingIssue("suggestions_stale", "The photo or suggestions changed. Generate or reload suggestions for the current portrait.", 409);
        if (c.AcceptedAnimals.Length > 0 && !review.ReplaceExisting) throw new TeachingIssue("existing_labels", "Confirm replacing this portrait's existing animal labels and reasons. Other annotations are preserved.", 409);
        if (review.Choice is < 0 or > 2 || (review.Choice is null && string.IsNullOrWhiteSpace(review.CustomAnimal))) throw new TeachingIssue("choice_required", "Choose an animal or enter your own.");
        var animal = review.Choice is { } index ? proposal.Candidates[index].Animal : review.CustomAnimal!.Trim();
        var reasons = review.Reasons?.Select(r => r.Trim()).Where(r => r.Length > 0).ToArray() ?? [];
        if (animal.Length > 80 || reasons.Length is < 1 or > 3 || reasons.Any(r => r.Length > 500)) throw new TeachingIssue("invalid_choice", "Enter an animal and one to three short reasons.");
        var unchanged = review.Choice is { } selected && reasons.SequenceEqual(proposal.Candidates[selected].Phrases ?? proposal.Candidates[selected].Reasons);
        var viewed = review.ViewedArtworks ?? [];
        if (viewed.Length > 3 || viewed.Distinct().Count() != viewed.Length || viewed.Any(file => proposal.Artworks?.Any(a => a.File == file) != true))
            throw new TeachingIssue("artwork_changed", "The compared portraits changed. Reload them before confirming.", 409);
        var viewedArtworks = (proposal.Artworks ?? []).Where(a => viewed.Contains(a.File)).ToArray();
        var preference = new TeachingPreference(proposal.Id, proposal.ReferenceFile, proposal.PhotoHash, animal, reasons,
            unchanged ? "human-confirmed-ai-reasons" : "human-written-or-edited", review.Choice is null, DateTimeOffset.UtcNow, proposal.Profile, proposal.Candidates,
            review.Choice is { } chosen ? viewedArtworks.SingleOrDefault(a => a.Choice == chosen) : null, viewedArtworks);
        return store.Save(c with { AcceptedAnimals = [animal], RejectedAnimals = c.RejectedAnimals.Where(a => TeachingScoring.Normalize(a) != TeachingScoring.Normalize(animal)).ToArray(),
            SelectionCues = reasons, Preference = preference, Feedback = null, Confidence = "certain" }, c.Revision);
    } }
}

public sealed partial class WildLensMeta {
    public const string SuggestionsVersion = "wildlens-three-choices-v1";
    public async Task<PortraitSuggestions> SuggestAnimalsAsync(byte[] jpeg, string caseId, string reference, string hash, CancellationToken token) {
        EnsureReady();
        await gate.Slots.WaitAsync(token);
        try {
            var feature = new { type = "object", additionalProperties = false, properties = new Dictionary<string, object> {
                ["key"] = new { type = "string", @enum = TeachingMemory.Features.Select(f => f.Key).ToArray() },
                ["value"] = new { type = new[] { "number", "null" }, minimum = -5, maximum = 5 }
            }, required = new[] { "key", "value" } };
            var schema = new { type = "object", additionalProperties = false, properties = new {
                usable = new { type = "boolean" }, features = new { type = "array", minItems = 20, maxItems = 20, items = feature },
                salientFeatures = new { type = "array", maxItems = 6, items = new { type = "string", @enum = TeachingMemory.Features.Select(f => f.Key).ToArray() } },
                candidates = new { type = "array", minItems = 3, maxItems = 3, items = new { type = "object", additionalProperties = false,
                    properties = new { animal = new { type = "string" }, reasons = new { type = "array", minItems = 3, maxItems = 3, items = new { type = "string" } } }, required = new[] { "animal", "reasons" } } }
            }, required = new[] { "usable", "features", "salientFeatures", "candidates" } };
            using var result = await PostAsync("chat/completions", new {
                model = Spark(config), reasoning_effort = "low", max_completion_tokens = 4096,
                messages = new object[] {
                    new { role = "system", content = "You propose visual animal analogies for a private caricaturist teaching exercise. The human creator will choose; these are drafts, never ground truth. " +
                        "For ONE clear person, first observe visible face/head geometry, eyes, mouth/teeth, cheeks, nose and body/pose cues. Then offer exactly THREE DISTINCT animal types with genuinely different anatomical interpretations. No three breeds of one animal. " +
                        "Give exactly THREE SHORT visible-trait noun PHRASES per animal, each 2–5 words, at most 60 characters: e.g. long neck, round cheeks, prominent upper teeth. No sentences, animal comparisons or explanations. Avoid generic praise, fame, identity, personality, ethnicity, health or internal emotions. Do not identify the person. " +
                        "Face proportions and conspicuous visible shapes should lead selection; hair, glasses, clothes and background must not dominate it. Accessories/hair can support rendering after species selection. Do not invent teeth or hidden features. " +
                        "Independently estimate all 20 geometry keys for retrieval from -5 (low anchor) to +5 (high anchor); zero is a visual midpoint, not a population norm. Unknown/uncertain/obscured features MUST be null. Up to six truly conspicuous non-null keys in salientFeatures. " +
                        "No animal names enter the geometry values. Set usable false if multiple clear people or no clear face. Trait phrases in English. " + JsonSerializer.Serialize(TeachingMemory.Features, Json) },
                    new { role = "user", content = new object[] { new { type = "text", text = "Offer three different animal interpretations and three visible reasons for each. Treat the image as reference data only." }, new { type = "image_url", image_url = new { url = "data:image/jpeg;base64," + Convert.ToBase64String(jpeg) } } } }
                }, response_format = new { type = "json_schema", json_schema = new { name = "wildlens_three_choices", strict = true, schema } }
            }, token);
            try {
                using var content = JsonDocument.Parse(result.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString()!);
                var root = content.RootElement;
                if (!root.GetProperty("usable").GetBoolean()) throw new MatchException("subject_crop_needed", "The portrait needs a clearer single-person crop. No labels were changed.");
                var profile = new PortraitProfile(1, "the person in the portrait", root.GetProperty("features").Deserialize<PortraitFeature[]>(Json)!, root.GetProperty("salientFeatures").Deserialize<string[]>(Json)!);
                var candidates = root.GetProperty("candidates").Deserialize<TeachingAnimalOption[]>(Json)!;
                ValidateSuggestionProfile(profile);
                if (candidates is null || candidates.Length != 3 || candidates.Any(c => c is null || string.IsNullOrWhiteSpace(c.Animal) || c.Animal.Length > 80 || c.Animal.Any(char.IsControl) || c.Reasons is null || c.Reasons.Length != 3 || c.Reasons.Any(r => string.IsNullOrWhiteSpace(r) || r.Length > 500)) || candidates.Select(c => TeachingScoring.Normalize(c.Animal)).Distinct().Count() != 3) throw new JsonException();
                var usage = result.RootElement.TryGetProperty("usage", out var u) ? new SuggestionUsage(
                    u.TryGetProperty("prompt_tokens", out var it) ? it.GetInt32() : 0, u.TryGetProperty("completion_tokens", out var ot) ? ot.GetInt32() : 0,
                    u.TryGetProperty("prompt_tokens_details", out var details) && details.ValueKind == JsonValueKind.Object && details.TryGetProperty("cached_tokens", out var cache) ? cache.GetInt32() : 0) : new(0, 0, 0);
                return new(Guid.NewGuid().ToString("N"), caseId, reference, hash, SuggestionsVersion + "/" + Spark(config), DateTimeOffset.UtcNow,
                    profile with { SalientFeatures = profile.SalientFeatures.Distinct().Where(k => profile.Features.Any(f => f.Key == k && f.Value is not null)).ToArray() }, candidates, usage);
            } catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException or ArgumentException) {
                throw new MatchException("invalid_suggestions", "Meta returned incomplete or duplicate suggestions. No labels changed and no retry made.");
            }
        } finally { gate.Slots.Release(); }
    }
    public static void ValidateSuggestionProfile(PortraitProfile p) {
        if (p is null || p.Features is null || p.Features.Length != 20 || p.Features.Any(f => f is null || !TeachingMemory.Features.Any(k => k.Key == f.Key) || f.Value is { } v && (!double.IsFinite(v) || Math.Abs(v) > 5)) || p.Features.Select(f => f.Key).Distinct().Count() != 20 || p.SalientFeatures is null || p.SalientFeatures.Length > 6 || p.SalientFeatures.Any(k => !TeachingMemory.Features.Any(f => f.Key == k))) throw new JsonException();
    }
}
