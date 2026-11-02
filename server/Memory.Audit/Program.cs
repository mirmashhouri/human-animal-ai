using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.Extensions.Configuration;

if (args.Length is < 5 or > 7 || args[0] != "--live") {
    Console.WriteLine("Explicit live check: --live <private-data-root> <backend-root> <new-output-folder> <case-id> [case-id] [case-id]. At most nine Spark calls; no SAM/artwork or retries."); return;
}
var ownerRoot = Path.GetFullPath(args[1]); var backendRoot = Path.GetFullPath(args[2]); var output = Path.GetFullPath(args[3]); var ids = args[4..];
if (ids.Distinct().Count() != ids.Length || Directory.Exists(output)) throw new Exception("Use distinct cases and a fresh output folder.");
var config = new ConfigurationManager();
// Reuse the backend's normal credential loader. Never print/copy credentials or authentication state.
LocalEnvironment.Configure(config,backendRoot,true,[]);
if (!WildLensMeta.Ready(config)) throw new Exception("Meta access is not ready. No model requests made.");
var owner = new TeachingStore(ownerRoot); var initial = owner.Cases();
var selected = ids.Select(id => initial.Single(c => c.CaseId == id)).ToArray();
if (selected.Any(c => !TeachingMemory.Eligible(c))) throw new Exception("This audit requires 1–3 eligible, labeled training cases.");
var originalHash = HashFile(Path.Combine(ownerRoot,"preferences.jsonl"));
Directory.CreateDirectory(Path.Combine(output,"snapshot","references"));
File.WriteAllText(Path.Combine(output,"snapshot","preferences.jsonl"),string.Join('\n',initial.Select(c => JsonSerializer.Serialize(c,TeachingScoring.Json)))+"\n",new UTF8Encoding(false));
foreach (var c in initial.Where(TeachingMemory.Indexable).DistinctBy(c => c.Reference.File))
    File.Copy(owner.PhotoPath(c.Reference.File),Path.Combine(output,"snapshot",c.Reference.File));
var snapshot = new TeachingStore(Path.Combine(output,"snapshot")); var memory = new TeachingMemory(snapshot);
memory.SetEnabled(true); var pool = memory.Capture();
using var recording = new MeteredHandler();
using var client = new HttpClient(recording) { Timeout=TimeSpan.FromSeconds(180),MaxResponseContentBufferSize=24*1024*1024 };
var meta = new WildLensMeta(client,config,new WildLensTickets(),new WildLensGate(),memory);
var rows = new List<AuditRow>(); var originals = new List<TeachingPrediction>(); var personalized = new List<TeachingPrediction>();
foreach (var c in selected) {
    var encoded = Convert.ToBase64String(File.ReadAllBytes(snapshot.PhotoPath(c.Reference.File)));
    Console.WriteLine("Checking " + c.PersonPosition + ": original selection…");
    var start = recording.Calls.Count;
    try {
        var baseline = await meta.InspectAsync(new(encoded,true,Segment:false),default,false,[c.GroupId]);
        if (baseline.Analysis.GroupPhoto) throw new Exception("Multiple clear people remain in the selected reference.");
        Console.WriteLine("Checking " + c.PersonPosition + ": personalized selection, own group excluded…");
        var adapted = await meta.InspectAsync(new(encoded,true,Segment:false),default,true,[c.GroupId]);
        if (adapted.Analysis.GroupPhoto) throw new Exception("Multiple clear people remain in the selected reference.");
        var evidence = adapted.MemoryEvidence ?? [];
        if (evidence.Any(e => initial.Single(x => x.CaseId == e.CaseId).GroupId == c.GroupId)) throw new Exception("Evaluation group leaked into retrieval.");
        var calls = recording.Calls.Skip(start).ToArray();
        var row = new AuditRow(c.CaseId,c.PersonPosition,c.AcceptedAnimals,c.Revision,c.Traits.Count(t=>t.Value is not null),
            baseline.Analysis.AnimalName,baseline.Analysis.AnimalReason,adapted.Analysis.AnimalName,adapted.Analysis.AnimalReason,
            evidence.Select(e => new AuditEvidence(e.CaseId,initial.Single(x=>x.CaseId==e.CaseId).PersonPosition,e.Revision,e.Score)).ToArray(),
            adapted.Personalization?.Status ?? "unknown",calls.Sum(x=>x.InputTokens),calls.Sum(x=>x.OutputTokens),calls.Sum(x=>x.EstimatedUsd),calls.Sum(x=>x.Seconds));
        rows.Add(row); originals.Add(new(c.CaseId,[baseline.Analysis.AnimalName])); personalized.Add(new(c.CaseId,[adapted.Analysis.AnimalName],Evidence:evidence));
        File.WriteAllText(Path.Combine(output,"progress.json"),JsonSerializer.Serialize(rows,TeachingScoring.Json));
        Console.WriteLine($"{c.PersonPosition}: {row.Original} → {row.Personalized}; {evidence.Length} reference(s); about ${row.EstimatedUsd:F4}.");
    } catch (Exception error) {
        File.WriteAllText(Path.Combine(output,"partial-error.json"),JsonSerializer.Serialize(new { subject=c.PersonPosition,error=error.Message,calls=recording.Calls,rows },TeachingScoring.Json));
        throw; // Preserve progress; never retry or continue spending after a provider failure.
    }
}
var current = owner.Cases();
if (selected.Any(c => current.Single(x => x.CaseId==c.CaseId).Revision!=c.Revision)) throw new Exception("Evaluated feedback changed during the check. Progress is saved; benchmark snapshots were not imported.");
var version = WildLensMeta.Spark(config)+" / "+WildLensMeta.PromptVersion;
var baselineRun = owner.SaveRun("Three taught portraits · original · live",version,"live-leave-one-person-out",selected,originals.ToArray());
var adaptedRun = owner.SaveRun("Three taught portraits · personalized · live",version+"+"+TeachingMemory.Version+"/"+WildLensMeta.MemoryGuidanceVersion,"live-leave-one-person-out",selected,personalized.ToArray(),memoryHash:pool.Index.DatasetHash);
var unchanged = originalHash==HashFile(Path.Combine(ownerRoot,"preferences.jsonl"));
var summary = new {
    createdAt=DateTimeOffset.UtcNow,model=WildLensMeta.Spark(config),protocol="Each target's entire related group excluded. Snapshot pool fixed before calls. Exact accepted-name scoring. One run per mode aggregates the three leave-one-person-out predictions.",
    eligibleTeachingExamples=pool.Index.Vectors.Count(v=>v.Split=="train"),evaluated=selected.Length,baseline=baselineRun.Metrics,personalized=adaptedRun.Metrics,
    calls=recording.Calls.Count,inputTokens=recording.Calls.Sum(x=>x.InputTokens),outputTokens=recording.Calls.Sum(x=>x.OutputTokens),estimatedUsd=recording.Calls.Sum(x=>x.EstimatedUsd),
    pricing="Muse Spark standard: uncached input $1.25/M, cached input $0.15/M, output including reasoning $4.25/M; estimate, not a billing statement.",
    baselineRunId=baselineRun.Id,personalizedRunId=adaptedRun.Id,feedbackUnchanged=unchanged,rows
};
File.WriteAllText(Path.Combine(output,"results.json"),JsonSerializer.Serialize(summary,new JsonSerializerOptions(TeachingScoring.Json){WriteIndented=true}));
var report = new StringBuilder("# Your first three teaching examples: live comparison\n\n");
report.AppendLine("Each portrait was tested with its own related group excluded from retrieval. No SAM or artwork generation. These three folds test transfer from the other two examples; they are not a reliable accuracy estimate. Model variability can also change answers.\n");
report.AppendLine("| Portrait | Your accepted choices | Original | Personalized | Retrieved examples |\n|---|---|---|---|---|");
foreach(var row in rows) report.AppendLine($"| {Clean(row.Subject)} | {Clean(string.Join(" / ",row.Accepted))} | {Clean(row.Original)} | {Clean(row.Personalized)} | {Clean(string.Join(", ",row.Evidence.Select(e=>e.Subject)))} |");
report.AppendLine($"\nExact accepted-name matches: original **{baselineRun.Metrics.Top1Hits}/{selected.Length}**; personalized **{adaptedRun.Metrics.Top1Hits}/{selected.Length}**. Breed names/synonyms are not silently treated as generic accepted animals.\n");
foreach(var row in rows) {
    report.AppendLine($"## {row.Subject}\n\nOriginal: **{row.Original}** — {row.OriginalReason}\n\nPersonalized: **{row.Personalized}** — {row.PersonalizedReason}\n\nMemory: {row.MemoryStatus}; {row.Evidence.Length} retrieved examples.\n");
}
report.AppendLine($"Requests: {recording.Calls.Count}; input tokens: {recording.Calls.Sum(x=>x.InputTokens):N0}; output tokens including reasoning: {recording.Calls.Sum(x=>x.OutputTokens):N0}; estimated standard-rate cost: **${recording.Calls.Sum(x=>x.EstimatedUsd):F4}**.\n\nFeedback file unchanged: **{unchanged}**. Two comparison runs are saved in the private Benchmark tab.\n");
report.AppendLine("## Interpretation\n\nOnly three eligible teaching examples are available, and none currently has a standout-feature checkbox selected. Known numeric traits therefore have equal default importance. The original three group-photo preferences remain unassigned and are not retrieved. No labels, ratings, priorities or splits were modified.\n\nThis checks whether memory is used and shows observed output differences. It does not establish that personalization improves on new people.\n");
File.WriteAllText(Path.Combine(output,"comparison.md"),report.ToString());
Console.WriteLine(JsonSerializer.Serialize(new { status="complete",report=Path.Combine(output,"comparison.md"),originalAccepted=baselineRun.Metrics.Top1Hits,personalizedAccepted=adaptedRun.Metrics.Top1Hits,evaluated=selected.Length,requests=recording.Calls.Count,estimatedUsd=recording.Calls.Sum(x=>x.EstimatedUsd),feedbackUnchanged=unchanged }));

static string HashFile(string path)=>Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));
static string Clean(string value)=>value.Replace('|','/').Replace('\n',' ');
sealed record AuditEvidence(string CaseId,string Subject,int Revision,double Score);
sealed record AuditRow(string CaseId,string Subject,string[] Accepted,int Revision,int RatedFeatures,string Original,string OriginalReason,string Personalized,string PersonalizedReason,AuditEvidence[] Evidence,string MemoryStatus,int InputTokens,int OutputTokens,decimal EstimatedUsd,double Seconds);
sealed record CallUsage(int InputTokens,int OutputTokens,int CachedInputTokens,decimal EstimatedUsd,double Seconds,int HttpStatus);
sealed class MeteredHandler : DelegatingHandler {
    public List<CallUsage> Calls {get;}=[];
    public MeteredHandler():base(new HttpClientHandler{AllowAutoRedirect=false}){}
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) {
        if(request.RequestUri?.Host!="api.meta.ai" || request.RequestUri.AbsolutePath!="/v1/chat/completions" || Calls.Count>=9) throw new Exception("Audit request bound or endpoint rejected.");
        var clock=Stopwatch.StartNew(); var response=await base.SendAsync(request,token);
        var input=0;var output=0;var cached=0;
        try {
            using var doc=JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
            if(doc.RootElement.TryGetProperty("usage",out var usage)) {
                if(usage.TryGetProperty("prompt_tokens",out var i)) input=i.GetInt32();
                if(usage.TryGetProperty("completion_tokens",out var o)) output=o.GetInt32();
                if(usage.TryGetProperty("prompt_tokens_details",out var details)&&details.ValueKind==JsonValueKind.Object&&details.TryGetProperty("cached_tokens",out var c)) cached=c.GetInt32();
            }
        } catch(JsonException) { }
        clock.Stop(); var cost=((input-cached)*1.25m+cached*.15m+output*4.25m)/1000000m;
        Calls.Add(new(input,output,cached,cost,clock.Elapsed.TotalSeconds,(int)response.StatusCode)); return response;
    }
}
