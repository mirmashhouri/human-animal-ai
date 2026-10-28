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
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
        var body = await request.Content!.ReadAsStringAsync(token);
        Calls.Add((request.RequestUri!, body, request.Headers.Authorization?.ToString() ?? ""));
        if (request.RequestUri!.AbsolutePath.EndsWith("images/edits") && FailImage)
            return new(HttpStatusCode.TooManyRequests) { Content = new StringContent("{}") };
        object response = request.RequestUri!.AbsolutePath switch {
            "/v1/chat/completions" => new { choices = new[] { new { message = new { content = JsonSerializer.Serialize(new {
                subjectVisible = true, title = "Woodland light", pose = "A three-quarter view", composition = "Soft light and open framing",
                animalName = "Fox", animalReason = "An artistic silhouette analogy", story = "A dreamlike woodland portrait.", palette = new[] { "#223344", "#aabbcc", "#ddeeff" }
            }) } } } },
            "/v1/responses" => new { status = "completed", output = new[] { new { content = new[] { new { type = "output_text",
                text = "<0f>0<|box;x1=10;y1=20;x2=14;y2=24;w=100;h=100|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>" } } } } },
            "/v1/images/edits" => new { data = new[] { new { b64_json = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=" } } },
            _ => throw new Exception("Unexpected URL: " + request.RequestUri)
        };
        return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(response), Encoding.UTF8, "application/json") };
    }
}
