using Kinform.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Net.Http.Json;

var root = Path.Combine(Directory.GetCurrentDirectory(), ".artifacts", "archive-check-" + Guid.NewGuid().ToString("N"));
var png = File.ReadAllBytes(Path.Combine(Directory.GetCurrentDirectory(), "apps/mobile/assets/wildfie-icon.png"));
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
    ["Archive:Enabled"] = "true", ["Archive:Root"] = root,
}).Build();
var environment = new TestEnvironment { ContentRootPath = Directory.GetCurrentDirectory(), WebRootPath = Path.Combine(root, "wwwroot") };
var archive = new CardArchive(config, environment);
var count = 0;
void Check(bool value, string name) { if (!value) throw new Exception("FAIL " + name); count++; Console.WriteLine("PASS " + name); }
async Task Reject(CardUpload upload, string code, CancellationToken token = default) {
    try { await archive.SaveAsync(upload, token); throw new Exception("Expected rejection: " + code); }
    catch (ArchiveIssue issue) { Check(issue.Code == code, code); }
}
var permit = archive.Issue();
Check(!Directory.Exists(root), "Issuing a generation permit does not persist a photo");
var input = new CardUpload(permit, Convert.ToBase64String(png), true);
await Reject(input with { Consent = false }, "consent_required");
await Reject(input with { Token = "../outside.png" }, "invalid_archive_token");
await Reject(input with { Token = permit + "changed" }, "invalid_archive_token");
await Reject(input with { ImageBase64 = "invalid" }, "invalid_card");
await Reject(input with { ImageBase64 = new string('A', (CardArchive.MaxImageBytes + 2) / 3 * 4 + 4) }, "card_too_large");
await Reject(input with { ImageBase64 = Convert.ToBase64String(png[..^1]) }, "invalid_card");
await Reject(input with { ImageBase64 = Convert.ToBase64String(png.Concat(new byte[] { 0 }).ToArray()) }, "invalid_card");
Check(!Directory.Exists(root), "Invalid uploads leave no files behind");
using (var canceled = new CancellationTokenSource()) {
    canceled.Cancel();
    try { await archive.SaveAsync(input, canceled.Token); throw new Exception("Canceled save accepted"); }
    catch (OperationCanceledException) { Check(!Directory.Exists(root), "Cancellation does not persist a partial card"); }
}
var receipt = await archive.SaveAsync(input, default);
var files = Directory.GetFiles(root, "*.png", SearchOption.AllDirectories);
Check(files.Length == 1 && files[0].EndsWith(receipt.FileName), "A server-named PNG is saved in its UTC date folder");
Check((await File.ReadAllBytesAsync(files[0])).AsSpan().SequenceEqual(png), "Stored PNG is byte-for-byte the uploaded combined card");
Check(Guid.TryParseExact(receipt.Id, "N", out _) && !receipt.FileName.Contains("/"), "Clients cannot choose a storage filename");
Check(await archive.SaveAsync(input, default) == receipt && Directory.GetFiles(root, "*.png", SearchOption.AllDirectories).Length == 1, "Retrying a save is idempotent");
var changed = png.ToArray(); changed[^1] ^= 1;
await Reject(input with { ImageBase64 = Convert.ToBase64String(changed) }, "card_already_saved");
var restarted = new CardArchive(config, environment);
Check((await File.ReadAllBytesAsync(files[0])).AsSpan().SequenceEqual(png), "Saved cards survive restarting the archive service");
try { await restarted.SaveAsync(input, default); throw new Exception("Old process permit accepted"); }
catch (ArchiveIssue issue) { Check(issue.Code == "invalid_archive_token", "A new process does not accept old generation permits"); }
config["Archive:MaxTotalBytes"] = png.Length.ToString();
await Reject(input with { Token = archive.Issue() }, "archive_full");
Check(await archive.SaveAsync(input, default) == receipt, "An existing save can be confirmed even when storage is full");
config["Archive:MaxTotalBytes"] = (2L * png.Length).ToString();
var second = input with { Token = archive.Issue() };
await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => archive.SaveAsync(second, default)));
Check(Directory.GetFiles(root, "*.png", SearchOption.AllDirectories).Length == 2 && !Directory.GetFiles(root, "*.tmp", SearchOption.AllDirectories).Any(), "Concurrent retries create one file and no temporary leftovers");
config["Archive:Root"] = environment.WebRootPath;
await Reject(input, "archive_unavailable");
config["Archive:Root"] = root;
config["Archive:Enabled"] = "false";
await Reject(input, "archive_disabled");
Check(Directory.GetFiles(root, "*.png", SearchOption.AllDirectories).Length == 2, "Disabling future saves preserves earlier cards");
config["Archive:Enabled"] = "true";
config["Archive:MaxTotalBytes"] = (3L * png.Length).ToString();
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["Archive:Enabled"] = "true" });
builder.Services.AddSingleton(archive);
builder.Services.AddSingleton<WildLensTickets>();
builder.Services.AddSingleton<WildLensGate>();
builder.Services.AddHttpClient<WildLensMeta>();
builder.Services.AddRateLimiter(options => {
    options.AddFixedWindowLimiter("matching", limiter => { limiter.PermitLimit = 10; limiter.Window = TimeSpan.FromMinutes(1); });
    options.AddFixedWindowLimiter("card-archive", limiter => { limiter.PermitLimit = 20; limiter.Window = TimeSpan.FromMinutes(1); });
});
await using (var app = builder.Build()) {
    app.UseRateLimiter(); app.MapWildLens(); await app.StartAsync();
    using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
    var settings = await http.GetStringAsync("/api/wildlens/config");
    Check(settings.Contains("\"archiveEnabled\":true"), "The public configuration advertises saving without revealing a folder path");
    var denied = await http.PostAsJsonAsync("/api/wildlens/cards", input with { Token = "invalid" });
    Check(denied.StatusCode == HttpStatusCode.Unauthorized, "The real HTTP upload endpoint rejects unissued permits");
    var submitted = input with { Token = archive.Issue() };
    var saved = await http.PostAsJsonAsync("/api/wildlens/cards", submitted);
    var savedReceipt = await saved.Content.ReadFromJsonAsync<SavedCard>();
    Check(saved.IsSuccessStatusCode && savedReceipt is not null && Directory.GetFiles(root, savedReceipt.FileName, SearchOption.AllDirectories).Length == 1, "The real JSON upload route saves the PNG and returns its receipt");
    var repeated = await http.PostAsJsonAsync("/api/wildlens/cards", submitted);
    Check(repeated.IsSuccessStatusCode && Directory.GetFiles(root, "*.png", SearchOption.AllDirectories).Length == 3, "Retry through HTTP returns success without creating a duplicate");
    await app.StopAsync();
}
Console.WriteLine($"{count} archive checks passed. Only localhost HTTP was used; no provider calls.");

sealed class TestEnvironment : IWebHostEnvironment {
    public string ApplicationName { get; set; } = "Archive.Tests";
    public string EnvironmentName { get; set; } = "Testing";
    public string ContentRootPath { get; set; } = "";
    public string WebRootPath { get; set; } = "";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
}
