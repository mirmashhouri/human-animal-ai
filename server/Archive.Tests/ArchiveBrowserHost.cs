using Kinform.Api;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

// Test executable only. Never included in the production API publish.
static class ArchiveBrowserHost {
    public static async Task RunAsync() {
        var root = Path.Combine(Directory.GetCurrentDirectory(), ".artifacts", "archive-browser-cards");
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:5088");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["Archive:Enabled"] = "true", ["Archive:Root"] = root,
            ["WildLens:EnablePaidRequests"] = "false", ["WildLens:CreditConfirmed"] = "false",
        });
        builder.Logging.ClearProviders();
        builder.Services.AddSingleton<CardArchive>();
        builder.Services.AddSingleton<WildLensTickets>();
        builder.Services.AddSingleton<WildLensGate>();
        builder.Services.AddHttpClient<WildLensMeta>();
        builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
            .WithOrigins("http://localhost:8093", "http://127.0.0.1:8093")
            .WithMethods("GET", "POST").WithHeaders("Content-Type")));
        builder.Services.AddRateLimiter(options => {
            options.AddFixedWindowLimiter("matching", limit => { limit.PermitLimit = 10; limit.Window = TimeSpan.FromMinutes(1); });
            options.AddFixedWindowLimiter("card-archive", limit => { limit.PermitLimit = 20; limit.Window = TimeSpan.FromMinutes(1); });
        });
        await using var app = builder.Build();
        app.UseCors(); app.UseRateLimiter(); app.MapWildLens();
        app.MapGet("/__test/permit", (CardArchive archive) => new { token = archive.Issue() });
        app.MapPost("/__test/stop", () => { app.Lifetime.StopApplication(); return "stopping"; });
        Console.WriteLine("Local-only storage verification host: http://127.0.0.1:5088");
        Console.WriteLine("Card folder: " + root);
        await app.RunAsync();
    }
}
