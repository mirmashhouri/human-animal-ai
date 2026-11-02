using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.Extensions.Configuration;

// Owner-invoked batch only. Uses the same feedback and model pipeline as /teach;
// no password/session/key is read, copied or printed by this runner.
if (args.Length == 3 && args[0] == "--recovery-plan") {
    // Local preparation only; --live-plan is the separate, explicitly authorized paid step.
    var input = JsonSerializer.Deserialize<Recovery>(File.ReadAllText(args[1]),TeachingScoring.Json) ?? throw new Exception("Missing recovery input.");
    var original = JsonSerializer.Deserialize<Plan>(File.ReadAllText(input.OriginalPlan),TeachingScoring.Json) ?? throw new Exception("Missing original plan.");
    var output=Path.GetFullPath(args[2]); if (Directory.Exists(output)) throw new Exception("Use a new recovery folder.");
    var store=new TeachingStore(original.OwnerRoot); var cases=store.Cases();
    var targets=input.Crops.Select(c=>c.CaseId).Concat(input.Replacements.Select(r=>r.CaseId)).ToArray();
    if (targets.Length is < 1 or > 10 || targets.Distinct().Count()!=targets.Length || targets.Any(id=>!original.Items.Any(i=>i.CaseId==id))) throw new Exception("Invalid recovery targets.");
    foreach (var id in targets) {
        var c=cases.Single(c=>c.CaseId==id); var previous=original.Items.Single(i=>i.CaseId==id);
        if (c.Feedback is not null || c.AcceptedAnimals.Length>0 || c.Revision!=previous.Revision) throw new Exception("A recovery target was reviewed or changed; no replacement made.");
    }
    Directory.CreateDirectory(output); File.Copy(Path.Combine(store.Root,"preferences.jsonl"),Path.Combine(output,"before-recovery-preferences.jsonl"));
    var prepared=new List<TeachingCase>();
    foreach (var crop in input.Crops) {
        var c=cases.Single(c=>c.CaseId==crop.CaseId);
        var file=store.Upload(Convert.ToBase64String(File.ReadAllBytes(crop.Jpeg)));
        prepared.Add(store.Save(c with { Reference=c.Reference with { File=file,OriginalFile=c.Reference.OriginalFile??c.Reference.File,
            Crop=crop.Bounds,PersonOnly=true,Kind="licensed-feedback-crop" } },c.Revision));
    }
    foreach (var replacement in input.Replacements) {
        var c=cases.Single(c=>c.CaseId==replacement.CaseId);
        var manifestPath=Path.GetFullPath(replacement.Manifest); var folder=Path.GetDirectoryName(manifestPath)!;
        var records=JsonSerializer.Deserialize<JsonElement[]>(File.ReadAllText(manifestPath)) ?? throw new Exception("Missing replacement manifest.");
        var record=records[replacement.Index]; var photo=Path.GetFullPath(Path.Combine(folder,record.GetProperty("file").GetString()!));
        if (!photo.StartsWith(folder+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)) throw new Exception("Invalid replacement path.");
        var sha=record.GetProperty("sha256").GetString()!;
        if (!string.Equals(Hash(photo),sha,StringComparison.OrdinalIgnoreCase) || !record.GetProperty("author").GetString()!.Any()) throw new Exception("Invalid replacement attribution/checksum.");
        var person=record.GetProperty("person").GetString()!; var id="feedback-"+sha[..20];
        if (store.Cases().Any(old=>old.CaseId==id || string.Equals(old.PersonPosition,person,StringComparison.OrdinalIgnoreCase))) throw new Exception("Replacement already exists.");
        var saved=store.Save(new() { CaseId=id,GroupId="person-"+TeachingScoring.Hash(person)[..20],PersonPosition=person,TraitScale=5,Split="train",
            Reference=new() { File=store.Upload(Convert.ToBase64String(File.ReadAllBytes(photo))),PersonOnly=true,Kind="licensed-feedback-replacement" },
            Extra=new() { ["source"]=record.Clone(),["feedbackPack"]=JsonSerializer.SerializeToElement("wikimedia-feedback-v1"),["replacesCaseId"]=JsonSerializer.SerializeToElement(c.CaseId) } },0);
        store.Save(c with { Archived=true },c.Revision); prepared.Add(saved);
    }
    for (var worker=0;worker<3;worker++) {
        var source=Path.Combine(Path.GetDirectoryName(Path.GetFullPath(input.OriginalPlan))!,"worker-0","snapshot");
        var snapshot=new TeachingStore(Path.Combine(output,"worker-"+worker,"snapshot"));
        File.Copy(Path.Combine(source,"preferences.jsonl"),Path.Combine(snapshot.Root,"preferences.jsonl"));
        foreach (var file in Directory.GetFiles(Path.Combine(source,"references"),"*.jpg")) File.Copy(file,Path.Combine(snapshot.Root,"references",Path.GetFileName(file)));
        var memory=new TeachingMemory(snapshot); memory.SetEnabled(true); memory.Capture();
    }
    var recoveryPlan=original with { CreatedAt=DateTimeOffset.UtcNow,FeedbackHash=Hash(Path.Combine(store.Root,"preferences.jsonl")),
        Items=prepared.Select(c=>new Item(c.CaseId,c.Revision,c.PersonPosition,c.Reference.File,TeachingMemory.PhotoHash(store,c))).ToArray() };
    Save(Path.Combine(output,"plan.json"),recoveryPlan);
    Console.WriteLine(JsonSerializer.Serialize(new { status="recovery-planned",portraits=prepared.Select(c=>c.PersonPosition),maxSparkCalls=prepared.Count*2,maxImageCalls=prepared.Count,
        note="Crops and replacement sources saved; declined originals archived, not deleted. Human judgments unchanged. No model calls made." },TeachingScoring.Json)); return;
}
if (args.Length == 4 && args[0] == "--plan") {
    var root = Path.GetFullPath(args[1]); var backend = Path.GetFullPath(args[2]); var output = Path.GetFullPath(args[3]);
    if (Directory.Exists(output)) throw new Exception("Use a new batch folder; completed runs stay intact.");
    var config = Load(backend); var store = new TeachingStore(root); var cases = store.Cases();
    var targets = cases.Where(c => !c.Archived && c.Extra is not null && c.Extra.TryGetValue("feedbackPack",out var pack) && pack.GetString() == "wikimedia-feedback-v1").ToArray();
    if (targets.Length != 100 || targets.Any(c => !c.Reference.PersonOnly)) throw new Exception("Expected the 100 single-person feedback portraits.");
    var memory = new TeachingMemory(store);
    if (!memory.Settings().Enabled || !memory.Capture().Index.Vectors.Any(v => v.Split == "train")) throw new Exception("Enable the latest preference memory first.");
    Directory.CreateDirectory(output);
    var previous = new TeachingFeedback(store, Meta(config, memory)).Rounds();
    var items = targets.Select(c => new Item(c.CaseId, c.Revision, c.PersonPosition, c.Reference.File, TeachingMemory.PhotoHash(store,c))).ToArray();
    var plan = new Plan(root, backend, DateTimeOffset.UtcNow, WildLensMeta.Spark(config), WildLensMeta.ImageModel(config),
        TeachingStore.DatasetHash(cases), TeachingMemory.Version, WildLensMeta.MemoryGuidanceVersion, Hash(Path.Combine(root,"preferences.jsonl")), items);
    for (var worker = 0; worker < 3; worker++) {
        var snapshotRoot = Path.Combine(output,"worker-" + worker,"snapshot"); var snapshot = new TeachingStore(snapshotRoot);
        File.WriteAllText(Path.Combine(snapshotRoot,"preferences.jsonl"),string.Join('\n',cases.Select(c=>JsonSerializer.Serialize(c,TeachingScoring.Json)))+"\n",new UTF8Encoding(false));
        foreach (var c in cases.Where(TeachingMemory.Indexable).DistinctBy(c=>c.Reference.File)) {
            var target = snapshot.PhotoPath(c.Reference.File); Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.Copy(store.PhotoPath(c.Reference.File),target);
        }
        var frozen = new TeachingMemory(snapshot); frozen.SetEnabled(true); frozen.Capture();
    }
    Save(Path.Combine(output,"plan.json"),plan);
    Console.WriteLine(JsonSerializer.Serialize(new { status="planned", portraits=items.Length, cached=items.Count(i=>Ready(i,previous,store)),
        visionModel=plan.VisionModel,imageModel=plan.ImageModel,trainingExamples=memory.Index().Vectors.Count(v=>v.Split=="train"), maxSparkCalls=200,maxImageCalls=100,
        note="No model requests yet. Three workers use a fixed latest teaching snapshot. Judgments remain untouched." },TeachingScoring.Json)); return;
}
if (args.Length != 3 || args[0] != "--live-plan" || !int.TryParse(args[2],out var workerId) || workerId is < 0 or > 2) {
    Console.WriteLine("Plan offline: --plan <private-root> <backend-root> <new-batch-folder>. Explicit generation: --live-plan <plan.json> <worker 0..2>. Up to 2 Spark + 1 Muse Image per uncached portrait; no SAM, label changes or automatic retries."); return;
}
var planFile = Path.GetFullPath(args[1]); var outputRoot = Path.GetDirectoryName(planFile)!;
var batch = JsonSerializer.Deserialize<Plan>(File.ReadAllText(planFile),TeachingScoring.Json) ?? throw new Exception("Missing batch plan.");
var liveConfig = Load(batch.BackendRoot);
if (!WildLensMeta.Ready(liveConfig) || WildLensMeta.Spark(liveConfig)!=batch.VisionModel || WildLensMeta.ImageModel(liveConfig)!=batch.ImageModel ||
    TeachingMemory.Version!=batch.MemoryVersion || WildLensMeta.MemoryGuidanceVersion!=batch.GuidanceVersion) throw new Exception("Meta readiness or model version changed. No model calls made.");
var owner = new TeachingStore(batch.OwnerRoot);
var snapshotMemory = new TeachingMemory(new TeachingStore(Path.Combine(outputRoot,"worker-"+workerId,"snapshot")));
if (snapshotMemory.Index().DatasetHash != batch.DatasetHash) throw new Exception("The teaching snapshot changed. No model calls made.");
using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect=false }) { Timeout=TimeSpan.FromSeconds(180), MaxResponseContentBufferSize=24*1024*1024 };
var feedback = new TeachingFeedback(owner,new WildLensMeta(client,liveConfig,new WildLensTickets(),new WildLensGate(),snapshotMemory));
var progressFile = Path.Combine(outputRoot,"worker-"+workerId,"progress.json");
var outcomes = File.Exists(progressFile) ? JsonSerializer.Deserialize<List<Outcome>>(File.ReadAllText(progressFile),TeachingScoring.Json) ?? [] : [];
var stop = Path.Combine(outputRoot,"STOP");
AppDomain.CurrentDomain.UnhandledException += (_,_) => File.WriteAllText(stop,"Stopped after a worker error. Inspect its log before resuming.\n");
foreach (var item in batch.Items.Where((_,i)=>i%3==workerId)) {
    if (File.Exists(stop)) break;
    var current = owner.Cases().Single(c=>c.CaseId==item.CaseId);
    if (current.Reference.File!=item.ReferenceFile || TeachingMemory.PhotoHash(owner,current)!=item.PhotoHash || current.Revision!=item.Revision) {
        Record(new(item.CaseId,item.Title,"changed",null,"The target was edited after planning; left unchanged.")); continue;
    }
    // Previously confirmed or complete results are never overwritten on resume.
    if (current.Feedback is not null || Ready(item,feedback.Rounds(),owner)) { Record(new(item.CaseId,item.Title,"cached",null,null)); continue; }
    if (outcomes.Any(o=>o.CaseId==item.CaseId && o.Status is "refused" or "failed")) continue;
    Console.WriteLine($"START {item.Title}");
    var round = await feedback.GenerateAsync(new(item.CaseId,item.Revision,true),default);
    Record(new(item.CaseId,item.Title,round.Status,round.Id,round.Error));
    if (round.Status=="failed" && round.Error?.Contains("Crop group photos",StringComparison.Ordinal)==true) continue;
    if (round.Status is not ("ready" or "refused")) {
        File.WriteAllText(stop,"Stopped after a technical or analysis failure. Inspect saved progress; no automatic retry.\n"); break;
    }
}
Console.WriteLine(JsonSerializer.Serialize(new { worker=workerId,finished=true,outcomes=outcomes.Count,ready=outcomes.Count(o=>o.Status is "ready" or "cached"),
    feedbackUnchanged=Hash(Path.Combine(batch.OwnerRoot,"preferences.jsonl"))==batch.FeedbackHash },TeachingScoring.Json));
void Record(Outcome result) {
    outcomes.RemoveAll(o=>o.CaseId==result.CaseId); outcomes.Add(result); Save(progressFile,outcomes);
    Console.WriteLine($"{result.Status.ToUpperInvariant()} {result.Title}" + (result.Error is null ? "" : " · "+result.Error));
}
static ConfigurationManager Load(string backend) {
    var config=new ConfigurationManager(); config.AddJsonFile(Path.Combine(backend,"appsettings.json"),optional:true);
    LocalEnvironment.Configure(config,backend,true,[]); return config;
}
static WildLensMeta Meta(IConfiguration config,TeachingMemory memory) => new(new HttpClient(),config,new WildLensTickets(),new WildLensGate(),memory);
static bool Ready(Item item,FeedbackRound[] rounds,TeachingStore store) => rounds.Any(r=>r.CaseId==item.CaseId && r.PhotoHash==item.PhotoHash &&
    r.CaseRevision==item.Revision && r.Status=="ready" && r.ArtworkFile is not null && File.Exists(Path.Combine(store.StudioRoot,"feedback","artworks",r.ArtworkFile)));
static string Hash(string file) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file)));
static void Save<T>(string path,T data) => TeachingStore.Atomic(path,JsonSerializer.Serialize(data,TeachingScoring.Json));
sealed record Item(string CaseId,int Revision,string Title,string ReferenceFile,string PhotoHash);
sealed record Plan(string OwnerRoot,string BackendRoot,DateTimeOffset CreatedAt,string VisionModel,string ImageModel,string DatasetHash,string MemoryVersion,string GuidanceVersion,string FeedbackHash,Item[] Items);
sealed record Outcome(string CaseId,string Title,string Status,string? RoundId,string? Error);
sealed record Recovery(string OriginalPlan,RecoveryCrop[] Crops,RecoveryReplacement[] Replacements);
sealed record RecoveryCrop(string CaseId,string Jpeg,TeachingCrop Bounds);
sealed record RecoveryReplacement(string CaseId,string Manifest,int Index);
