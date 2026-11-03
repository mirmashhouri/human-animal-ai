using System.Net;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.Extensions.Configuration;

var checks = 0;
void Check(bool value, string name) { if (!value) throw new Exception("FAIL " + name); Console.WriteLine("PASS " + name); checks++; }
var root = Path.Combine(Directory.GetCurrentDirectory(), ".artifacts", "memory-unit-" + Guid.NewGuid().ToString("N"));
var store = new TeachingStore(root); var memory = new TeachingMemory(store);
var jpeg = File.ReadAllBytes("apps/mobile/assets/photos/sample-portrait.jpg");
string Photo(int variant) { var bytes = jpeg.ToArray(); bytes[^8] ^= (byte)variant; return store.Upload(Convert.ToBase64String(bytes)); }
TeachingCase Example(string id, string split, int variant, double value, int scale = 5) => new() {
    CaseId = id, GroupId = id + "-group", PersonPosition = "Private celebrity name must never leave local metadata", Split = split,
    Reference = new() { File = Photo(variant), PersonOnly = true }, TraitScale = scale,
    AcceptedAnimals = ["Horse"], RejectedAnimals = ["Bear"], SelectionCues = ["Long face and prominent mouth"],
    Traits = [new("face_ratio",value,"clear",null,""),new("nose_length",value,"clear",null,""),new("mouth_width",value,"clear",null,"")],
    SalientFeatures = ["nose_length"], CreativeNotes = "Preserve the new subject's own smile if visible"
};
var train = store.Save(Example("train-long","train",1,4),0);
var opposite = store.Save(Example("train-short","train",2,-5),0);
var heldout = store.Save(Example("held-out","test",3,4),0);
var legacy = store.Save(Example("legacy","validation",4,80,100),0);
var blank = store.Save(Example("blank","train",5,0) with { Traits = [], SalientFeatures = [] },0);
Check(File.Exists(Path.Combine(store.StudioRoot,"memory-index.json")),"Save automatically persists the vector index");
var index = memory.Index();
Check(index.Vectors.Length == 4 && index.Vectors.All(v => v.Values.Length == 20),"Rated held-out vectors are stored while unrated cases stay unindexed");
Check(index.Vectors.Single(v => v.CaseId == legacy.CaseId).Values[0] == .8,"Legacy −100…100 values normalize without changing the source rating");
Check(index.Vectors.Single(v => v.CaseId == train.CaseId).Values[2] is null,"Unknown features are not silently neutral");
var profile = new PortraitProfile(1,"new portrait",TeachingMemory.Features.Select(f => new PortraitFeature(f.Key,f.Key is "face_ratio" or "nose_length" or "mouth_width" ? 4 : null)).ToArray(),["nose_length"]);
var matches = memory.Search(profile,"new-image",[]);
Check(matches.Length == 1 && matches[0].Example.CaseId == train.CaseId,"Geometry retrieves relevant training data without opposite shapes or held-out labels");
Check(memory.Search(profile,"new-image",[train.GroupId]).Length == 0,"Related evaluation groups cannot leak into retrieval");
Check(memory.Search(profile,TeachingMemory.PhotoHash(store,train),[]).Length == 0,"Exact duplicate image bytes are excluded");
var changedLabel = store.Save(train with { AcceptedAnimals = ["Zebra"] },train.Revision);
Check(memory.Search(profile,"new-image",[])[0].Score == matches[0].Score,"Animal labels do not enter similarity calculations");
Check(new TeachingMemory(new TeachingStore(root)).Index().Vectors.Length == 4,"Vector memory survives restart");
memory.SetEnabled(false); Check(!new TeachingMemory(store).Settings().Enabled,"Memory on/off persists independently of sessions");
memory.SetEnabled(true);
try { store.Save(blank with { Traits = [new("nose_length",6,"clear",null,"")] },blank.Revision); throw new Exception("Expected invalid rating"); } catch (TeachingIssue e) { Check(e.Code == "invalid_traits","Five-point examples reject out-of-range ratings"); }
var salienceOnly = store.Save(Example("salience-only","train",6,0) with { Traits = [], SalientFeatures = ["nose_length"] },0);
Check(memory.Search(profile,"new-image",[]).Any(m => m.Example.CaseId == salienceOnly.CaseId),"A standout checkbox can retrieve examples without invented numeric ratings");
salienceOnly = store.Save(salienceOnly with { Archived = true },salienceOnly.Revision);
Check(memory.Index().Vectors.All(v => v.CaseId != salienceOnly.CaseId),"Archiving immediately removes retrieval entries");


AnimalCandidate Option(string name, double score) => new(name, score, "Visible face shape", "A playful, happy " + name, []);
var reference = new MemoryMatch(changedLabel, 1);
var horse = Option("Horse", 1); var zebra = Option("Zebra", .94);
var context = new MemoryContext(profile, [reference], "snapshot", [horse, zebra]);
WildLensAnalysis Baseline(string name = "Horse") => new(true,"Portrait","Forward head","Simple scene",name,"Visible face shape","A scene",["#112233","#445566","#778899"], Caption:"A dreamy " + name);
Check(Math.Abs(WildLensMeta.CandidateScore(zebra, [reference], .15) - (.85 * .94 + .15)) < .000001,"Server applies the explicit 85/15 ranking formula");
Check(WildLensMeta.ApplyPreferences(Baseline(),[context],.15).AnimalName == "Zebra","A strongly supported close alternative can win");
Check(WildLensMeta.ApplyPreferences(Baseline(),[context with { Candidates=[horse,Option("Zebra",.70)] }],.20).AnimalName == "Horse","Even maximum preference cannot overturn a large visual gap");
Check(WildLensMeta.ApplyPreferences(Baseline(),[context],0).AnimalName == "Horse","Zero weight preserves the independent choice");
Check(WildLensMeta.CandidateScore(zebra,[reference,reference,reference],.15) == WildLensMeta.CandidateScore(zebra,[reference],.15),"Repeated labels cannot accumulate preference votes");
Check(WildLensMeta.ApplyPreferences(Baseline(),[context with { Candidates=[horse] }],.15).AnimalName == "Horse","Memory cannot introduce a species absent from blind AI candidates");
var tied = context with { Matches=[reference with { Example=changedLabel with { AcceptedAnimals=["Owl"],RejectedAnimals=[] } }], Candidates=[horse,Option("Zebra",1)] };
Check(WildLensMeta.ApplyPreferences(Baseline(),[tied],.15).AnimalName == "Horse","Equal final scores retain the baseline rather than changing species arbitrarily");
Check(WildLensMeta.CandidateScore(zebra with { AnimalName="Plains zebra",Aliases=["Zebra"] },[reference],.15) == WildLensMeta.CandidateScore(zebra,[reference],.15),"Blind species aliases can match saved labels without a hardcoded animal list");
Check(WildLensMeta.PreferenceWeight(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Teaching:PreferenceWeight"]="0.9" }).Build()) == .20,"Configuration has a hard 20% ceiling");
Check(WildLensMeta.PreferenceWeight(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Teaching:PreferenceWeight"]="NaN" }).Build()) == .15,"Non-finite configuration uses the safe default");
Check(WildLensMeta.PreferenceWeight(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Teaching:PreferenceWeight"]="-1" }).Build()) == 0,"Negative weights clamp to zero");

var handler = new MemoryProvider(profile); var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
    ["WildLens:ApiKey"]="test-only-key",["WildLens:EnablePaidRequests"]="true",["WildLens:CreditConfirmed"]="true"
}).Build();
var meta = new WildLensMeta(new HttpClient(handler),config,new WildLensTickets(),new WildLensGate(),memory);
var encoded = Convert.ToBase64String(jpeg);
var personalized = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(handler.Bodies.Count == 2,"Personalized selection uses one independent art direction and one blind geometry/candidate request");
Check(!handler.Bodies[0].Contains("wildlens_retrieval_profile") && handler.Bodies[1].Contains("wildlens_retrieval_profile"),"Independent baseline is obtained before optional calibration");
Check(personalized.MemoryEvidence?.Single().CaseId == train.CaseId && personalized.Personalization?.Status == "used","Inspection records actual retrieved case and revision");
Check(personalized.Analysis.AnimalName == "Zebra" && personalized.Personalization is { PreferenceWeight:.15, SelectionChanged:true },"Bounded local reranking changes a close result and reports its weight");
Check(handler.Bodies.All(b => b.Split("data:image/jpeg;base64,").Length == 2 && !b.Contains("Long face and prominent mouth") && !b.Contains("Private celebrity name") && !b.Contains("own smile")),"Both Spark requests contain only the new portrait, without private teaching photos, labels or prose");
await meta.RenderAsync(new(encoded,personalized.Ticket,true),default);
using (var render = JsonDocument.Parse(handler.Bodies.Last())) Check(!render.RootElement.GetProperty("prompt").GetString()!.Contains("own smile") &&
    render.RootElement.GetProperty("prompt").GetString()!.Contains("Zebra") && render.RootElement.GetProperty("images").GetArrayLength() == 1,
    "Muse Image receives the selected animal and current photo, with no unbounded teacher notes");
handler.ChosenAnimal = "Pangolin"; handler.AlternativeScore = .70;
var openChoice = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(openChoice.Analysis.AnimalName == "Pangolin" && openChoice.Personalization?.Status == "used" && !openChoice.Personalization.SelectionChanged,"A strong unseen species stays selected despite conflicting teaching labels");
handler.ChosenAnimal = "Bear";
var localRejection = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(localRejection.Analysis.AnimalName == "Bear","A rejected animal for a reference is not globally banned");
Check(openChoice.PromptVersion.Contains(WildLensMeta.MemoryGuidanceVersion),"Bounded ranking has its own version without changing trait-vector semantics");
handler.ChosenAnimal = "Horse"; handler.AlternativeScore = .94;
handler.Profiles = [profile with { Id=1,Position="viewer-left" },profile with { Id=2,Position="viewer-middle" },profile with { Id=3,Position="viewer-right" }];
var groupMemory = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(groupMemory.Analysis.Subjects?.Length == 3 && groupMemory.Analysis.Subjects.All(s => s.AnimalName == "Zebra") && groupMemory.MemoryEvidence?.Length == 1,"Group subjects are independently ranked without swapping ids or multiplying evidence");
handler.Profiles = [profile];
Check(!JsonSerializer.Serialize(personalized,TeachingScoring.Json).Contains("caseId"),"Public response hides private case IDs");
var calls = handler.Bodies.Count;
await meta.InspectAsync(new(encoded,true,Segment:false),default,false);
Check(handler.Bodies.Count == calls + 1,"Explicit baseline mode keeps the original one-request matcher");
memory.SetEnabled(false); calls = handler.Bodies.Count;
await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(handler.Bodies.Count == calls + 1,"Disabling memory removes the extra request");
memory.SetEnabled(true); config["Teaching:PreferenceWeight"]="0"; calls=handler.Bodies.Count;
await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(handler.Bodies.Count == calls + 1,"Zero configured weight also removes the extra request");
config["Teaching:PreferenceWeight"]=null;
var benchmark = new TeachingBenchmarks(store,meta,config);
var run = await benchmark.RunAsync("Held-out personalized",[heldout.CaseId],true,default,true);
Check(run.MemoryHash is not null && run.Predictions[0].Evidence?.All(e => e.CaseId != heldout.CaseId) == true,"Benchmark freezes memory provenance and excludes evaluation ground truth");
var beforeEdit = memory.Index().DatasetHash;
handler.OnProfile = () => store.Save(changedLabel with { AcceptedAnimals=["Donkey"] },changedLabel.Revision);
var frozen = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(frozen.MemoryHash == beforeEdit && frozen.Analysis.AnimalName == "Zebra" && frozen.MemoryEvidence?.Single().Revision == changedLabel.Revision,"Feedback edits during calibration cannot change captured evidence");
handler.FailProfile = true; calls = handler.Bodies.Count;
var fallback = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(handler.Bodies.Count == calls + 2 && fallback.Analysis.AnimalName == "Horse" && fallback.Personalization?.Status == "unavailable","Optional profile failure keeps the independent result without retrying");
calls=handler.Bodies.Count;
try { await meta.InspectAsync(new(encoded,true,Segment:false),default,onProfiles:_ => {}); throw new Exception("Expected profile error"); }
catch (MatchException) { Check(handler.Bodies.Count == calls + 2,"Teaching mode fails clearly when its required geometry is unavailable"); }
Console.WriteLine($"Memory: {checks} checks passed. No real Meta calls.");

sealed class MemoryProvider(PortraitProfile profile) : HttpMessageHandler {
    public List<string> Bodies { get; } = []; public bool FailProfile { get; set; }
    public PortraitProfile[] Profiles { get; set; } = [profile];
    public Action? OnProfile { get; set; }
    public string ChosenAnimal { get; set; } = "Horse";
    public double AlternativeScore { get; set; } = .94;
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) {
        var body = await request.Content!.ReadAsStringAsync(token); Bodies.Add(body);
        if (request.RequestUri!.AbsolutePath == "/v1/images/edits") return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { data = new[] { new { b64_json = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=" } } }),Encoding.UTF8,"application/json") };
        if (request.RequestUri.AbsolutePath != "/v1/chat/completions") throw new Exception("Unexpected provider endpoint");
        using var doc = JsonDocument.Parse(body);
        var isProfile = doc.RootElement.GetProperty("response_format").GetProperty("json_schema").GetProperty("name").GetString() == "wildlens_retrieval_profile";
        if (isProfile && FailProfile) return new(HttpStatusCode.TooManyRequests);
        if (isProfile && OnProfile is { } action) { OnProfile = null; action(); }
        var content = isProfile ? JsonSerializer.Serialize(new { subjects = Profiles.Select(p => new { p.Id,p.Position,p.Features,p.SalientFeatures,
            candidates=new[] { new AnimalCandidate(ChosenAnimal,1,"Visible geometry","A dreamy " + ChosenAnimal,[]),new AnimalCandidate("Zebra",AlternativeScore,"Visible face shape","A playful Zebra",[]) } }) },TeachingScoring.Json) : JsonSerializer.Serialize(
            new WildLensAnalysis(true,"A test portrait","Forward head","Simple composition",ChosenAnimal,"Long facial geometry","An illustrated moment",["#112233","#445566","#778899"],
                GroupPhoto:Profiles.Length > 1, Subjects:Profiles.Length > 1 ? Profiles.Select(p => new WildLensSubject(p.Id,p.Position,ChosenAnimal,"Visible geometry","Head angle","A dreamy " + ChosenAnimal)).ToArray() : [], Caption:"A dreamy " + ChosenAnimal),TeachingScoring.Json);
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { choices = new[] { new { message = new { content } } } }),Encoding.UTF8,"application/json") };
    }
}
