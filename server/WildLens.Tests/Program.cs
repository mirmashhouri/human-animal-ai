using System.Net;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.Extensions.Configuration;

var root = Directory.GetCurrentDirectory();
var jpeg = File.ReadAllBytes(Path.Combine(root, "apps/mobile/assets/photos/sample-portrait.jpg"));
var encoded = Convert.ToBase64String(jpeg);
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["WildLens:ApiKey"] = "test-only-not-a-real-key", ["WildLens:EnablePaidRequests"] = "true", ["WildLens:CreditConfirmed"] = "true"
}).Build();
var handler = new MetaHandler();
var tickets = new WildLensTickets();
var service = new WildLensMeta(new HttpClient(handler), config, tickets, new WildLensGate());
var count = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception("FAIL " + name); Console.WriteLine("PASS " + name); count++; }
async Task Reject(Func<Task> action, string code) {
    try { await action(); throw new Exception("Expected rejection: " + code); }
    catch (MatchException e) { Check(e.Code == code, code); }
}

await Reject(() => service.InspectAsync(new(encoded, false), default), "consent_required");
Check(handler.Calls.Count == 0, "No provider request before consent");
config["WildLens:CreditConfirmed"] = "false";
await Reject(() => service.InspectAsync(new(encoded, true), default), "meta_not_configured");
Check(handler.Calls.Count == 0, "No provider request before credit confirmation");
config["WildLens:CreditConfirmed"] = "true";
await Reject(() => service.InspectAsync(new(encoded, true, Palette: ["javascript:bad"]), default), "invalid_options");
await Reject(() => service.InspectAsync(new("bad image", true), default), "invalid_image");
var inspection = await service.InspectAsync(new(encoded, true, Palette: ["#112233", "#ddccee", "#668833"]), default);
Check(handler.Calls.Count == 2, "Analysis makes one Spark and one SAM request");
Check(handler.Calls.All(x => x.Uri.Host == "api.meta.ai" && x.Auth == "Bearer test-only-not-a-real-key"), "Only Meta receives the server credential");
var spark = handler.Calls.Single(x => x.Uri.AbsolutePath.EndsWith("chat/completions"));
using (var json = JsonDocument.Parse(spark.Body)) {
    Check(json.RootElement.GetProperty("model").GetString() == "muse-spark-1.3", "Requested Spark model");
    Check(json.RootElement.GetProperty("response_format").GetProperty("json_schema").GetProperty("strict").GetBoolean(), "Strict visual-analysis schema");
    Check(json.RootElement.GetProperty("messages")[1].GetProperty("content")[1].GetProperty("image_url").GetProperty("url").GetString() == "data:image/jpeg;base64," + encoded, "Actual uploaded photo reaches Spark");
}
Check(inspection.PaletteSource == "measured-in-browser" && inspection.Analysis.Palette[0] == "#112233", "Measured palette overrides estimated colors");
Check(inspection.SegmentationText.Contains("<|mask;"), "SAM mask is preserved for the official client parser");
Check(inspection.Analysis.Caption == "A playful, happy Fox", "One sharing phrase arrives in the existing Spark request");
await Reject(() => { WildLensMeta.ValidateAnalysis(inspection.Analysis with { Caption = new string('x',111) }); return Task.CompletedTask; }, "invalid_meta_output");
await Reject(() => { WildLensMeta.ValidateAnalysis(inspection.Analysis with { Caption = "Happy fox\nBright eyes" }); return Task.CompletedTask; }, "invalid_meta_output");
var artwork = await service.RenderAsync(new(encoded, inspection.Ticket, true), default);
Check(artwork.Image.StartsWith("data:image/png;base64,"), "Muse Image returns a PNG artwork");
var render = handler.Calls.Single(x => x.Uri.AbsolutePath.EndsWith("images/edits"));
using (var json = JsonDocument.Parse(render.Body)) {
    Check(json.RootElement.GetProperty("model").GetString() == "muse-image-1.0", "Requested Muse Image model");
    Check(json.RootElement.GetProperty("images")[0].GetProperty("image_url").GetString() == "data:image/jpeg;base64," + encoded, "Image editing uses the original portrait");
    Check(!json.RootElement.TryGetProperty("quality", out _), "No incompatible OpenAI image parameters");
}
await Reject(() => service.RenderAsync(new(encoded, inspection.Ticket + "bad", true), default), "expired_analysis");
await Reject(() => service.RenderAsync(new(encoded, inspection.Ticket, true, Mood: "Bold"), default), "invalid_options");
var alteredImage = jpeg.ToArray(); alteredImage[alteredImage.Length / 2] ^= 1;
await Reject(() => service.RenderAsync(new(Convert.ToBase64String(alteredImage), inspection.Ticket, true), default), "expired_analysis");
Check(handler.Calls.Count == 3, "Rejected generation requests make no additional provider calls");
handler.FailImage = true;
await Reject(() => service.RenderAsync(new(encoded, inspection.Ticket, true), default), "meta_request_failed");
Check(handler.Calls.Count == 4, "A provider error is not automatically retried");
handler.FailImage = false;
var withoutSam = await service.InspectAsync(new(encoded, true, Segment: false), default);
Check(withoutSam.SegmentationStatus == "skipped" && handler.Calls.Count == 5, "Optional isolation makes no SAM call");

handler.GroupSize = 2;
var callsBeforeGroup = handler.Calls.Count;
var group = await service.InspectAsync(new(encoded, true), default);
Check(group.Analysis.GroupPhoto && group.Analysis.Subjects?.Length == 2, "Two clear portraits are accepted and receive separate animal assignments");
Check(group.Analysis.Subjects![1].Caption == "A dreamy, wise Great horned owl", "Every group member has a phrase using its full animal name");
Check(handler.Calls.Count == callsBeforeGroup + 1 && group.SegmentationStatus == "skipped" && group.SegmentationText == "", "Group analysis uses one Spark call and skips a single-person SAM cutout");
await service.RenderAsync(new(encoded, group.Ticket, true, IsolatedSubject: "a-single-person-cutout-must-not-be-used"), default);
var groupRender = handler.Calls.Last(x => x.Uri.AbsolutePath.EndsWith("images/edits"));
using (var json = JsonDocument.Parse(groupRender.Body)) {
    Check(json.RootElement.GetProperty("images").GetArrayLength() == 1 && json.RootElement.GetProperty("images")[0].GetProperty("image_url").GetString() == "data:image/jpeg;base64," + encoded, "Group generation uses the whole original photo, without dropping anyone through isolation");
    var prompt = json.RootElement.GetProperty("prompt").GetString()!;
    Check(prompt.Contains("Viewer-left person") && prompt.Contains("Viewer-right person") && prompt.Contains("Fox") && prompt.Contains("Great horned owl"), "Every person's position and own animal reaches the image editor");
    Check(prompt.Contains("Do not swap animal assignments") && prompt.Contains("preserve them unchanged"), "Group prompt preserves assignments and people with unclear faces");
    Check(!prompt.Contains("portraitContinuity") && !prompt.Contains("naturalLengthClass"), "Group support does not reintroduce rejected matching algorithms");
    Check(!prompt.Contains("dreamy, wise"), "Sharing captions do not change species selection or the group art direction");
}
Check(handler.Calls.Count == callsBeforeGroup + 2, "A group creation uses one Spark request and one combined image edit");
await Reject(() => service.RenderAsync(new(encoded, group.Ticket, true, Animal: "Fox"), default), "invalid_options");
await Reject(() => { WildLensMeta.ValidateAnalysis(group.Analysis with { Subjects = [] }); return Task.CompletedTask; }, "invalid_meta_output");
await Reject(() => { WildLensMeta.ValidateAnalysis(group.Analysis with { Subjects = [group.Analysis.Subjects![0], group.Analysis.Subjects![1] with { Id = 1 }] }); return Task.CompletedTask; }, "invalid_meta_output");
await Reject(() => { WildLensMeta.ValidateAnalysis(group.Analysis with { Subjects = [group.Analysis.Subjects![0], group.Analysis.Subjects![1] with { Position = group.Analysis.Subjects![0].Position }] }); return Task.CompletedTask; }, "invalid_meta_output");
await Reject(() => { WildLensMeta.ValidateAnalysis(group.Analysis with { GroupPhoto = false }); return Task.CompletedTask; }, "invalid_meta_output");
handler.GroupSize = 3;
var three = await service.InspectAsync(new(encoded, true), default);
Check(three.Analysis.Subjects?.Length == 3 && three.Analysis.Subjects.Select(s => s.AnimalName).Distinct().Count() == 2, "Three-person groups work and may share an animal species");
handler.GroupSize = 1;
var partlyClear = await service.InspectAsync(new(encoded, true), default);
Check(partlyClear.Analysis.GroupPhoto && partlyClear.Analysis.Subjects?.Length == 1, "A group with only one clear face still gets a valid transformation plan");
handler.GroupSize = 0;
foreach (var (width,height) in new[] { (1000,750), (750,1000), (900,900) }) {
    // A dimension-header fixture; the fake provider never decodes or sends these bytes.
    var sized=jpeg.ToArray();
    var marker=Enumerable.Range(2,sized.Length-12).First(i=>sized[i-1]==0xff && sized[i] is 0xc0 or 0xc1 or 0xc2);
    System.Buffers.Binary.BinaryPrimitives.WriteUInt16BigEndian(sized.AsSpan(marker+4,2),(ushort)height);
    System.Buffers.Binary.BinaryPrimitives.WriteUInt16BigEndian(sized.AsSpan(marker+6,2),(ushort)width);
    Check(JpegInput.Dimensions(sized)==(width,height),$"JPEG dimensions are read from the source: {width}x{height}");
    var payload=Convert.ToBase64String(sized); var callsBefore=handler.Calls.Count;
    var direction=await service.InspectAsync(new(payload,true,Segment:false),default);
    await service.RenderAsync(new(payload,direction.Ticket,true),default);
    using var request=JsonDocument.Parse(handler.Calls.Last().Body);
    Check(request.RootElement.GetProperty("size").GetString()==$"{width}x{height}",$"Generation requests the original aspect ratio: {width}x{height}");
    Check(request.RootElement.GetProperty("prompt").GetString()!.Contains("Match the first image's aspect ratio") && handler.Calls.Count==callsBefore+2,"Source shape is preserved without any extra provider call");
}
var parsedEnv = LocalEnvironment.Parse("MODEL_API_KEY=fake\nMETA_CREDIT_CONFIRMED=false\nMETA_ENABLE_PAID_REQUESTS=false");
Check(parsedEnv["WildLens:ApiKey"] == "fake" && parsedEnv["WildLens:CreditConfirmed"] == "false", "Meta environment mappings");
using (var truncated = JsonDocument.Parse("{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"\"}}]}")) {
    await Reject(() => Task.FromResult(WildLensMeta.ReadAnalysis(truncated.RootElement)), "spark_output_limit");
}
using (var emptySpark = JsonDocument.Parse("{\"choices\":[]}")) {
    await Reject(() => Task.FromResult(WildLensMeta.ReadAnalysis(emptySpark.RootElement)), "invalid_spark_response");
}
using (var emptySam = JsonDocument.Parse("{\"status\":\"completed\",\"output\":[]}")) {
    Check(WildLensMeta.ReadSegmentation(emptySam.RootElement) == "", "SAM zero matches are distinct from malformed output");
}
using (var malformedSam = JsonDocument.Parse("{\"status\":\"completed\"}")) {
    await Reject(() => Task.FromResult(WildLensMeta.ReadSegmentation(malformedSam.RootElement)), "invalid_sam_response");
}
Console.WriteLine($"WildLens: {count} checks passed. All Meta responses were simulated; no paid calls.");

sealed class MetaHandler : HttpMessageHandler {
    public List<(Uri Uri, string Body, string Auth)> Calls { get; } = [];
    public bool FailImage { get; set; }
    public int GroupSize { get; set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
        var body = await request.Content!.ReadAsStringAsync(token);
        Calls.Add((request.RequestUri!, body, request.Headers.Authorization?.ToString() ?? ""));
        if (request.RequestUri!.AbsolutePath.EndsWith("images/edits") && FailImage)
            return new(HttpStatusCode.TooManyRequests) { Content = new StringContent("{}") };
        object response = request.RequestUri!.AbsolutePath switch {
            "/v1/chat/completions" => new { choices = new[] { new { message = new { content = JsonSerializer.Serialize(new {
                subjectVisible = true, title = "Woodland light", pose = "A three-quarter view", composition = "Soft light and open framing",
                animalName = GroupSize > 0 ? "Animal portraits" : "Fox", animalReason = "An artistic silhouette analogy", story = "A dreamlike woodland portrait.", palette = new[] { "#223344", "#aabbcc", "#ddeeff" },
                caption = "A playful, happy Fox", groupPhoto = GroupSize > 0,
                subjects = Enumerable.Range(1, GroupSize).Select(id => new {
                    id, position = id == 1 ? "Viewer-left person" : id == 2 ? "Viewer-right person" : "Back-row person",
                    animalName = id == 2 ? "Great horned owl" : "Fox", animalReason = id == 2 ? "A rounded silhouette analogy" : "A turning pose analogy", pose = "Preserve the original head angle", caption = id == 2 ? "A dreamy, wise Great horned owl" : "A playful, happy Fox"
                }).ToArray()
            }) } } } },
            "/v1/responses" => new { status = "completed", output = new[] { new { content = new[] { new { type = "output_text",
                text = "<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=100|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>" } } } } },
            "/v1/images/edits" => new { data = new[] { new { b64_json = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=" } } },
            _ => throw new Exception("Unexpected URL: " + request.RequestUri)
        };
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response), Encoding.UTF8, "application/json") };
    }
}
