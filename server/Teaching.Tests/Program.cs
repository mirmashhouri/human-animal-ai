using System.Net;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

var checks = 0;
void Check(bool ok, string label) { if (!ok) throw new Exception("FAIL " + label); Console.WriteLine("PASS " + label); checks++; }
void Reject(Action action, string code) { try { action(); throw new Exception("Expected rejection: " + code); } catch (TeachingIssue error) { Check(error.Code == code, code); } }
async Task RejectAsync(Func<Task> action, string code) { try { await action(); throw new Exception("Expected rejection: " + code); } catch (TeachingIssue error) { Check(error.Code == code, code); } }
var root = Path.Combine(Directory.GetCurrentDirectory(), ".artifacts", "teaching-unit-" + Guid.NewGuid().ToString("N"));
var store = new TeachingStore(root);
var jpeg = File.ReadAllBytes("apps/mobile/assets/photos/sample-portrait.jpg"); // Local-only fixture; HTTP is simulated below.
var photo = store.Upload(Convert.ToBase64String(jpeg));
TeachingCase Example(string id, string group, string[] accepted, string[] rejected) => new() {
    CaseId = id, GroupId = group, PersonPosition = id, Reference = new() { File = photo, PersonOnly = true },
    AcceptedAnimals = accepted, RejectedAnimals = rejected, Split = "train"
};
var first = store.Save(Example("left", "group-1", ["horse"], ["bear"]), 0);
var middle = store.Save(Example("middle", "group-1", ["fish", "frog"], ["deer"]), 0);
var right = store.Save(Example("right", "group-2", ["owl"], []), 0);
Check(first.Revision == 1 && new TeachingStore(root).Cases().Length == 3, "Feedback persists across store instances");
Check(store.Cases().Single(c => c.CaseId == "middle").AcceptedAnimals.Length == 2, "Multiple accepted animals are preserved");
Reject(() => store.Save(first, 0), "case_conflict");
Reject(() => store.PhotoPath("references/../studio/auth.json"), "invalid_photo");
Reject(() => store.Save(first with { AcceptedAnimals = ["horse"], RejectedAnimals = [" HORSE "] }, first.Revision), "overlapping_labels");
Reject(() => store.Save(first with { Traits = [new("mouth_width", 20, "uncertain", null, "")] }, first.Revision), "invalid_traits");
Reject(() => store.Save(first with { Reference = first.Reference with { Crop = new(0.8, 0, 0.5, 1) } }, first.Revision), "invalid_crop");
var before = store.Cases();
var a = store.SaveRun("Original comparison", "fixture-a", "test-fixture", before, [new("left", ["bear"]), new("middle", ["deer"]), new("right", ["owl"])]);
var b = store.SaveRun("Preference comparison", "fixture-b", "test-fixture", before, [new("left", [" Horse "]), new("middle", ["frog"]), new("right", ["owl"])]);
Check(a.Metrics.Top1Hits == 1 && a.Metrics.RejectedChoices == 2 && a.Metrics.Cases == 3, "Benchmark measures accepted and rejected choices");
Check(b.Metrics.Top1Hits == 3, "Case/spacing normalization and accepted alternatives work");
var missing = store.SaveRun("Partial", "fixture-partial", "test-fixture", before, [new("left", ["horse"])]);
Check(missing.Metrics.Cases == 3 && missing.Metrics.Covered == 1 && missing.Metrics.Missing == 2 && missing.Metrics.Top1Agreement == 1.0 / 3, "Missing predictions count as misses with visible coverage");
var ranked = store.SaveRun("Ranked", "fixture-ranked", "test-fixture", before, [new("left", ["bear", "horse"])]);
Check(ranked.Metrics.Top1Hits == 0 && ranked.Metrics.Top3Hits == 1, "Top-1 and top-3 agreement are separate metrics");
var comparison = TeachingScoring.Compare(a, b);
Check(comparison.ComparableCases == 3 && comparison.Top1Delta is > 0.66 and < 0.67, "Run comparison uses the same frozen examples");
Reject(() => store.SaveRun("Duplicates", "bad", "test", before, [new("left", ["horse"]), new("left", ["horse"])]), "invalid_predictions");
var changed = store.Save(first with { AcceptedAnimals = ["donkey"] }, first.Revision);
Check(store.Cases().Select(item => item.CaseId).SequenceEqual(new[] { "left", "middle", "right" }), "Editing an example preserves library order");
Check(store.Run(a.Id).Metrics.Top1Hits == 1 && store.Run(a.Id).Cases.Single(c => c.CaseId == "left").AcceptedAnimals[0] == "horse", "Editing labels cannot rewrite a saved benchmark");
var c = store.SaveRun("Changed labels", "fixture-c", "test-fixture", store.Cases(), b.Predictions);
Check(TeachingScoring.Compare(a, c).ComparableCases == 2, "Changed labels are excluded from fair comparisons");
var splitChanged = store.Save(changed with { Split = "test" }, changed.Revision);
Check(store.Cases().Where(item => item.GroupId == "group-1").All(item => item.Split == "test"), "Related cases move splits together");
Check(store.Cases().Single(item => item.CaseId == "middle").Revision > middle.Revision, "Group split changes invalidate stale revisions");
var d = store.SaveRun("Changed splits", "fixture-d", "test-fixture", store.Cases(), b.Predictions);
Check(TeachingScoring.Compare(a, d).ComparableCases == 1, "Changed dataset splits are excluded from comparison");
var referenceChanged = store.Save(right with { Reference = right.Reference with { File = store.Upload(Convert.ToBase64String(jpeg)) } }, right.Revision);
var e = store.SaveRun("Changed input", "fixture-e", "test-fixture", store.Cases(), b.Predictions);
Check(TeachingScoring.Compare(a, e).ComparableCases == 0 && TeachingScoring.Compare(a, e).Top1Delta is null, "Different input references cannot produce a misleading comparison");
Check(File.Exists(Path.Combine(store.StudioRoot, "history.jsonl")), "Edits preserve revision history");
Check(File.ReadLines(Path.Combine(store.StudioRoot, "history.jsonl")).Any(line => JsonDocument.Parse(line).RootElement.GetProperty("previous").GetProperty("caseId").GetString() == "middle"), "Group-wide split changes also preserve each related revision");
var archived = store.Save(splitChanged with { Archived = true }, splitChanged.Revision);
Reject(() => store.SelectCases([archived.CaseId]), "invalid_scope");
Check(store.Export().Contains("\"archived\":true"), "Archive is reversible and included in private exports");

var auth = new TeachingAuth(store);
var setup = new DefaultHttpContext();
auth.Setup("disposable-test-password-only", setup);
var cookie = setup.Response.Headers.SetCookie.ToString().Split(';')[0];
var owner = new DefaultHttpContext(); owner.Request.Headers.Cookie = cookie;
Check(auth.Authenticated(owner) && setup.Response.Headers.SetCookie.ToString().Contains("httponly", StringComparison.OrdinalIgnoreCase), "Private studio uses an HttpOnly session cookie");
Check(!File.ReadAllText(Path.Combine(store.StudioRoot, "auth.json")).Contains("disposable-test-password-only"), "Password is hashed, not stored as plaintext");
Reject(() => auth.Setup("another-disposable-password", new DefaultHttpContext()), "already_configured");
Reject(() => auth.Login("incorrect", new DefaultHttpContext()), "invalid_login");
var secondAuth = new TeachingAuth(new TeachingStore(root)); var login = new DefaultHttpContext(); secondAuth.Login("disposable-test-password-only", login);
Check(login.Response.Headers.SetCookie.Count == 1, "Password works after recreating the authentication service");
auth.Logout(owner); Check(!auth.Authenticated(owner), "Sign-out invalidates the session");

var provider = new FakeSpark();
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["WildLens:ApiKey"] = "test-only-key", ["WildLens:EnablePaidRequests"] = "true", ["WildLens:CreditConfirmed"] = "true"
}).Build();
var meta = new WildLensMeta(new HttpClient(provider), config, new WildLensTickets(), new WildLensGate());
var benchmark = new TeachingBenchmarks(store, meta, config);
await RejectAsync(() => benchmark.RunAsync("No consent", [referenceChanged.CaseId], false, default), "consent_required");
Check(provider.Calls == 0, "Benchmark makes no provider call without explicit consent");
var noCrop = store.Save(referenceChanged with { Reference = referenceChanged.Reference with { PersonOnly = false } }, referenceChanged.Revision);
await RejectAsync(() => benchmark.RunAsync("No crop", [noCrop.CaseId], true, default), "subject_crop_needed");
Check(provider.Calls == 0, "A group reference cannot silently benchmark the wrong person");
var ready = store.Save(noCrop with { Reference = noCrop.Reference with { PersonOnly = true }, AcceptedAnimals = ["zebra-secret-label-test"] }, noCrop.Revision);
var live = await benchmark.RunAsync("Simulated current matcher", [ready.CaseId], true, default);
Check(provider.Calls == 1 && live.Predictions[0].Animals[0] == "Fox", "Current matcher benchmark makes one Spark-only selection request");
Check(live.Version.Contains("muse-spark-1.3") && live.Version.Contains(WildLensMeta.PromptVersion), "Live run records the model id and prompt version");
Check(!provider.LastBody.Contains("zebra-secret-label-test"), "Benchmark does not send accepted labels to the matcher");
using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
var cancelledRun = await benchmark.RunAsync("Cancelled", [ready.CaseId], true, cancelled.Token);
Check(cancelledRun.Status == "cancelled" && provider.Calls == 1 && cancelledRun.Metrics.Missing == 1, "Cancellation saves a partial run without starting another provider call");
provider.Block = true;
provider.Started = new(TaskCreationOptions.RunContinuationsAsynchronously);
using var interrupted = new CancellationTokenSource();
var running = benchmark.RunAsync("Interrupted batch", [ready.CaseId, middle.CaseId], true, interrupted.Token);
await provider.Started.Task; interrupted.Cancel();
var partial = await running;
Check(partial.Status == "cancelled" && partial.Metrics.Missing == 2 && provider.Calls == 2, "Stopping an active request prevents later cases and preserves a partial run");
Console.WriteLine($"Teaching: {checks} checks passed. Test data is isolated; no real model requests.");

sealed class FakeSpark : HttpMessageHandler {
    public int Calls { get; private set; }
    public string LastBody { get; private set; } = "";
    public bool Block { get; set; }
    public TaskCompletionSource<bool>? Started { get; set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
        if (request.RequestUri!.AbsolutePath != "/v1/chat/completions") throw new Exception("Benchmark attempted segmentation or image generation.");
        Calls++; LastBody = await request.Content!.ReadAsStringAsync(token);
        Started?.TrySetResult(true);
        if (Block) await Task.Delay(Timeout.Infinite, token);
        var analysis = new WildLensAnalysis(true, "Test", "A turn", "Plain background", "Fox", "A shape analogy", "A test story", ["#112233", "#445566", "#778899"]);
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { choices = new[] { new { message = new { content = JsonSerializer.Serialize(analysis, TeachingScoring.Json) } } } }), Encoding.UTF8, "application/json") };
    }
}
