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

var handler = new MemoryProvider(profile); var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
    ["WildLens:ApiKey"]="test-only-key",["WildLens:EnablePaidRequests"]="true",["WildLens:CreditConfirmed"]="true"
}).Build();
var meta = new WildLensMeta(new HttpClient(handler),config,new WildLensTickets(),new WildLensGate(),memory);
var encoded = Convert.ToBase64String(jpeg);
var personalized = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(handler.Bodies.Count == 2,"Personalized selection makes one geometry call and one art-direction call");
Check(personalized.MemoryEvidence?.Single().CaseId == train.CaseId && personalized.Personalization?.Status == "used","Inspection records the actual retrieved example and revision");
var body = handler.Bodies.Last();
Check(body.Contains("Zebra") && body.Contains("Long face and prominent mouth") && body.Split("data:image/jpeg;base64,").Length == 3,"Meta receives the new photo plus the actual selected reference photo and creator judgment");
Check(!body.Contains("Private celebrity name") && !body.Contains("held-out") && !body.Contains("legacy"),"Private identity metadata and held-out examples are never in the prompt");
await meta.RenderAsync(new(encoded,personalized.Ticket,true),default);
using (var render = JsonDocument.Parse(handler.Bodies.Last())) Check(render.RootElement.GetProperty("prompt").GetString()!.Contains("own smile") &&
    render.RootElement.GetProperty("images").GetArrayLength() == 1 && render.RootElement.GetProperty("images")[0].GetProperty("image_url").GetString() == "data:image/jpeg;base64,"+encoded,
    "Signed personalized rendering hints reach Muse Image without replacing the original reference");
handler.Profiles = [profile with { Id=1,Position="viewer-left" },profile with { Id=2,Position="viewer-middle" },profile with { Id=3,Position="viewer-right" }];
var groupMemory = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(handler.Bodies.Last().Contains("viewer-left") && handler.Bodies.Last().Contains("viewer-middle") && handler.Bodies.Last().Contains("viewer-right"),"Group retrieval distributes the context budget across all three clear portraits");
handler.Profiles = [profile];
Check(!JsonSerializer.Serialize(personalized,TeachingScoring.Json).Contains("caseId"),"Public response does not expose private case IDs");
var calls = handler.Bodies.Count;
await meta.InspectAsync(new(encoded,true,Segment:false),default,false);
Check(handler.Bodies.Count == calls + 1 && !handler.Bodies.Last().Contains("acceptedAlternatives"),"Baseline mode keeps the original one-request matcher without teaching context");
memory.SetEnabled(false); calls = handler.Bodies.Count;
await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(handler.Bodies.Count == calls + 1,"Disabling memory removes the extra geometry request");
memory.SetEnabled(true);
var benchmark = new TeachingBenchmarks(store,meta,config);
var run = await benchmark.RunAsync("Held-out personalized",[heldout.CaseId],true,default,true);
Check(run.MemoryHash is not null && run.Predictions[0].Evidence?.All(e => e.CaseId != heldout.CaseId) == true,"Personalized benchmark freezes memory provenance and excludes its ground truth");
var beforeEdit = memory.Index().DatasetHash;
handler.OnProfile = () => store.Save(changedLabel with { AcceptedAnimals=["Donkey"] },changedLabel.Revision);
var frozen = await meta.InspectAsync(new(encoded,true,Segment:false),default);
Check(frozen.MemoryHash == beforeEdit && handler.Bodies.Last().Contains("Zebra") && !handler.Bodies.Last().Contains("Donkey"),"Concurrent feedback edits cannot silently change the captured request context or its provenance");
handler.FailProfile = true; calls = handler.Bodies.Count;
try { await meta.InspectAsync(new(encoded,true,Segment:false),default); throw new Exception("Expected profile error"); }
catch (MatchException) { Check(handler.Bodies.Count == calls + 1,"Profile failure stops before animal selection and makes no automatic retry"); }
Console.WriteLine($"Memory: {checks} checks passed. No real Meta calls.");

sealed class MemoryProvider(PortraitProfile profile) : HttpMessageHandler {
    public List<string> Bodies { get; } = []; public bool FailProfile { get; set; }
    public PortraitProfile[] Profiles { get; set; } = [profile];
    public Action? OnProfile { get; set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) {
        var body = await request.Content!.ReadAsStringAsync(token); Bodies.Add(body);
        if (request.RequestUri!.AbsolutePath == "/v1/images/edits") return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { data = new[] { new { b64_json = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=" } } }),Encoding.UTF8,"application/json") };
        if (request.RequestUri.AbsolutePath != "/v1/chat/completions") throw new Exception("Unexpected provider endpoint");
        using var doc = JsonDocument.Parse(body);
        var isProfile = doc.RootElement.GetProperty("response_format").GetProperty("json_schema").GetProperty("name").GetString() == "wildlens_retrieval_profile";
        if (isProfile && FailProfile) return new(HttpStatusCode.TooManyRequests);
        if (isProfile && OnProfile is { } action) { OnProfile = null; action(); }
        var content = isProfile ? JsonSerializer.Serialize(new { subjects = Profiles },TeachingScoring.Json) : JsonSerializer.Serialize(
            new WildLensAnalysis(true,"A test portrait","Forward head","Simple composition","Horse","Long facial geometry","An illustrated moment",["#112233","#445566","#778899"]),TeachingScoring.Json);
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { choices = new[] { new { message = new { content } } } }),Encoding.UTF8,"application/json") };
    }
}
