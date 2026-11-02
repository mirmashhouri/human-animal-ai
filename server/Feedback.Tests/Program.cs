using System.Net;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.AspNetCore.RateLimiting;

var checks = 0;
void Check(bool ok, string name) { if (!ok) throw new Exception("FAIL " + name); Console.WriteLine("PASS " + name); checks++; }
void Reject(Action action, string code) { try { action(); throw new Exception("Expected " + code); } catch (TeachingIssue e) { Check(e.Code == code, code); } }
async Task RejectAsync(Func<Task> action, string code) { try { await action(); throw new Exception("Expected " + code); } catch (TeachingIssue e) { Check(e.Code == code, code); } }
var root = Path.Combine(Directory.GetCurrentDirectory(), ".artifacts", "feedback-unit-" + Guid.NewGuid().ToString("N"));
var store = new TeachingStore(root); var memory = new TeachingMemory(store);
var jpeg = File.ReadAllBytes("apps/mobile/assets/photos/sample-portrait.jpg");
TeachingCase Add(string id, int variant, string split = "train", bool feedbackPack = true) {
    var bytes = jpeg.ToArray(); bytes[^8] ^= (byte)variant;
    return store.Save(new() { CaseId = id, GroupId = id + "-group", PersonPosition = id, TraitScale = 5, Split = split,
        Reference = new() { File = store.Upload(Convert.ToBase64String(bytes)), PersonOnly = true },
        Extra = feedbackPack ? new() { ["feedbackPack"] = JsonSerializer.SerializeToElement("test-feedback-pack") } : null }, 0);
}
var seed = Add("seed-training", 1, feedbackPack: false);
seed = store.Save(seed with { AcceptedAnimals = ["Horse"], SelectionCues = ["Long face"], Traits = [new("face_ratio", 2, "clear", null, "")] }, seed.Revision);
var one = Add("feedback-one", 2); var two = Add("feedback-two", 3);
var handler = new FeedbackProvider();
var builder = WebApplication.CreateBuilder([]);
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
    ["WildLens:ApiKey"] = "fake-test-key", ["WildLens:EnablePaidRequests"] = "true", ["WildLens:CreditConfirmed"] = "true", ["Cors:Origins:0"] = "http://localhost:8093"
});
builder.Services.AddSingleton(store); builder.Services.AddSingleton(memory); builder.Services.AddSingleton<TeachingAuth>();
builder.Services.AddSingleton<WildLensTickets>(); builder.Services.AddSingleton<WildLensGate>(); builder.Services.AddSingleton<TeachingSuggestions>();
builder.Services.AddScoped<TeachingFeedback>(); builder.Services.AddScoped<TeachingBenchmarks>();
builder.Services.AddHttpClient<WildLensMeta>().ConfigurePrimaryHttpMessageHandler(() => handler);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins("http://localhost:8093").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
builder.Services.AddRateLimiter(options => { foreach (var name in new[] { "matching", "teaching-auth" }) options.AddFixedWindowLimiter(name, limiter => { limiter.PermitLimit = 100; limiter.Window = TimeSpan.FromMinutes(1); }); });
var app = builder.Build();
if (args.Contains("--serve-browser-fixture")) {
    app.UseCors(); app.UseRateLimiter(); app.MapTeaching(); app.MapGet("/health", () => new { status = "ok" });
    app.MapGet("/fixture/status", () => new { modelRequests = handler.Bodies.Count, correctionIncluded = handler.Bodies.Any(b => b.Contains("Long face and visible teeth")), realMetaCalls = 0 });
    Console.WriteLine("Disposable feedback browser API on 5097. Provider responses are simulated; no real credentials or network calls.");
    await app.RunAsync("http://localhost:5097"); return;
}
using var scope = app.Services.CreateScope(); var feedback = scope.ServiceProvider.GetRequiredService<TeachingFeedback>();
await RejectAsync(async () => await feedback.GenerateAsync(new(one.CaseId, one.Revision, false), default), "consent_required");
Check(handler.Bodies.Count == 0, "No provider requests before permission");
var before = store.Export();
var first = await feedback.GenerateAsync(new(one.CaseId, one.Revision, true), default);
Check(first.Status == "ready" && first.ArtworkFile is not null && File.Exists(feedback.ArtworkPath(first.ArtworkFile)), "One personalized animal image and analysis save to disk");
Check(handler.Bodies.Count == 3 && first.Profile?.Features.Length == 20 && first.Evidence?.Length == 1, "Feedback generation reuses the retrieval profile and makes two Spark plus one image request, no SAM");
Check(store.Export() == before && memory.Index().Vectors.Length == 1, "Unreviewed generations never become teaching data");
Reject(() => feedback.Review(new(first.Id, one.Revision, "disagree", "Horse", "")), "correction_required");
Reject(() => feedback.Review(new(first.Id, one.Revision, "disagree", "", "Long face")), "correction_required");
var corrected = feedback.Review(new(first.Id, one.Revision, "disagree", "Horse", "Long face and visible teeth"));
Check(corrected.AcceptedAnimals.SequenceEqual(new[] { "Horse" }) && corrected.RejectedAnimals.SequenceEqual(new[] { "Bear" }), "Disagree saves the preferred animal and this person's rejected prediction");
Check(corrected.Feedback?.Explanation == "Long face and visible teeth" && corrected.Traits.Length == 0 && corrected.Preference is null, "Human correction stays separate from AI geometry and three-choice feedback");
Check(memory.Index().Vectors.Length == 2 && TeachingMemory.Eligible(corrected), "Saving a correction updates the live vector memory immediately");
var next = await feedback.GenerateAsync(new(two.CaseId, two.Revision, true), default);
Check(handler.Bodies.Any(b => b.Contains("Long face and visible teeth") && b.Contains("generatedResultFeedback")), "The next portrait receives the saved correction as relevant RAG context");
var calls = handler.Bodies.Count;
var agreed = feedback.Review(new(next.Id, two.Revision, "agree", null, null));
Check(agreed.AcceptedAnimals.SequenceEqual(new[] { "Bear" }) && agreed.SelectionCues.Length == 0 && agreed.Feedback?.Observations.Length == 0,
    "Agree records the chosen animal without inventing human approval of the AI explanation");
Check(handler.Bodies.Count == calls && memory.Index().Vectors.Length == 3, "Both feedback verdicts save without extra Meta calls");
Reject(() => feedback.Review(new(next.Id, two.Revision, "agree", null, null)), "case_conflict");
Check(new TeachingStore(root).Cases().Single(c => c.CaseId == corrected.CaseId).Feedback?.PreferredAnimal == "Horse" && new TeachingMemory(store).Index().Vectors.Length == 3,
    "Feedback and searchable vectors survive restart");
var regenerated = await feedback.GenerateAsync(new(corrected.CaseId, corrected.Revision, true), default);
Check(regenerated.Evidence?.All(e => e.CaseId != corrected.CaseId) == true, "Regeneration excludes its own person/group rather than copying its saved answer");
Reject(() => feedback.Review(new(regenerated.Id, corrected.Revision, "agree", null, null)), "existing_labels");
var edited = store.Save(corrected with { CreativeNotes = "A concurrent edit" }, corrected.Revision);
Reject(() => feedback.Review(new(regenerated.Id, corrected.Revision, "agree", null, null, true)), "case_conflict");
var same = Add("same-species", 4);
var sameRound = await feedback.GenerateAsync(new(same.CaseId, same.Revision, true), default);
var sameFeedback = feedback.Review(new(sameRound.Id, same.Revision, "disagree", "Bear", "The animal is fine but preserve the narrow eyes"));
Check(sameFeedback.AcceptedAnimals.Single() == "Bear" && sameFeedback.RejectedAnimals.Length == 0, "A rendering disagreement with the same animal does not create conflicting labels");
var heldout = Add("heldout-person", 5, "test"); var heldoutRound = await feedback.GenerateAsync(new(heldout.CaseId, heldout.Revision, true), default);
var heldoutFeedback = feedback.Review(new(heldoutRound.Id, heldout.Revision, "agree", null, null));
Check(!TeachingMemory.Eligible(heldoutFeedback) && memory.Search(new(1, "query", FeedbackProvider.Features(), []), "new", []).All(m => m.Example.Split == "train"), "Evaluation feedback remains excluded from runtime retrieval");
var duplicateUpload = feedback.Upload(new(Convert.ToBase64String(File.ReadAllBytes(store.PhotoPath(heldout.Reference.File))), "Duplicate held-out image"));
Check(duplicateUpload.GroupId == heldout.GroupId && duplicateUpload.Split == "test", "Uploading a known held-out photo preserves its group and split");
handler.Group = true; var group = Add("group-photo", 6);
var groupRound = await feedback.GenerateAsync(new(group.CaseId, group.Revision, true), default);
Check(groupRound.Status == "failed" && groupRound.ArtworkFile is null, "A multi-person input requests a crop instead of silently teaching the first face");
handler.Group = false; handler.RefuseImage = true; var refused = Add("refused-photo", 7);
var refusal = await feedback.GenerateAsync(new(refused.CaseId, refused.Revision, true), default);
Check(refusal.Status == "refused" && refusal.Analysis is not null && refusal.ArtworkFile is null, "Provider refusal preserves the analysis without generating a training label");
Reject(() => feedback.Review(new(refusal.Id, refused.Revision, "agree", null, null)), "round_not_ready");
handler.RefuseImage = false; memory.SetEnabled(false); var off = Add("memory-off", 8); var offRound = await feedback.GenerateAsync(new(off.CaseId, off.Revision, true), default);
Check(offRound.Status == "ready" && offRound.Profile is not null && offRound.Evidence?.Length == 0, "The teaching profile is captured even with memory off, while respecting disabled reference context");
memory.SetEnabled(true);
Console.WriteLine($"Feedback: {checks} checks passed; no real model calls.");

sealed class FeedbackProvider : HttpMessageHandler {
    public List<string> Bodies { get; } = []; public bool Group { get; set; } public bool RefuseImage { get; set; }
    public static PortraitFeature[] Features() => TeachingMemory.Features.Select(f => new PortraitFeature(f.Key, f.Key == "ear_prominence" ? null : 2)).ToArray();
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
        var body = await request.Content!.ReadAsStringAsync(token); Bodies.Add(body);
        if (request.RequestUri?.AbsolutePath == "/v1/images/edits") return RefuseImage ? new(HttpStatusCode.BadRequest) {
            Content = new StringContent("{\"error\":{\"code\":\"content_policy_violation\"}}", Encoding.UTF8, "application/json")
        } : new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { data = new[] { new { b64_json = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=" } } }), Encoding.UTF8, "application/json") };
        if (request.RequestUri?.AbsolutePath != "/v1/chat/completions") throw new Exception("Unexpected model endpoint");
        using var json = JsonDocument.Parse(body); var profile = json.RootElement.GetProperty("response_format").GetProperty("json_schema").GetProperty("name").GetString() == "wildlens_retrieval_profile";
        var profiles = Group ? new[] { new PortraitProfile(1, "left", Features(), []), new PortraitProfile(2, "right", Features(), []) } : new[] { new PortraitProfile(1, "one person", Features(), ["face_ratio"]) };
        var text = profile ? JsonSerializer.Serialize(new { subjects = profiles }, TeachingScoring.Json) : JsonSerializer.Serialize(new WildLensAnalysis(true, "A portrait", "Forward pose", "Simple scene", "Bear", "A rounded visible silhouette", "A quiet scene", ["#112233", "#445566", "#778899"]), TeachingScoring.Json);
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { choices = new[] { new { message = new { content = text } } } }), Encoding.UTF8, "application/json") };
    }
}
