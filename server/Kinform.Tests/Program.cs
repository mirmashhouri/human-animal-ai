using System.Net;
using System.Text;
using System.Text.Json;
using Kinform.Api;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;

var tests = new List<(string Name, Func<Task> Run)>();
// Explicit opt-in smoke check: public animal metadata only; never loads an API key or portrait.
if (args.SequenceEqual(new[] { "--check-public-reference" }) || args.SequenceEqual(new[] { "--check-reviewed-reference" })) {
    var reviewRequested = args[0] == "--check-reviewed-reference";
    using var publicCache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
    using var publicClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) {
        Timeout = TimeSpan.FromSeconds(10), MaxResponseContentBufferSize = 2 * 1024 * 1024
    };
    publicClient.DefaultRequestHeaders.UserAgent.ParseAdd("Kinform-Local-Prototype/0.2");
    var reviewConfig = new ConfigurationManager();
    if (reviewRequested) LocalEnvironment.Configure(reviewConfig, Path.GetFullPath("server/Kinform.Api"), true, []);
    using var reviewClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) {
        Timeout = TimeSpan.FromSeconds(30), MaxResponseContentBufferSize = 256 * 1024
    };
    var reviewer = new AnimalPhotoReviewer(reviewClient, reviewConfig);
    if (reviewRequested && !reviewer.Enabled) { Console.WriteLine("Photo review requires valid backend .env settings and both paid-request/review flags. No request made."); return 1; }
    var publicResolver = new AnimalReferences(publicClient, publicCache, new ReferenceRequestGate(), reviewRequested ? reviewer : null);
    var reference = await publicResolver.ResolveAsync(new("Lion", "Panthera leo", "Public reference connectivity check, not face analysis."), default);
    Console.WriteLine(JsonSerializer.Serialize(new { reference.Name, reference.ScientificName, reference.PhotoStatus,
        reference.ImagePath, reference.PhotoCredit, reference.SourceUrl, reference.SpeciesSourceUrl, reference.PhotoReviewStatus,
        reviewer.RequestsStarted, reviewer.LastFailureCode }));
    return reviewRequested ? reference.PhotoReviewStatus is "approved" or "no_suitable" ? 0 : 1 : reference.PhotoStatus == "available" ? 0 : 1;
}
var catalogue = new Catalogue();
var jpeg = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "wwwroot", "animals", "red-fox.jpg"));
void Test(string name, Action action) => tests.Add((name, () => { action(); return Task.CompletedTask; }));
void AsyncTest(string name, Func<Task> action) => tests.Add((name, action));
void Assert(bool condition, string message = "Assertion failed") { if (!condition) throw new Exception(message); }
void Throws(string code, Action action)
{
    try { action(); throw new Exception("Expected a MatchException"); }
    catch (MatchException exception) { Assert(exception.Code == code, exception.Code); }
}

Test("Catalogue contains three distinct credited references", () => {
    Assert(catalogue.Animals.Length == 3);
    Assert(catalogue.Animals.All(a => a.SourceUrl.StartsWith("https://") && a.PhotoCredit.Length > 5));
});
Test("Catalogue accepts valid ranking order", () => Assert(catalogue.ValidateRanking(["caracal", "red-fox", "eagle-owl"])[0].Id == "caracal"));
Test("Catalogue rejects invented animal IDs", () => Throws("invalid_provider_result", () => catalogue.ValidateRanking(["lion", "red-fox", "caracal"])));
Test("Catalogue rejects duplicate IDs", () => Throws("invalid_provider_result", () => catalogue.ValidateRanking(["red-fox", "red-fox", "caracal"])));
Test("Catalogue rejects incomplete rankings", () => Throws("invalid_provider_result", () => catalogue.ValidateRanking(["caracal"])));
Test("JPEG parser accepts actual bounded reference image", () => Assert(JpegInput.Parse(Convert.ToBase64String(jpeg)).Length == jpeg.Length));
Test("JPEG parser rejects malformed base64", () => Throws("invalid_image", () => JpegInput.Parse("not-base64!!!")));
Test("JPEG parser rejects empty input", () => Throws("invalid_image", () => JpegInput.Parse("")));
Test("JPEG parser rejects non-image input", () => Throws("invalid_image", () => JpegInput.Parse(Convert.ToBase64String(Encoding.UTF8.GetBytes("not an image")))));
Test("JPEG parser rejects oversized payload", () => Throws("invalid_image", () => JpegInput.Parse(new string('A', 3 * 1024 * 1024))));
Test("JPEG parser rejects truncated file", () => Assert(!JpegInput.HasSafeDimensions(jpeg.AsSpan(0, jpeg.Length - 8))));
Test("JPEG parser rejects oversize dimensions", () => {
    byte[] oversized = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x40, 0x00, 0x40, 0x00, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9];
    Assert(!JpegInput.HasSafeDimensions(oversized));
});
AsyncTest("Demo deliberately returns fixed examples without face analysis", async () => {
    var demo = new DemoMatcher(catalogue);
    Assert(demo.IsDemo);
    Assert((await demo.MatchAsync(jpeg, default)).Select(a => a.Id).SequenceEqual((await demo.MatchAsync([], default)).Select(a => a.Id)));
});
AsyncTest("Demo honours cancellation", async () => {
    using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
    try { await new DemoMatcher(catalogue).MatchAsync(jpeg, cancelled.Token); throw new Exception("Expected cancellation"); }
    catch (OperationCanceledException) { }
});

var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["Ai:EnablePaidRequests"] = "true", ["Ai:ApiKey"] = "test-key-not-real", ["Ai:Model"] = "test-model", ["Ai:AnimalImageSource"] = "Reference"
}).Build();
string Envelope(string result) => JsonSerializer.Serialize(new { status = "completed", output = new[] {
    new { type = "message", content = new[] { new { type = "output_text", text = result } } }
}});
string ValidProfile() => JsonSerializer.Serialize(new { usablePortrait = true,
    features = VisualProfile.Fields.Select((field, index) => new { field.Name, value = new {
        observation = "Visible test geometry, not a real portrait analysis.",
        keyword = index == 0 ? "broad face" : index == 8 ? "almond shaped eyes" : index == 19 ? "not observable" : "balanced proportions",
        visibility = index == 19 ? "uncertain" : "clear",
        salience = index is 0 or 8 ? 3 : index == 19 ? 0 : 1,
        artisticEmphasis = index == 0 ? "Emphasize the broad face silhouette in a sketch." : index == 8 ? "Amplify the observed almond eye contour in a sketch." : null } }).ToDictionary(x => x.Name, x => x.value)
});
string ValidPlan() => JsonSerializer.Serialize(new { candidates = new[] {
    ("Lion", "Panthera leo"), ("Wolf", "Canis lupus"), ("Bald eagle", "Haliaeetus leucocephalus"),
    ("Red fox", "Vulpes vulpes"), ("Caracal", "Caracal caracal"), ("Eurasian lynx", "Lynx lynx"),
    ("Snow leopard", "Panthera uncia"), ("Barn owl", "Tyto alba")
    }.Select((animal, index) => new { name = animal.Item1, scientificName = animal.Item2,
        reason = "Face outline and eye shape offer a visual analogy.", difference = "Animal nose and mouth anatomy differ.",
        scores = VisualProfile.Fields.Select((field, i) => new { field.Name, score = i == 19 ? 0 : i is 0 or 8 ? 4 : index == 0 ? 4 : index == 1 ? 3 : index == 2 ? 2 : 1 })
            .ToDictionary(x => x.Name, x => x.score) })
});
SequenceHandler AnalysisHandler(string? profile = null, string? candidates = null) => new([Envelope(profile ?? ValidProfile()), Envelope(candidates ?? ValidPlan())]);

AsyncTest("Live adapter observes 20 fields before comparing eight candidates; only the first call contains an image", async () => {
    var handler = AnalysisHandler();
    var resolver = new FakeReferences();
    var matcher = new OpenAiMatcher(new HttpClient(handler), configuration, resolver);
    var result = await matcher.MatchAsync(jpeg, default);
    Assert(result[0].ScientificName == "Panthera leo" && matcher.Features.Length == 20);
    using var request = JsonDocument.Parse(handler.Bodies[0]);
    Assert(!request.RootElement.GetProperty("store").GetBoolean());
    var content = request.RootElement.GetProperty("input")[0].GetProperty("content");
    Assert(content.EnumerateArray().Count(x => x.GetProperty("type").GetString() == "input_image") == 1);
    Assert(result[0].SearchKeywords!.SequenceEqual(new[] { "broad face", "almond shaped eyes", "balanced proportions" }));
    Assert(handler.Uris.Count == 2 && resolver.Calls == 3 && !resolver.ReceivedKeywords);
    using var ranking = JsonDocument.Parse(handler.Bodies[1]);
    Assert(!ranking.RootElement.GetProperty("store").GetBoolean() && !handler.Bodies[1].Contains("input_image") && !handler.Bodies[1].Contains("data:image"));
    Assert(handler.Bodies[1].Contains("broad face") && handler.Bodies[1].Contains("weight"));
    Assert(handler.Bodies[0].Contains("caricaturist") && handler.Bodies[1].Contains("SignatureRank") && handler.Bodies[1].Contains("ArtisticEmphasis"));
    Assert(matcher.Features[0].SignatureRank == 1 && matcher.Features[8].SignatureRank == 2);
    Assert(result.All(x => x.MatchReason!.StartsWith("Signature echoes:")));
    Assert(result.All(x => x.MatchReason!.Contains("Difference:")));
    Assert(request.RootElement.GetProperty("text").GetProperty("format").GetProperty("name").GetString() == "portrait_visual_profile");
});
AsyncTest("Profile keywords reject null, unbounded, URL, numeric and control-containing output before ranking or images", async () => {
    foreach (var bad in new object?[] { null, "", new string('a', 41), "https://evil.test", "cat\nface", "cat&safe=off", 12 }) {
        var plan = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
        plan["features"]!["Face outline"]!["keyword"] = JsonSerializer.SerializeToNode(bad);
        var resolver = new FakeReferences();
        var handler = AnalysisHandler(plan.ToJsonString());
        try {
            await new OpenAiMatcher(new HttpClient(handler), configuration, resolver).MatchAsync(jpeg, default);
            throw new Exception("Expected invalid keywords rejection");
        } catch (MatchException e) { Assert(e.Code == "invalid_provider_result" && resolver.Calls == 0 && handler.Uris.Count == 1); }
    }
});
AsyncTest("Live adapter rejects unusable faces", async () => {
    var handler = new FakeHandler(Envelope("""{"usablePortrait":false,"animalIds":[]}"""));
    try { await new OpenAiMatcher(new HttpClient(handler), configuration, new FakeReferences()).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException exception) { Assert(exception.Code == "unusable_portrait"); }
});
AsyncTest("Live adapter cannot charge without explicit configuration", async () => {
    var handler = new FakeHandler("{}");
    try { await new OpenAiMatcher(new HttpClient(handler), new ConfigurationBuilder().Build(), new FakeReferences()).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException exception) { Assert(exception.Code == "provider_not_configured"); Assert(handler.RequestBody is null); }
});
AsyncTest("Live adapter handles non-success HTTP responses without exposing provider body", async () => {
    var handler = new FakeHandler("private provider error", HttpStatusCode.TooManyRequests);
    try { await new OpenAiMatcher(new HttpClient(handler), configuration, new FakeReferences()).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException exception) { Assert(exception.Code == "provider_rate_limit"); Assert(!exception.Message.Contains("private")); }
});

AsyncTest("Live adapter handles malformed provider JSON", async () => {
    var handler = new FakeHandler("<html>not a model response</html>");
    try { await new OpenAiMatcher(new HttpClient(handler), configuration, new FakeReferences()).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException exception) { Assert(exception.Code == "invalid_provider_result"); }
});
AsyncTest("Live adapter handles incomplete output", async () => {
    var handler = new FakeHandler("""{"status":"incomplete","output":[]}""");
    try { await new OpenAiMatcher(new HttpClient(handler), configuration, new FakeReferences()).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException exception) { Assert(exception.Code == "provider_incomplete"); }
});
AsyncTest("Live adapter handles a safety refusal", async () => {
    var handler = new FakeHandler("""{"status":"completed","output":[{"type":"message","content":[{"type":"refusal","refusal":"Cannot compare this image."}]}]}""");
    try { await new OpenAiMatcher(new HttpClient(handler), configuration, new FakeReferences()).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException exception) { Assert(exception.Code == "provider_refused"); }
});

AsyncTest("Placeholder API key is rejected even if paid requests are enabled", async () => {
    var placeholder = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
        ["Ai:ApiKey"] = "sk-REPLACE-WITH-YOUR-OPENAI-API-KEY", ["Ai:Model"] = "gpt-5.4-mini", ["Ai:EnablePaidRequests"] = "true"
    }).Build();
    Assert(!AiConfiguration.IsReady(placeholder));
    var handler = new FakeHandler("{}");
    try { await new OpenAiMatcher(new HttpClient(handler), placeholder, new FakeReferences()).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException exception) { Assert(exception.Code == "provider_not_configured"); Assert(handler.CallCount == 0); }
});

string SpeciesPayload(bool end = false) => JsonSerializer.Serialize(new { count = 25, endOfRecords = end, results = new object[] {
    new { key = 5219243, kingdom = "Animalia", rank = "SPECIES", taxonomicStatus = "ACCEPTED", canonicalName = "Vulpes vulpes", family = "Canidae",
        datasetKey = "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c", vernacularNames = new[] { new { language = "eng", vernacularName = "Red fox" } } },
    new { key = 99, kingdom = "Plantae", rank = "SPECIES", taxonomicStatus = "ACCEPTED", canonicalName = "Not an animal" },
    new { key = 98, kingdom = "Animalia", rank = "GENUS", taxonomicStatus = "ACCEPTED", canonicalName = "Not a species" },
    new { key = 97, kingdom = "Animalia", rank = "SPECIES", taxonomicStatus = "ACCEPTED", canonicalName = "Bad dataset", datasetKey = "https://evil.invalid" }
} });

AsyncTest("GBIF returns credited species IDs, filters records, and caches searches", async () => {
    using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
    var handler = new FakeHandler(SpeciesPayload());
    var service = new GbifCatalogue(new HttpClient(handler), cache);
    var result = await service.SearchAsync("fox", "common", 0, default);
    Assert(result.Results.Length == 1 && result.Results[0].Name == "Red fox");
    Assert(result.Results[0].SourceUrl == "https://www.gbif.org/species/5219243");
    Assert(result.Results[0].DatasetUrl.StartsWith("https://www.gbif.org/dataset/"));
    Assert(result.TotalRecords == 25 && result.NextOffset == 12);
    Assert(handler.RequestUri!.Host == "api.gbif.org" && handler.RequestUri.Query.Contains("qField=VERNACULAR"));
    Assert(!handler.HadAuthorization && handler.RequestBody == "");
    await service.SearchAsync(" FOX ", "common", 0, default);
    Assert(handler.CallCount == 1);
});
AsyncTest("GBIF escapes queries and supports scientific names and bounded pages", async () => {
    using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
    var handler = new FakeHandler(SpeciesPayload());
    var service = new GbifCatalogue(new HttpClient(handler), cache);
    var result = await service.SearchAsync("Vulpes&limit=1000", "scientific", 24, default);
    Assert(handler.RequestUri!.Query.Contains("qField=SCIENTIFIC"));
    Assert(handler.RequestUri.Query.Contains("Vulpes%26limit%3D1000"));
    Assert(result.NextOffset is null);
});
AsyncTest("GBIF rejects invalid searches before making a network call", async () => {
    using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
    var handler = new FakeHandler("{}");
    var service = new GbifCatalogue(new HttpClient(handler), cache);
    foreach (var (query, field, offset) in new[] { ("", "common", 0), (new string('a', 81), "common", 0),
        ("fox", "bad", 0), ("fox", "common", -1), ("fox", "common", 1), ("fox", "common", 252) }) {
        try { await service.SearchAsync(query, field, offset, default); throw new Exception("Expected rejection"); }
        catch (MatchException exception) { Assert(exception.Code == "invalid_search"); }
    }
    Assert(handler.CallCount == 0);
});
AsyncTest("GBIF handles rate limits and malformed responses without leaking upstream content", async () => {
    foreach (var (response, status, code) in new[] { ("private", HttpStatusCode.TooManyRequests, "catalogue_busy"),
        ("private", HttpStatusCode.BadGateway, "catalogue_unavailable"), ("<html>private</html>", HttpStatusCode.OK, "catalogue_invalid_response") }) {
        using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
        var service = new GbifCatalogue(new HttpClient(new FakeHandler(response, status)), cache);
        try { await service.SearchAsync("fox", "common", 0, default); throw new Exception("Expected rejection"); }
        catch (MatchException exception) { Assert(exception.Code == code); Assert(!exception.Message.Contains("private")); }
    }
});
AsyncTest("GBIF handles empty results and final pages", async () => {
    using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
    var service = new GbifCatalogue(new HttpClient(new FakeHandler("""{"count":0,"endOfRecords":true,"results":[]}""")), cache);
    var result = await service.SearchAsync("unknown animal", "common", 0, default);
    Assert(result.Results.Length == 0 && result.NextOffset is null);
});

Test("Backend dotenv parses literal values, quotes and comments", () => {
    var settings = LocalEnvironment.Parse("# comment\r\nexport OPENAI_API_KEY=\"test-key#literal\" # comment\nOPENAI_MODEL='gpt-5.4-mini'\nAI_MODE=OpenAI\nAI_ENABLE_PAID_REQUESTS=true # billing flag");
    Assert(settings["Ai:ApiKey"] == "test-key#literal");
    Assert(settings["Ai:Model"] == "gpt-5.4-mini" && settings["Ai:Mode"] == "OpenAI");
    Assert(settings["Ai:EnablePaidRequests"] == "true");
    Assert(LocalEnvironment.Parse("OPENAI_API_KEY=$DO_NOT_EXPAND")["Ai:ApiKey"] == "$DO_NOT_EXPAND");
    Assert(LocalEnvironment.Parse("OPENAI_API_KEY=")["Ai:ApiKey"] == "");
});
Test("Backend dotenv rejects invalid settings without echoing secrets", () => {
    foreach (var value in new[] { "OPENAI_API_KEY=\"private-test-secret", "EXPO_PUBLIC_API_KEY=private-test-secret",
        "OPENAI_API_KEY=private-test-secret\nOPENAI_API_KEY=duplicate", "private-test-secret" }) {
        try { LocalEnvironment.Parse(value); throw new Exception("Expected invalid dotenv"); }
        catch (FormatException exception) { Assert(!exception.Message.Contains("private-test-secret")); }
    }
});
Test("Backend dotenv initializer preserves values and never overwrites an existing file", () => {
    var directory = Path.Combine(Path.GetTempPath(), "kinform-env-test-" + Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(directory);
    var file = Path.Combine(directory, ".env");
    try {
        Assert(LocalEnvironment.Initialize(file, configuration));
        var original = File.ReadAllText(file);
        var values = LocalEnvironment.Parse(original);
        Assert(values["Ai:ApiKey"] == "test-key-not-real" && values["Ai:EnablePaidRequests"] == "true");
        Assert(!LocalEnvironment.Initialize(file, new ConfigurationBuilder().Build()));
        Assert(File.ReadAllText(file) == original);
        var config = new ConfigurationManager();
        LocalEnvironment.Configure(config, directory, true, ["--Ai:Model=cli-test-model"]);
        Assert(config["Ai:Model"] == "cli-test-model");
        Assert(config["Ai:ApiKey"] == "test-key-not-real");
        var production = new ConfigurationManager();
        LocalEnvironment.Configure(production, directory, false, []);
        Assert(production["Ai:ApiKey"] != "test-key-not-real");
    } finally { File.Delete(file); Directory.Delete(directory); }
});

Test("Scientific names are bounded non-human binomials", () => {
    Assert(OpenAiMatcher.ValidScientificName("Panthera leo"));
    Assert(!OpenAiMatcher.ValidScientificName("Homo sapiens") && !OpenAiMatcher.ValidScientificName("https://evil.test"));
});
AsyncTest("Invalid duplicate AI suggestions never reach photo resolver", async () => {
    var handler = AnalysisHandler(candidates: ValidPlan().Replace("Canis lupus", "Panthera leo"));
    var resolver = new FakeReferences();
    try { await new OpenAiMatcher(new HttpClient(handler), configuration, resolver).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException e) { Assert(e.Code == "invalid_provider_result" && resolver.Calls == 0); }
});
Test("Photo licence, attribution, flags and URL are independently validated", () => {
    foreach (var licence in new[] { "cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nd", "" }) {
        var json = JsonSerializer.Serialize(new { id = 62738921, license_code = licence, attribution = "Photographer (CC BY)",
            url = "https://inaturalist-open-data.s3.amazonaws.com/photos/62738921/square.jpeg", flags = Array.Empty<object>(), hidden = false });
        using var payload = JsonDocument.Parse(json);
        var resolved = AnimalReferences.WithPhoto(catalogue.Animals[0], payload.RootElement);
        Assert((resolved is not null) == (licence is "cc0" or "cc-by" or "cc-by-sa"));
        if (resolved is not null) Assert(resolved.ImagePath.EndsWith("/medium.jpeg") && resolved.SourceUrl.EndsWith("/62738921"));
    }
    foreach (var photo in new[] {
        """{"id":1,"license_code":"cc-by","attribution":"Artist","url":"https://evil.test/photos/1/medium.jpg"}""",
        """{"id":1,"license_code":"cc-by","attribution":"Artist","url":"https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg","hidden":true}""",
        """{"id":1,"license_code":"cc-by","attribution":"Artist","url":"https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg","flags":[{}]}""",
        """{"id":1,"license_code":"cc-by","attribution":"","url":"https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg"}"""
    }) { using var payload = JsonDocument.Parse(photo); Assert(AnimalReferences.WithPhoto(catalogue.Animals[0], payload.RootElement) is null); }
});
AsyncTest("Species resolver caches generic metadata, not personal reasons; no portrait or auth sent", async () => {
    using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
    var handler = new FakeHandler("""{"results":[{"id":41964,"name":"Panthera leo","rank":"species","is_active":true,"ancestor_ids":[1,41964],"preferred_common_name":"Lion","default_photo":{"id":1,"license_code":"cc-by","attribution":"Artist (CC BY)","url":"https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg"}}]}""");
    var resolver = new AnimalReferences(new HttpClient(handler), cache, new ReferenceRequestGate());
    var first = await resolver.ResolveAsync(new("Lion", "Panthera leo", "First reason", ["personal search words"]), default);
    var second = await resolver.ResolveAsync(new("Lion", "Panthera leo", "Second reason"), default);
    Assert(first.Id == "inat-41964" && first.PhotoStatus == "available" && second.MatchReason == "Second reason");
    Assert(handler.CallCount == 1 && !handler.HadAuthorization && handler.RequestBody == "");
    Assert(handler.RequestUri!.Host == "api.inaturalist.org");
    Assert(first.SearchKeywords is null && second.SearchKeywords is null);
    Assert(cache.TryGetValue<Animal>("reference:metadata-only:Panthera leo", out var cached) && cached!.SearchKeywords is null && cached.MatchReason is null);
});
AsyncTest("Missing or failed public references preserve the AI suggestion without unrelated images", async () => {
    foreach (var payload in new[] { "{\"results\":[]}", "not json" }) {
        using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
        var resolver = new AnimalReferences(new HttpClient(new FakeHandler(payload)), cache, new ReferenceRequestGate());
        var result = await resolver.ResolveAsync(new("Lion", "Panthera leo", "Shape reason"), default);
        Assert(result.PhotoStatus == "unverified_species" && result.ImagePath == "" && result.MatchReason == "Shape reason");
    }
});

AsyncTest("Resolver searches a small licensed observation page when the default photo is NC", async () => {
    foreach (var ancestor in new[] { 41964, 99 }) {
        using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
        var handler = new SequenceHandler([
            """{"results":[{"id":41964,"name":"Panthera leo","rank":"species","is_active":true,"ancestor_ids":[1,41964],"default_photo":{"license_code":"cc-by-nc"}}]}""",
            JsonSerializer.Serialize(new { results = new[] { new { taxon = new { id = 557401, ancestor_ids = new[] { ancestor } },
                photos = new[] { new { id = 62738921, license_code = "cc-by", attribution = "Artist (CC BY)",
                url = "https://inaturalist-open-data.s3.amazonaws.com/photos/62738921/square.jpeg" } } } } })
        ]);
        var resolver = new AnimalReferences(new HttpClient(handler), cache, new ReferenceRequestGate());
        var result = await resolver.ResolveAsync(new("Lion", "Panthera leo", "Shape reason"), default);
        Assert(result.PhotoStatus == (ancestor == 41964 ? "available" : "unavailable"));
        Assert(handler.Uris.Count == 2 && handler.Uris[1].Query.Contains("per_page=3"));
        Assert(handler.Uris[1].Query.Contains("photo_license=cc0,cc-by,cc-by-sa"));
    }
});

var photoConfiguration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["Ai:EnablePaidRequests"] = "true", ["Ai:ApiKey"] = "test-key-not-real", ["Ai:Model"] = "test-model",
    ["Ai:PhotoReviewEnabled"] = "true", ["Ai:PhotoReviewModel"] = "gpt-5.4-mini"
}).Build();
string PhotoUrl(int id) => $"https://inaturalist-open-data.s3.amazonaws.com/photos/{id}/medium.jpg";
string ReviewPayload(int index = 0, bool passes = true) => Envelope(JsonSerializer.Serialize(new {
    selectedIndex = index, faceVisible = passes, sharp = passes, singleAnimal = passes,
    usefulAngle = passes, closeEnough = passes, speciesConsistent = passes
}));
AsyncTest("Photo review sends only bounded public images and species, with strict output and storage off", async () => {
    var handler = new FakeHandler(ReviewPayload(1));
    var reviewer = new AnimalPhotoReviewer(new HttpClient(handler), photoConfiguration);
    var reviewed = await reviewer.ReviewAsync("Panthera leo", [PhotoUrl(1), PhotoUrl(2)], default);
    Assert(reviewed.Status == "approved" && reviewed.SelectedIndex == 1 && reviewer.RequestsStarted == 1);
    using var request = JsonDocument.Parse(handler.RequestBody!);
    Assert(request.RootElement.GetProperty("model").GetString() == "gpt-5.4-mini");
    Assert(!request.RootElement.GetProperty("store").GetBoolean());
    Assert(request.RootElement.GetProperty("text").GetProperty("format").GetProperty("strict").GetBoolean());
    var images = request.RootElement.GetProperty("input")[0].GetProperty("content").EnumerateArray()
        .Where(x => x.GetProperty("type").GetString() == "input_image").ToArray();
    Assert(images.Length == 2 && images.All(x => AnimalPhotoReviewer.SafeImageUrl(x.GetProperty("image_url").GetString()!)));
    Assert(!handler.RequestBody!.Contains("base64") && !handler.RequestBody.Contains("Shape reason"));
    Assert(handler.RequestUri!.AbsoluteUri == "https://api.openai.com/v1/responses");
});
AsyncTest("Photo review can reject every image and never accepts inconsistent or invented selections", async () => {
    foreach (var (payload, status) in new[] { (ReviewPayload(-1, false), "no_suitable"), (ReviewPayload(9), "unavailable"),
        (ReviewPayload(0, false), "unavailable"), (ReviewPayload(-1), "unavailable"), ("{bad", "unavailable"),
        ("{\"status\":\"incomplete\"}", "unavailable"), (Envelope("{\"selectedIndex\":0}"), "unavailable") }) {
        var handler = new FakeHandler(payload);
        var review = await new AnimalPhotoReviewer(new HttpClient(handler), photoConfiguration).ReviewAsync("Panthera leo", [PhotoUrl(1)], default);
        Assert(review.Status == status && handler.CallCount == 1);
    }
});
AsyncTest("Photo review rejects unsafe URLs, duplicates and excessive batches before billing", async () => {
    var handler = new FakeHandler(ReviewPayload());
    var reviewer = new AnimalPhotoReviewer(new HttpClient(handler), photoConfiguration);
    foreach (var urls in new[] { Array.Empty<string>(), new[] { "data:image/jpeg;base64,private" }, new[] { "http://localhost/private.jpg" },
        new[] { PhotoUrl(1) + "\n" }, new[] { PhotoUrl(1), PhotoUrl(1) }, Enumerable.Range(1, 7).Select(PhotoUrl).ToArray() })
        Assert((await reviewer.ReviewAsync("Panthera leo", urls, default)).Status == "unavailable");
    Assert(handler.CallCount == 0 && reviewer.RequestsStarted == 0);
});
AsyncTest("Photo review requires both flags and never retries provider failures", async () => {
    var disabledHandler = new FakeHandler(ReviewPayload());
    var disabled = new AnimalPhotoReviewer(new HttpClient(disabledHandler), configuration);
    Assert((await disabled.ReviewAsync("Panthera leo", [PhotoUrl(1)], default)).Status == "disabled" && disabledHandler.CallCount == 0);
    foreach (var status in new[] { HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests, HttpStatusCode.BadGateway }) {
        var handler = new FakeHandler("private upstream error", status);
        var reviewer = new AnimalPhotoReviewer(new HttpClient(handler), photoConfiguration);
        Assert((await reviewer.ReviewAsync("Panthera leo", [PhotoUrl(1)], default)).Status == "unavailable");
        Assert(handler.CallCount == 1 && !reviewer.LastFailureCode!.Contains("private"));
    }
});
AsyncTest("Photo review honours caller cancellation without billing", async () => {
    using var source = new CancellationTokenSource(); source.Cancel();
    var handler = new FakeHandler(ReviewPayload());
    try { await new AnimalPhotoReviewer(new HttpClient(handler), photoConfiguration).ReviewAsync("Panthera leo", [PhotoUrl(1)], source.Token); throw new Exception("Expected cancellation"); }
    catch (OperationCanceledException) { Assert(handler.CallCount == 0); }
});
string PhotoTaxon() => """{"results":[{"id":41964,"name":"Panthera leo","rank":"species","is_active":true,"ancestor_ids":[1,41964],"default_photo":{"id":1,"license_code":"cc-by","attribution":"Artist (CC BY)","url":"https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg"}}]}""";
string PhotoObservations() => JsonSerializer.Serialize(new { results = Enumerable.Range(1, 3).Select(n => new {
    taxon = new { id = 41964 }, photos = Enumerable.Range(2 * n, 2).Select(i => new { id = i, license_code = "cc-by",
        attribution = "Artist (CC BY)", url = PhotoUrl(i) })
}) });
AsyncTest("Reviewed references coalesce concurrent users and cache only generic approved selections", async () => {
    using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
    var handler = new SequenceHandler([PhotoTaxon(), PhotoObservations()]);
    var reviewer = new FakePhotoReviewer(new("approved", 2));
    var resolver = new AnimalReferences(new HttpClient(handler), cache, new ReferenceRequestGate(), reviewer);
    var results = await Task.WhenAll(resolver.ResolveAsync(new("Lion", "Panthera leo", "Person A reason"), default),
        resolver.ResolveAsync(new("Lion", "Panthera leo", "Person B reason"), default));
    Assert(reviewer.Calls == 1 && handler.Uris.Count == 2 && reviewer.Urls.Length == 6);
    Assert(results.All(x => x.PhotoReviewStatus == "approved" && x.ImagePath == PhotoUrl(3)));
    Assert(results[0].MatchReason == "Person A reason" && results[1].MatchReason == "Person B reason");
});
AsyncTest("Rejected, failed or invalid photo reviews never display an unreviewed fallback", async () => {
    foreach (var review in new[] { new PhotoReview("no_suitable"), new PhotoReview("unavailable"), new PhotoReview("approved", 99) }) {
        using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 128 });
        var resolver = new AnimalReferences(new HttpClient(new SequenceHandler([PhotoTaxon(), PhotoObservations()])), cache, new ReferenceRequestGate(), new FakePhotoReviewer(review));
        var result = await resolver.ResolveAsync(new("Lion", "Panthera leo", "Preserved reason"), default);
        Assert(result.ImagePath == "" && result.PhotoStatus == "unavailable" && result.MatchReason == "Preserved reason");
        Assert(result.PhotoReviewStatus == (review.Status == "no_suitable" ? "no_suitable" : "unavailable"));
    }
});
Test("Dotenv accepts isolated photo-review controls", () => {
    var parsed = LocalEnvironment.Parse("AI_PHOTO_REVIEW_ENABLED=true\nAI_PHOTO_REVIEW_MODEL=gpt-5.4-mini");
    Assert(parsed["Ai:PhotoReviewEnabled"] == "true" && parsed["Ai:PhotoReviewModel"] == "gpt-5.4-mini");
});

AsyncTest("Character mode creates exactly one portrait-based animal and never calls the internet resolver", async () => {
    var generatedConfig = new ConfigurationBuilder().AddConfiguration(configuration).AddInMemoryCollection(new Dictionary<string, string?> {
        ["Ai:AnimalImageSource"] = "Generated"
    }).Build();
    var references = new FakeReferences(); var generator = new FakeImageGenerator();
    var result = await new OpenAiMatcher(new HttpClient(AnalysisHandler()), generatedConfig, references, generator).MatchAsync(jpeg, default);
    Assert(generator.Calls == 1 && result.Length == 1 && references.Calls == 0 && result.All(x => x.ImageOrigin == "generated"));
    Assert(generator.Portraits.Single().SequenceEqual(jpeg));
    Assert(generator.Keywords.Contains("broad face") && result[0].ScientificName == "Panthera leo");
});
AsyncTest("Character editor sends the actual portrait as one JPEG part, cartoon instructions and one output", async () => {
    var handler = new FakeHandler(JsonSerializer.Serialize(new { data = new[] { new { b64_json = Convert.ToBase64String(jpeg) } } }));
    var result = await new AnimalImageGenerator(new HttpClient(handler), configuration, new ImageGenerationGate())
        .GenerateAsync(new("Lion", "Panthera leo", "Never forward this personal reason", ["broad face"]), jpeg, default);
    Assert(result.ImageOrigin == "generated" && result.PhotoStatus == "available" && result.ImageError is null);
    Assert(result.ImagePath.StartsWith("data:image/jpeg;base64,") && result.LicenseUrl == "" && result.PhotoCredit.Contains("AI-created from your portrait"));
    Assert(handler.FormFields["model"] == "gpt-image-2" && handler.FormFields["n"] == "1");
    Assert(handler.FormFields["output_format"] == "jpeg" && handler.FormFields["quality"] == "medium" && handler.FormFields["size"] == "1024x1536");
    Assert(handler.ImageBytes!.SequenceEqual(jpeg) && handler.ImageParts == 1 && handler.ImageContentType == "image/jpeg");
    Assert(handler.ImageFieldName == "image[]" && !handler.FormFields.ContainsKey("input_fidelity"));
    var prompt = handler.FormFields["prompt"];
    Assert(!prompt.Contains("Never forward this personal reason") && prompt.Contains("broad face") && prompt.Contains("cartoon animal character") && prompt.Contains("immediately recognizable"));
    Assert(prompt.Contains("eye shape and spacing") && prompt.Contains("no human face pasted"));
    Assert(handler.RequestUri!.AbsoluteUri == "https://api.openai.com/v1/images/edits" && handler.CallCount == 1);
});
AsyncTest("Image failures stay explicit and never retry or substitute a photo", async () => {
    foreach (var status in new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden, HttpStatusCode.TooManyRequests, HttpStatusCode.BadRequest, HttpStatusCode.InternalServerError, HttpStatusCode.OK }) {
        var handler = new FakeHandler("{\"private\":\"do-not-display\"}", status);
        var result = await new AnimalImageGenerator(new HttpClient(handler), configuration, new ImageGenerationGate()).GenerateAsync(new("Lion", "Panthera leo", "Reason"), jpeg, default);
        Assert(result.PhotoStatus == "unavailable" && result.ImagePath == "" && result.ImageError is not null && !result.ImageError.Contains("do-not-display") && handler.CallCount == 1);
    }
});
AsyncTest("Generator rejects billing-disabled, invalid descriptors, saturation and cancellation before charging", async () => {
    var handler = new FakeHandler("{}");
    var disabled = new AnimalImageGenerator(new HttpClient(handler), new ConfigurationBuilder().Build(), new ImageGenerationGate());
    Assert((await disabled.GenerateAsync(new("Lion", "Panthera leo", "Reason"), jpeg, default)).ImageError is not null);
    var gate = new ImageGenerationGate(); var generator = new AnimalImageGenerator(new HttpClient(handler), configuration, gate);
    Assert((await generator.GenerateAsync(new("Lion", "Homo sapiens", "Reason"), jpeg, default)).ImageError is not null);
    Assert((await generator.GenerateAsync(new("Lion", "Panthera leo", "Reason", ["https://example.test"]), jpeg, default)).ImageError is not null);
    Assert((await generator.GenerateAsync(new("Lion", "Panthera leo", "Reason"), [], default)).ImageError is not null);
    await gate.Slots.WaitAsync(); await gate.Slots.WaitAsync(); await gate.Slots.WaitAsync();
    Assert((await generator.GenerateAsync(new("Lion", "Panthera leo", "Reason"), jpeg, default)).ImageError!.Contains("busy"));
    using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
    try { await generator.GenerateAsync(new("Lion", "Panthera leo", "Reason"), jpeg, cancelled.Token); throw new Exception("Expected cancellation"); } catch (OperationCanceledException) { }
    Assert(handler.CallCount == 0); gate.Slots.Release(3);
});
Test("Dotenv accepts generated-image settings without changing the analysis model", () => {
    var values = LocalEnvironment.Parse("AI_ANIMAL_IMAGE_SOURCE=Generated\nOPENAI_IMAGE_MODEL=gpt-image-2\nAI_IMAGE_QUALITY=medium\nOPENAI_MODEL=gpt-5.4-mini");
    Assert(values["Ai:AnimalImageSource"] == "Generated" && values["Ai:ImageModel"] == "gpt-image-2" && values["Ai:Model"] == "gpt-5.4-mini" && values["Ai:ImageQuality"] == "medium");
});

Test("Visual profile requires twenty unique named fields and enough visible geometry", () => {
    foreach (var mutation in new Action<System.Text.Json.Nodes.JsonNode>[] {
        root => root["features"]!.AsObject().Remove("Face outline"),
        root => root["features"]!["Personality"] = new System.Text.Json.Nodes.JsonObject(),
        root => root["features"]!["Face outline"]!["visibility"] = "certain",
        root => root["features"] = new System.Text.Json.Nodes.JsonArray()
    }) {
        var root = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!; mutation(root);
        using var json = JsonDocument.Parse(root.ToJsonString());
        Throws("invalid_provider_result", () => VisualProfile.Read(json.RootElement));
    }
    var hidden = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
    foreach (var field in hidden["features"]!.AsObject()) { field.Value!["visibility"] = "not_visible"; field.Value["keyword"] = "not observable"; }
    using var payload = JsonDocument.Parse(hidden.ToJsonString());
    Throws("unusable_portrait", () => VisualProfile.Read(payload.RootElement));
});
Test("Profile object order cannot change field alignment", () => {
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
    root["features"] = new System.Text.Json.Nodes.JsonObject(root["features"]!.AsObject().Reverse().Select(x => KeyValuePair.Create<string, System.Text.Json.Nodes.JsonNode?>(x.Key, x.Value!.DeepClone())));
    using var json = JsonDocument.Parse(root.ToJsonString());
    Assert(VisualProfile.Read(json.RootElement).Select(x => x.Feature).SequenceEqual(VisualProfile.Fields.Select(x => x.Name)));
});
Test("Candidate ranking is deterministic on ties and ignores unsupported colour scores", () => {
    using var profile = JsonDocument.Parse(ValidProfile()); var fields = VisualProfile.Read(profile.RootElement);
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    foreach (var item in root["candidates"]!.AsArray()) {
        item!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(field => field.Name, _ => 3));
        item["scores"]!["Iris colour"] = item["name"]!.GetValue<string>() == "Lion" ? 4 : 0;
    }
    using var first = JsonDocument.Parse(root.ToJsonString());
    var ranked = AnimalCandidateRanking.ReadAndRank(first.RootElement, fields);
    Assert(ranked.Select(x => x.ScientificName).SequenceEqual(new[] { "Canis lupus", "Caracal caracal", "Haliaeetus leucocephalus" }));
    root["candidates"] = new System.Text.Json.Nodes.JsonArray(root["candidates"]!.AsArray().Reverse().Select(x => x!.DeepClone()).ToArray());
    using var second = JsonDocument.Parse(root.ToJsonString());
    Assert(AnimalCandidateRanking.ReadAndRank(second.RootElement, fields).Select(x => x.ScientificName).SequenceEqual(ranked.Select(x => x.ScientificName)));
});
Test("Candidate scores, evidence and identities are validated before image generation", () => {
    using var profile = JsonDocument.Parse(ValidProfile()); var fields = VisualProfile.Read(profile.RootElement);
    foreach (var mutation in new Action<System.Text.Json.Nodes.JsonNode>[] {
        root => root["candidates"]![0]!["scores"]!["Face outline"] = 5,
        root => root["candidates"]![0]!["scores"]!.AsObject().Remove("Face outline"),
        root => root["candidates"]![0]!["scientificName"] = "Homo sapiens",
        root => root["candidates"]![0]!["scores"]!["Face outline"] = 3.5,
        root => root["candidates"]![0]!["scores"]!["Face outline"] = "3",
        root => root["candidates"]!.AsArray().RemoveAt(0)
    }) {
        var root = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!; mutation(root);
        using var json = JsonDocument.Parse(root.ToJsonString());
        Throws("invalid_provider_result", () => AnimalCandidateRanking.ReadAndRank(json.RootElement, fields));
    }
    var weak = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    foreach (var item in weak["candidates"]!.AsArray()) item!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(field => field.Name, _ => 2));
    using var weakJson = JsonDocument.Parse(weak.ToJsonString());
    Throws("weak_visual_matches", () => AnimalCandidateRanking.ReadAndRank(weakJson.RootElement, fields));
});
Test("Uncertain wording is normalized and never promoted into ranking evidence", () => {
    foreach (var keyword in new[] { "green eyes", "Not observable", "iris unclear" }) {
        var root = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
        root["features"]!["Iris colour"]!["keyword"] = keyword;
        using var profile = JsonDocument.Parse(root.ToJsonString());
        var fields = VisualProfile.Read(profile.RootElement);
        Assert(fields[19].Keyword == "not observable" && fields[19].Visibility == "uncertain");
        using var candidates = JsonDocument.Parse(ValidPlan());
        var ranked = AnimalCandidateRanking.ReadAndRank(candidates.RootElement, fields);
        Assert(ranked.Length == 3 && ranked.All(x => !x.SearchKeywords!.Contains(keyword) && !x.SearchKeywords.Contains("not observable")));
    }
    var contradictory = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
    contradictory["features"]!["Face outline"]!["keyword"] = "Not Observable";
    using var conflict = JsonDocument.Parse(contradictory.ToJsonString());
    Assert(VisualProfile.Read(conflict.RootElement)[0].Visibility == "uncertain");
});
Test("Named scores cannot shift when reordered and support comes only from clear high scores", () => {
    using var profile = JsonDocument.Parse(ValidProfile()); var fields = VisualProfile.Read(profile.RootElement);
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    using var original = JsonDocument.Parse(root.ToJsonString());
    var expected = AnimalCandidateRanking.ReadAndRank(original.RootElement, fields);
    foreach (var item in root["candidates"]!.AsArray()) {
        item!["scores"] = new System.Text.Json.Nodes.JsonObject(item["scores"]!.AsObject().Reverse().Select(x => KeyValuePair.Create<string, System.Text.Json.Nodes.JsonNode?>(x.Key, x.Value!.DeepClone())));
        item["scores"]!["Iris colour"] = 4;
    }
    using var reordered = JsonDocument.Parse(root.ToJsonString());
    var result = AnimalCandidateRanking.ReadAndRank(reordered.RootElement, fields);
    Assert(result.Select(x => x.ScientificName).SequenceEqual(expected.Select(x => x.ScientificName)));
    Assert(result.All(x => !x.SearchKeywords!.Contains("not observable")));
    // A weak candidate no longer aborts every otherwise valid candidate.
    root["candidates"]![0]!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(entry => entry.Name, _ => 1));
    using var weakCandidate = JsonDocument.Parse(root.ToJsonString());
    var others = AnimalCandidateRanking.ReadAndRank(weakCandidate.RootElement, fields);
    Assert(others.Length == 3 && others.All(x => x.ScientificName != "Panthera leo"));
});
AsyncTest("Outbound schemas require each named field exactly once and remove redundant support lists", async () => {
    var handler = AnalysisHandler();
    await new OpenAiMatcher(new HttpClient(handler), configuration, new FakeReferences()).MatchAsync(jpeg, default);
    using var profileRequest = JsonDocument.Parse(handler.Bodies[0]);
    var featuresSchema = profileRequest.RootElement.GetProperty("text").GetProperty("format").GetProperty("schema").GetProperty("properties").GetProperty("features");
    Assert(featuresSchema.GetProperty("type").EnumerateArray().Any(x => x.GetString() == "null"));
    Assert(featuresSchema.GetProperty("required").EnumerateArray().Select(x => x.GetString()).SequenceEqual(VisualProfile.Fields.Select(x => x.Name)));
    Assert(featuresSchema.GetProperty("properties").EnumerateObject().Count() == 20 && !featuresSchema.GetProperty("additionalProperties").GetBoolean());
    var fieldSchema = featuresSchema.GetProperty("properties").GetProperty("Face outline");
    Assert(fieldSchema.GetProperty("required").EnumerateArray().Select(x => x.GetString()).Contains("artisticEmphasis"));
    Assert(fieldSchema.GetProperty("properties").GetProperty("salience").GetProperty("maximum").GetInt32() == 3);
    Assert(!fieldSchema.GetProperty("properties").TryGetProperty("signatureRank", out _));
    using var candidateRequest = JsonDocument.Parse(handler.Bodies[1]);
    var candidate = candidateRequest.RootElement.GetProperty("text").GetProperty("format").GetProperty("schema").GetProperty("properties").GetProperty("candidates").GetProperty("items");
    Assert(!candidate.GetProperty("properties").TryGetProperty("supportingFeatures", out _));
    var scores = candidate.GetProperty("properties").GetProperty("scores");
    Assert(scores.GetProperty("type").GetString() == "object" && scores.GetProperty("required").GetArrayLength() == 20);
    Assert(scores.GetProperty("properties").GetProperty("Eye spacing").GetProperty("maximum").GetInt32() == 4);
});
AsyncTest("Validation failures identify stage and rule without exposing provider data or starting images", async () => {
    var cases = new[] { (Profile: "{", Candidates: ValidPlan(), Rule: "profile_response_json"),
        (Profile: ValidProfile(), Candidates: "{", Rule: "candidate_response_json"),
        (Profile: ValidProfile(), Candidates: "{\"candidates\":[]}", Rule: "candidate_count"),
        (Profile: ValidProfile().Replace("broad face", "secret-profile?"), Candidates: ValidPlan(), Rule: "profile_keyword") };
    foreach (var sample in cases) {
        var handler = AnalysisHandler(sample.Profile, sample.Candidates); var refs = new FakeReferences(); var images = new FakeImageGenerator();
        try { await new OpenAiMatcher(new HttpClient(handler), configuration, refs, images).MatchAsync(jpeg, default); throw new Exception("Expected validation rejection"); }
        catch (MatchException e) {
            Assert(e.Code == "invalid_provider_result" && e.DiagnosticCode == sample.Rule && e.Message.Contains(sample.Rule));
            Assert(!e.Message.Contains("secret-profile") && !e.Message.Contains("test-key") && refs.Calls == 0 && images.Calls == 0);
        }
    }
});
Test("Whole JSON numbers are accepted as scores but fractional or string scores are rejected", () => {
    using var profile = JsonDocument.Parse(ValidProfile()); var fields = VisualProfile.Read(profile.RootElement);
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    root["candidates"]![0]!["scores"]!["Face outline"] = System.Text.Json.Nodes.JsonNode.Parse("4.0");
    using var candidates = JsonDocument.Parse(root.ToJsonString());
    Assert(AnimalCandidateRanking.ReadAndRank(candidates.RootElement, fields).Length == 3);
});
Test("Artistic salience and drawing directions are bounded and required for distinctive visible shapes", () => {
    foreach (var bad in new object?[] { null, -1, 4, 2.5, "3", true }) {
        var root = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
        root["features"]!["Face outline"]!["salience"] = JsonSerializer.SerializeToNode(bad);
        using var json = JsonDocument.Parse(root.ToJsonString());
        Throws("invalid_provider_result", () => VisualProfile.Read(json.RootElement));
    }
    foreach (var bad in new object?[] { null, "", new string('x', 161), "invalid\nnote", 4 }) {
        var root = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
        root["features"]!["Face outline"]!["artisticEmphasis"] = JsonSerializer.SerializeToNode(bad);
        using var json = JsonDocument.Parse(root.ToJsonString());
        Throws("invalid_provider_result", () => VisualProfile.Read(json.RootElement));
    }
});
Test("The signature is capped at three clear structural features and ignores colour and hidden emphasis", () => {
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
    foreach (var name in new[] { "Face outline", "Face length to width", "Jaw width", "Eye shape", "Jaw contour", "Iris colour" }) {
        var field = root["features"]![name]!;
        field["salience"] = 3; field["artisticEmphasis"] = "Emphasize the observed shape in a sketch.";
    }
    root["features"]!["Iris colour"]!["visibility"] = "clear";
    root["features"]!["Iris colour"]!["keyword"] = "green eyes";
    root["features"]!["Jaw contour"]!["visibility"] = "uncertain";
    using var json = JsonDocument.Parse(root.ToJsonString()); var fields = VisualProfile.Read(json.RootElement);
    Assert(fields.Where(x => x.SignatureRank is not null).OrderBy(x => x.SignatureRank).Select(x => x.Feature)
        .SequenceEqual(new[] { "Face outline", "Face length to width", "Jaw width" }));
    Assert(fields[6].Salience == 0 && fields[6].ArtisticEmphasis is null && fields[6].SignatureRank is null);
    Assert(fields[19].SignatureRank is null && fields[19].ArtisticEmphasis is null);
});
AsyncTest("A profile without a supported structural focal point stops before ranking or image generation", async () => {
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
    foreach (var field in root["features"]!.AsObject()) field.Value!["salience"] = 1;
    root["features"]!["Iris colour"]!["visibility"] = "clear";
    root["features"]!["Iris colour"]!["keyword"] = "green eyes";
    root["features"]!["Iris colour"]!["salience"] = 3;
    var handler = AnalysisHandler(root.ToJsonString()); var references = new FakeReferences();
    try { await new OpenAiMatcher(new HttpClient(handler), configuration, references).MatchAsync(jpeg, default); throw new Exception("Expected rejection"); }
    catch (MatchException error) { Assert(error.Code == "unclear_artistic_signature"); }
    Assert(handler.Uris.Count == 1 && references.Calls == 0);
});
Test("Personal mouth and nose signature fit outranks generic outline agreement and leads search words", () => {
    var profile = System.Text.Json.Nodes.JsonNode.Parse(ValidProfile())!;
    foreach (var field in profile["features"]!.AsObject()) field.Value!["salience"] = 1;
    foreach (var name in new[] { "Mouth width", "Nose width" }) {
        profile["features"]![name]!["salience"] = 3;
        profile["features"]![name]!["artisticEmphasis"] = "Widen the observed shape in an imagined drawing.";
        profile["features"]![name]!["keyword"] = name == "Mouth width" ? "wide mouth" : "broad nose";
    }
    using var profileJson = JsonDocument.Parse(profile.ToJsonString()); var fields = VisualProfile.Read(profileJson.RootElement);
    var candidates = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    foreach (var item in candidates["candidates"]!.AsArray()) item!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(x => x.Name, _ => 3));
    candidates["candidates"]![0]!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(x => x.Name, _ => 4));
    candidates["candidates"]![0]!["scores"]!["Mouth width"] = 2;
    candidates["candidates"]![0]!["scores"]!["Nose width"] = 3;
    candidates["candidates"]![1]!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(x => x.Name, _ => 2));
    candidates["candidates"]![1]!["scores"]!["Mouth width"] = 4;
    candidates["candidates"]![1]!["scores"]!["Nose width"] = 4;
    using var json = JsonDocument.Parse(candidates.ToJsonString());
    var result = AnimalCandidateRanking.ReadAndRank(json.RootElement, fields);
    Assert(result[0].ScientificName == "Canis lupus" && result.All(x => x.ScientificName != "Panthera leo"));
    Assert(result[0].SearchKeywords!.SequenceEqual(new[] { "broad nose", "wide mouth" }));
    Assert(result[0].Reason.StartsWith("Signature echoes: broad nose, wide mouth."));
});
Test("Generic matches cannot compensate for contradicting any selected signature shape", () => {
    using var profile = JsonDocument.Parse(ValidProfile()); var fields = VisualProfile.Read(profile.RootElement);
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    root["candidates"]![0]!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(x => x.Name, _ => 4));
    root["candidates"]![0]!["scores"]!["Eye shape"] = 1;
    using var json = JsonDocument.Parse(root.ToJsonString());
    var result = AnimalCandidateRanking.ReadAndRank(json.RootElement, fields);
    Assert(result.Length == 3 && result.All(x => x.ScientificName != "Panthera leo"));
});
Test("One-character ranking succeeds with one supported candidate without forcing three", () => {
    using var profile = JsonDocument.Parse(ValidProfile()); var fields = VisualProfile.Read(profile.RootElement);
    var root = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    foreach (var candidate in root["candidates"]!.AsArray().Skip(1))
        candidate!["scores"] = JsonSerializer.SerializeToNode(VisualProfile.Fields.ToDictionary(x => x.Name, _ => 0));
    using var json = JsonDocument.Parse(root.ToJsonString());
    var result = AnimalCandidateRanking.ReadAndRank(json.RootElement, fields, 1);
    Assert(result.Length == 1 && result[0].ScientificName == "Panthera leo");
    Throws("weak_visual_matches", () => AnimalCandidateRanking.ReadAndRank(json.RootElement, fields));
    Assert(!new MatchRequest("", true).PortraitEditConsent);
});
AsyncTest("Character generation receives the portrait and grounded keywords without imagined drawing notes", async () => {
    var generatedConfig = new ConfigurationBuilder().AddConfiguration(configuration).AddInMemoryCollection(new Dictionary<string, string?> { ["Ai:AnimalImageSource"] = "Generated" }).Build();
    var handler = AnalysisHandler(); var images = new FakeImageGenerator();
    await new OpenAiMatcher(new HttpClient(handler), generatedConfig, new FakeReferences(), images).MatchAsync(jpeg, default);
    Assert(handler.Uris.Count == 2 && images.Calls == 1 && images.Portraits.Single().SequenceEqual(jpeg) && images.Keywords.Take(2).SequenceEqual(new[] { "broad face", "almond shaped eyes" }));
    Assert(images.Keywords.All(x => !x.Contains("sketch") && !x.Contains("data:image")));
});
AsyncTest("Repeated exact portrait runs both analysis stages again and uses the new profile and ranking", async () => {
    var generatedConfig = new ConfigurationBuilder().AddConfiguration(configuration).AddInMemoryCollection(new Dictionary<string, string?> { ["Ai:AnimalImageSource"] = "Generated" }).Build();
    var changedPlan = System.Text.Json.Nodes.JsonNode.Parse(ValidPlan())!;
    // The new provider ranking favours a different species; an old plan must not override it.
    changedPlan["candidates"]![0]!["scores"] = changedPlan["candidates"]![3]!["scores"]!.DeepClone();
    var handler = new SequenceHandler([Envelope(ValidProfile()), Envelope(ValidPlan()),
        Envelope(ValidProfile().Replace("broad face", "tapered face")), Envelope(changedPlan.ToJsonString())]);
    var generator = new FakeImageGenerator();
    var matcher = new OpenAiMatcher(new HttpClient(handler), generatedConfig, new FakeReferences(), generator);
    var first = await matcher.MatchAsync(jpeg, default);
    var firstFeatures = matcher.Features;
    var repeat = await matcher.MatchAsync(jpeg.ToArray(), default);
    Assert(handler.Uris.Count == 4 && generator.Calls == 2);
    Assert(first[0].ScientificName == "Panthera leo" && repeat[0].ScientificName == "Canis lupus");
    Assert(firstFeatures[0].Keyword == "broad face" && matcher.Features[0].Keyword == "tapered face");
    Assert(first[0].SearchKeywords!.Contains("broad face") && repeat[0].SearchKeywords!.Contains("tapered face"));
});
AsyncTest("Concurrent identical submissions run independent analysis and keep their own image inputs", async () => {
    var generatedConfig = new ConfigurationBuilder().AddConfiguration(configuration).AddInMemoryCollection(new Dictionary<string, string?> { ["Ai:AnimalImageSource"] = "Generated" }).Build();
    var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var firstHandler = new DelayedProfileHandler(Envelope(ValidProfile()), Envelope(ValidPlan()), release.Task);
    var secondHandler = new DelayedProfileHandler(Envelope(ValidProfile().Replace("broad face", "tapered face")), Envelope(ValidPlan()), release.Task);
    var firstImages = new FakeImageGenerator(); var secondImages = new FakeImageGenerator();
    var first = new OpenAiMatcher(new HttpClient(firstHandler), generatedConfig, new FakeReferences(), firstImages);
    var second = new OpenAiMatcher(new HttpClient(secondHandler), generatedConfig, new FakeReferences(), secondImages);
    var firstWork = first.MatchAsync(jpeg, default);
    var secondWork = second.MatchAsync(jpeg.ToArray(), default);
    try {
        await Task.WhenAll(firstHandler.Started.Task, secondHandler.Started.Task).WaitAsync(TimeSpan.FromSeconds(3));
    } finally { release.TrySetResult(); }
    await Task.WhenAll(firstWork, secondWork);
    Assert(firstHandler.Calls == 2 && secondHandler.Calls == 2 && firstImages.Calls == 1 && secondImages.Calls == 1);
    Assert(first.Features[0].Keyword == "broad face" && second.Features[0].Keyword == "tapered face");
    Assert(firstImages.Keywords.Contains("broad face") && !firstImages.Keywords.Contains("tapered face"));
    Assert(secondImages.Keywords.Contains("tapered face") && !secondImages.Keywords.Contains("broad face"));
});
AsyncTest("Failed reanalysis cannot fall back to an earlier successful result or request new images", async () => {
    var generatedConfig = new ConfigurationBuilder().AddConfiguration(configuration).AddInMemoryCollection(new Dictionary<string, string?> { ["Ai:AnimalImageSource"] = "Generated" }).Build();
    var handler = new SequenceHandler([Envelope(ValidProfile()), Envelope(ValidPlan()), Envelope("{}")]);
    var images = new FakeImageGenerator();
    var matcher = new OpenAiMatcher(new HttpClient(handler), generatedConfig, new FakeReferences(), images);
    await matcher.MatchAsync(jpeg, default);
    try { await matcher.MatchAsync(jpeg, default); throw new Exception("Expected failure"); }
    catch (MatchException e) { Assert(e.Code == "invalid_provider_result"); }
    Assert(handler.Uris.Count == 3 && images.Calls == 1 && matcher.Features.Length == 0);
});
AsyncTest("Cancellation never returns a previous analysis and a later submission starts fresh", async () => {
    var handler = new SequenceHandler([Envelope(ValidProfile()), Envelope(ValidPlan()), Envelope(ValidProfile()), Envelope(ValidPlan())]);
    var references = new FakeReferences();
    var matcher = new OpenAiMatcher(new HttpClient(handler), configuration, references);
    await matcher.MatchAsync(jpeg, default);
    using var cancel = new CancellationTokenSource(); cancel.Cancel();
    try { await matcher.MatchAsync(jpeg, cancel.Token); throw new Exception("Expected cancellation"); }
    catch (OperationCanceledException) { }
    Assert(handler.Uris.Count == 2 && references.Calls == 3 && matcher.Features.Length == 0);
    await matcher.MatchAsync(jpeg, default);
    Assert(handler.Uris.Count == 4 && references.Calls == 6);
});

var failures = 0;
foreach (var (name, run) in tests)
{
    try { await run(); Console.WriteLine($"PASS {name}"); }
    catch (Exception exception) { failures++; Console.WriteLine($"FAIL {name}: {exception.Message}"); }
}
Console.WriteLine($"{tests.Count - failures}/{tests.Count} checks passed. No external AI requests made.");
return failures == 0 ? 0 : 1;

sealed class FakePhotoReviewer(PhotoReview result) : IAnimalPhotoReviewer {
    public bool Enabled => true;
    public string CacheKey => "fake-reviewed-v1";
    public int Calls { get; private set; }
    public string[] Urls { get; private set; } = [];
    public Task<PhotoReview> ReviewAsync(string name, string[] urls, CancellationToken token) {
        Calls++; Urls = urls; return Task.FromResult(result);
    }
}

sealed class FakeReferences : IAnimalReferenceResolver {
    public int Calls { get; private set; }
    public bool ReceivedKeywords { get; private set; }
    public Task<Animal> ResolveAsync(AnimalSuggestion suggestion, CancellationToken token) {
        Calls++;
        ReceivedKeywords |= suggestion.SearchKeywords is not null;
        return Task.FromResult(new Animal(suggestion.ScientificName, suggestion.Name, suggestion.ScientificName,
            "Animalia", "Test", [], "Test credit", "https://example.test", "https://example.test", "", false, suggestion.Reason));
    }
}

sealed class DelayedProfileHandler(string profile, string comparison, Task release) : HttpMessageHandler {
    public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public int Calls { get; private set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
        Calls++;
        if (Calls == 1) { Started.TrySetResult(); await release.WaitAsync(token); }
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Calls == 1 ? profile : comparison, Encoding.UTF8, "application/json") };
    }
}

sealed class FakeImageGenerator : IAnimalImageGenerator {
    public int Calls { get; private set; }
    public List<string> Keywords { get; } = [];
    public List<byte[]> Portraits { get; } = [];
    public Task<Animal> GenerateAsync(AnimalSuggestion suggestion, byte[] portrait, CancellationToken token) {
        Portraits.Add(portrait.ToArray());
        Calls++; Keywords.AddRange(suggestion.SearchKeywords ?? []);
        return Task.FromResult(new Animal(suggestion.ScientificName, suggestion.Name, suggestion.ScientificName,
            "Animalia", "Test", [], "AI-generated test fixture", "", AnimalImageGenerator.Source, "", false,
            suggestion.Reason, SearchKeywords: suggestion.SearchKeywords, ImageOrigin: "generated"));
    }
}

sealed class SequenceHandler(string[] responses) : HttpMessageHandler {
    public List<Uri> Uris { get; } = [];
    public List<string> Bodies { get; } = [];
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) {
        Uris.Add(request.RequestUri!);
        Bodies.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(token));
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(responses[Uris.Count - 1], Encoding.UTF8, "application/json") };
    }
}

sealed class FakeHandler(string response, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
{
    public string? RequestBody { get; private set; }
    public Uri? RequestUri { get; private set; }
    public bool HadAuthorization { get; private set; }
    public int CallCount { get; private set; }
    public Dictionary<string, string> FormFields { get; } = [];
    public byte[]? ImageBytes { get; private set; }
    public int ImageParts { get; private set; }
    public string? ImageContentType { get; private set; }
    public string? ImageFieldName { get; private set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        CallCount++;
        RequestUri = request.RequestUri;
        HadAuthorization = request.Headers.Authorization is not null;
        if (request.Content is MultipartFormDataContent multipart) {
            foreach (var part in multipart) {
                var name = part.Headers.ContentDisposition!.Name!.Trim('"');
                if (part.Headers.ContentDisposition.FileName is not null) {
                    ImageBytes = await part.ReadAsByteArrayAsync(cancellationToken); ImageParts++;
                    ImageContentType = part.Headers.ContentType?.MediaType; ImageFieldName = name;
                } else FormFields[name] = await part.ReadAsStringAsync(cancellationToken);
            }
        } else RequestBody = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        return new HttpResponseMessage(status) { Content = new StringContent(response, Encoding.UTF8, "application/json") };
    }
}
