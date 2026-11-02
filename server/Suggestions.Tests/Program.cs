using System.Net;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

var checks = 0;
void Check(bool value, string name) { if (!value) throw new Exception("FAIL " + name); Console.WriteLine("PASS " + name); checks++; }
void Reject(Action action, string code) { try { action(); throw new Exception("Expected " + code); } catch (TeachingIssue e) { Check(e.Code == code, code); } }
var root = Path.Combine(Directory.GetCurrentDirectory(), ".artifacts", "choices-unit-" + Guid.NewGuid().ToString("N"));
var store = new TeachingStore(root); var memory = new TeachingMemory(store);
var jpeg = File.ReadAllBytes("apps/mobile/assets/photos/sample-portrait.jpg");
TeachingCase Add(string id, string split, int variant) {
    var bytes = jpeg.ToArray(); bytes[^8] ^= (byte)variant;
    return store.Save(new() { CaseId = id, GroupId = id + "-group", PersonPosition = "Private identity must not be sent", Split = split, TraitScale = 5,
        Reference = new() { File = store.Upload(Convert.ToBase64String(bytes)), PersonOnly = true } }, 0);
}
var first = Add("first", "train", 1); var second = Add("second", "test", 2);
var handler = new ChoiceHandler();
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["WildLens:ApiKey"] = "test-only-key", ["WildLens:EnablePaidRequests"] = "true", ["WildLens:CreditConfirmed"] = "true"
}).Build();
var services = new ServiceCollection(); services.AddLogging(); services.AddSingleton<IConfiguration>(config);
services.AddSingleton<WildLensGate>(); services.AddSingleton<WildLensTickets>();
services.AddHttpClient<WildLensMeta>().ConfigurePrimaryHttpMessageHandler(() => handler);
using var provider = services.BuildServiceProvider();
var suggestions = new TeachingSuggestions(store, provider.GetRequiredService<IServiceScopeFactory>());
await suggestions.StartAsync(default);
Reject(() => suggestions.Start(new([first.CaseId], false)), "consent_required");
Reject(() => suggestions.Start(new([first.CaseId, first.CaseId], true)), "suggestion_limit");
var labelsBefore = store.Export();
var job = suggestions.Start(new([first.CaseId, second.CaseId], true));
async Task<SuggestionJob> Finish(string id) {
    for (var i = 0; i < 200; i++) { var state = suggestions.Jobs().Single(j => j.Id == id); if (state.Status is not ("queued" or "running")) return state; await Task.Delay(20); }
    throw new Exception("Suggestion batch did not finish.");
}
Check((await Finish(job.Id)).Status == "complete", "Batch completes with three choices per portrait");
Check(handler.Bodies.Count == 2 && suggestions.Proposals().All(p => p.Candidates.Length == 3 && p.Candidates.All(c => c.Reasons.Length == 3)), "One request yields three distinct animals and three reasons each");
Check(store.Export() == labelsBefore && memory.Index().Vectors.Length == 0, "Unreviewed AI drafts never alter labels or enter memory");
Check(handler.Bodies.All(b => !b.Contains("Private identity") && !b.Contains("acceptedAlternatives")), "Suggestion prompts omit identities, existing labels and personal memory");
var imageJob = suggestions.Start(new([first.CaseId, second.CaseId], true, true));
Check((await Finish(imageJob.Id)).Status == "complete", "Image preparation completes all three candidates for each portrait");
Check(handler.ImageCalls == 6 && handler.PhraseCalls == 2, "Image batch makes three image edits and one reason-shortening request per portrait");
Check(suggestions.Proposals().All(p => p.Artworks?.Length == 3 && p.Candidates.All(c => TeachingSuggestions.ValidPhrases(c.Phrases))), "Finished PNG metadata and concise reason phrases persist on every candidate");
Check(store.Export() == labelsBefore && memory.Index().Vectors.Length == 0, "Generating candidate artwork never confirms labels or alters retrieval memory");
Check(handler.ImageBodies.All(b => b.Contains("1024x1536") && b.Contains("Painterly") && b.Contains("Dreamlike") && b.Contains("data:image/jpeg;base64,") && b.Contains("distinctive eye color")), "Previews use the original reference and the main studio's image settings and continuity instructions");
Reject(() => suggestions.ArtworkPath("../references/photo.png"), "invalid_artwork");
var afterArtworkCalls = handler.Bodies.Count;
Check(suggestions.Start(new([first.CaseId, second.CaseId], true, true)).Status == "complete" && handler.Bodies.Count == afterArtworkCalls,
    "Restarting image preparation reuses completed PNGs and phrases without new paid calls");
if (args.Contains("--browser-fixture")) {
    await suggestions.StopAsync(default); suggestions.Dispose();
    Console.WriteLine(JsonSerializer.Serialize(new { fixtureRoot = root })); return;
}
var draft = suggestions.Draft(first.CaseId)!;
Reject(() => suggestions.Review(new(first.CaseId, draft.Id, first.Revision, null, "", ["Reason"])), "choice_required");
Reject(() => suggestions.Review(new(first.CaseId, draft.Id, first.Revision, 0, null, [])), "invalid_choice");
Reject(() => suggestions.Review(new(first.CaseId, draft.Id, 999, 0, null, ["Reason"])), "case_conflict");
Reject(() => suggestions.Review(new(first.CaseId, draft.Id, first.Revision, 0, null, draft.Candidates[0].Phrases!, false, ["unknown.png"])), "artwork_changed");
var reviewed = suggestions.Review(new(first.CaseId, draft.Id, first.Revision, 0, null, draft.Candidates[0].Phrases!, false, draft.Artworks!.Select(a => a.File).ToArray()));
Check(reviewed.AcceptedAnimals.SequenceEqual(new[] { "Horse" }) && reviewed.Preference?.ReasonSource == "human-confirmed-ai-reasons", "Confirmed selection records provenance and approved reasons");
Check(reviewed.RejectedAnimals.Length == 0 && reviewed.Preference!.OfferedChoices.Length == 3, "Unchosen alternatives are retained without becoming rejections");
Check(reviewed.Preference!.SelectedArtwork?.Choice == 0, "Confirmed feedback links to the exact generated artwork chosen by the creator");
Check(reviewed.Preference.ViewedArtworks?.Length == 3, "Feedback distinguishes images actually loaded for comparison from suggestions never viewed");
Check(reviewed.Traits.Length == 0 && memory.Index().Vectors.Single().Values.Any(v => v is not null), "Choice-only examples work in RAG without fabricated human slider ratings");
var query = new PortraitProfile(1, "new person", ChoiceHandler.Profile(), ["face_ratio"]);
Check(memory.Search(query, "new-photo", []).Single().Example.CaseId == first.CaseId, "Confirmed training choice is retrievable by geometry");
Check(memory.Search(query, "new-photo", [first.GroupId]).Length == 0, "Evaluated groups remain excluded");
Reject(() => suggestions.Review(new(first.CaseId, draft.Id, reviewed.Revision, 1, null, ["Own reason"])), "existing_labels");
var custom = suggestions.Review(new(first.CaseId, draft.Id, reviewed.Revision, null, "Frog", ["Round cheeks", "Round eyes"], true));
Check(custom.Preference is { Custom: true, ReasonSource: "human-written-or-edited" } && custom.AcceptedAnimals.Single() == "Frog", "Fourth choice records the creator's custom animal and own reasons");
var testDraft = suggestions.Draft(second.CaseId)!;
suggestions.Review(new(second.CaseId, testDraft.Id, second.Revision, 1, null, testDraft.Candidates[1].Phrases!));
Check(memory.Index().Vectors.Length == 2 && memory.Search(query, "new-photo", []).All(m => m.Example.Split == "train"), "Confirmed test choices are stored but never retrieved");
var manual = store.Save(custom with { Traits = [new("face_ratio", -5, "clear", null, ""), new("nose_length", null, "hidden", null, "")] }, custom.Revision);
Check(memory.Index().Vectors.Single(v => v.CaseId == first.CaseId).Values[0] == -1 && TeachingMemory.Value(manual, "nose_length") is null, "Manual geometry and explicit uncertainty override AI estimates");
var resumed = suggestions.Start(new([first.CaseId, second.CaseId], true));
Check(resumed.Status == "complete" && handler.Bodies.Count == afterArtworkCalls, "Resume reuses completed drafts without duplicate paid requests");
var freshService = new TeachingSuggestions(store, provider.GetRequiredService<IServiceScopeFactory>());
Check(freshService.Proposals().Length == 2 && new TeachingStore(root).Cases().Any(c => c.Preference?.Custom == true), "Drafts and confirmed preferences survive service restart");
var changed = store.Save(manual with { Reference = manual.Reference with { File = Add("extra", "train", 3).Reference.File } }, manual.Revision);
Check(changed.Preference is null, "Changing the reference clears stale choice approval");
Reject(() => suggestions.Review(new(changed.CaseId, draft.Id, changed.Revision, 0, null, draft.Candidates[0].Reasons, true)), "suggestions_stale");
handler.Duplicate = true;
var failed = suggestions.Start(new([changed.CaseId], true));
Check((await Finish(failed.Id)).Status == "stopped" && handler.Bodies.Count == afterArtworkCalls + 1, "Invalid duplicate suggestions stop the batch without retry");
Check(suggestions.Draft(changed.CaseId)!.Id == draft.Id, "Failed regeneration preserves the previous draft");
handler.Duplicate = false; handler.Hold = true;
var stopCases = new[] { Add("stop-one", "train", 11), Add("stop-two", "train", 12), Add("stop-three", "train", 13) };
var beforeStop = handler.Bodies.Count;
var stopping = suggestions.Start(new(stopCases.Select(c => c.CaseId).ToArray(), true));
for (var i = 0; i < 200 && handler.Bodies.Count < beforeStop + 2; i++) await Task.Delay(10);
suggestions.Stop(stopping.Id);
Check((await Finish(stopping.Id)).Status == "stopped" && handler.Bodies.Count == beforeStop + 2, "Stop cancels the two active requests and does not start the third portrait");
handler.Hold = false;
var restarted = suggestions.Start(new(stopCases.Select(c => c.CaseId).ToArray(), true));
Check((await Finish(restarted.Id)).Status == "complete", "Explicit restart can finish stopped and pending portraits");
var oldJobPath = Path.Combine(store.StudioRoot, "suggestions", "jobs", "interrupted-test.json");
TeachingStore.Atomic(oldJobPath, JsonSerializer.Serialize(new SuggestionJob("interrupted-test", "running", DateTimeOffset.UtcNow,
    [new(first.CaseId, first.Reference.File, "hash", "running")]), TeachingScoring.Json));
Check(freshService.Jobs().Single(j => j.Id == "interrupted-test").Status == "interrupted" && handler.Bodies.Count == beforeStop + 5,
    "A restarted service reports interruption without automatically making paid calls");
var partial = Add("partial-images", "train", 17);
await Finish(suggestions.Start(new([partial.CaseId], true)).Id);
var beforePartialImages = handler.ImageCalls; handler.FailImageAt = beforePartialImages + 2;
var partialJob = await Finish(suggestions.Start(new([partial.CaseId], true, true)).Id);
Check(partialJob.Status == "stopped" && suggestions.Draft(partial.CaseId)!.Artworks?.Length == 1,
    "A failed image request preserves earlier PNGs and stops further image calls");
handler.FailImageAt = 0;
var resumedImages = await Finish(suggestions.Start(new([partial.CaseId], true, true)).Id);
Check(resumedImages.Status == "complete" && handler.ImageCalls == beforePartialImages + 4,
    "Explicit image resume renders only the two missing candidates");
var rejectedOne = Add("rejected-image-one", "train", 21); var unrelated = Add("unrelated-images", "train", 22);
await Finish(suggestions.Start(new([rejectedOne.CaseId, unrelated.CaseId], true)).Id);
handler.RejectImageAt = handler.ImageCalls + 1;
var rejectionJob = await Finish(suggestions.Start(new([rejectedOne.CaseId, unrelated.CaseId], true, true)).Id);
var rejectedDrafts = new[] { suggestions.Draft(rejectedOne.CaseId)!, suggestions.Draft(unrelated.CaseId)! };
Check(rejectionJob.Status == "partial" && rejectedDrafts.Sum(p => p.Artworks?.Length ?? 0) == 5 && rejectedDrafts.Sum(p => p.ArtworkFailures?.Length ?? 0) == 1,
    "A candidate-specific rejection preserves five other images instead of cancelling unrelated work");
Check(rejectedDrafts.SelectMany(p => p.ArtworkFailures ?? []).Single().Code == "http_400/image_content_rejected" && !JsonSerializer.Serialize(rejectedDrafts).Contains("do-not-save-provider-error-body"),
    "Only a safe provider error category is recorded, never the raw error body");
handler.RejectImageAt = 0;
var imageCallsBeforeExplicitRetry = handler.ImageCalls;
var explicitRetry = suggestions.Start(new([rejectedOne.CaseId, unrelated.CaseId], true, true));
Check(explicitRetry.Status == "partial" && handler.ImageCalls == imageCallsBeforeExplicitRetry,
    "Restart preserves known policy refusals without resubmitting those images");
var technical = Add("technical-image-error", "train", 23);
await Finish(suggestions.Start(new([technical.CaseId], true)).Id);
handler.RejectImageAt = handler.ImageCalls + 1; handler.RejectCategory = "invalid_content_type";
var technicalJob = await Finish(suggestions.Start(new([technical.CaseId], true, true)).Id);
Check(technicalJob.Status == "stopped" && suggestions.Draft(technical.CaseId)!.ArtworkFailures is null,
    "Technical request errors still stop the batch instead of being mislabeled as policy refusals");
await suggestions.StopAsync(default); suggestions.Dispose(); freshService.Dispose();
Console.WriteLine($"Choices: {checks} checks passed. No real Meta calls.");

sealed class ChoiceHandler : HttpMessageHandler {
    public List<string> Bodies { get; } = []; public bool Duplicate { get; set; } public bool Hold { get; set; }
    public int ImageCalls { get; private set; } public int PhraseCalls { get; private set; } public List<string> ImageBodies { get; } = [];
    public int FailImageAt { get; set; }
    public int RejectImageAt { get; set; }
    public string RejectCategory { get; set; } = "image_content_rejected";
    public static PortraitFeature[] Profile() => TeachingMemory.Features.Select(f => new PortraitFeature(f.Key, f.Key == "ear_prominence" ? null : 2)).ToArray();
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
        var body = await request.Content!.ReadAsStringAsync(token); lock (Bodies) Bodies.Add(body);
        if (Hold) await Task.Delay(30000, token);
        if (request.RequestUri?.AbsolutePath == "/v1/images/edits") {
            int requestNumber; lock (Bodies) { requestNumber = ++ImageCalls; ImageBodies.Add(body); }
            if (requestNumber == FailImageAt) return new(HttpStatusCode.TooManyRequests);
            if (requestNumber == RejectImageAt) return new(HttpStatusCode.BadRequest) { Content = new StringContent(JsonSerializer.Serialize(new { error = new { code = RejectCategory, message = "do-not-save-provider-error-body" } }), Encoding.UTF8, "application/json") };
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { data = new[] { new { b64_json = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=" } } }), Encoding.UTF8, "application/json") };
        }
        if (request.RequestUri?.AbsolutePath != "/v1/chat/completions") throw new Exception("Unexpected endpoint");
        if (body.Contains("wildlens_short_choice_reasons")) {
            lock (Bodies) PhraseCalls++;
            using var requestJson = JsonDocument.Parse(body);
            var source = requestJson.RootElement.GetProperty("messages")[1].GetProperty("content").GetString()!;
            var input = JsonSerializer.Deserialize<TeachingAnimalOption[]>(source, TeachingScoring.Json)!;
            var phraseContent = JsonSerializer.Serialize(new { candidates = input.Select(c => new { c.Animal, phrases = new[] { "Long face", "Round eyes", "Wide mouth" } }) }, TeachingScoring.Json);
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { choices = new[] { new { message = new { content = phraseContent } } }, usage = new { prompt_tokens = 100, completion_tokens = 50 } }), Encoding.UTF8, "application/json") };
        }
        var candidates = new[] { "Horse", Duplicate ? "horse" : "Frog", "Owl" }.Select(animal => new TeachingAnimalOption(animal, ["Visible face shape relates to this animal", "Visible eye geometry relates to this animal", "Visible mouth shape relates to this animal"])).ToArray();
        var content = JsonSerializer.Serialize(new { usable = true, features = Profile(), salientFeatures = new[] { "face_ratio", "nose_length" }, candidates }, TeachingScoring.Json);
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { choices = new[] { new { message = new { content } } }, usage = new { prompt_tokens = 100, completion_tokens = 500 } }), Encoding.UTF8, "application/json") };
    }
}
