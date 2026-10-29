using System.Net;
using System.Threading.RateLimiting;
using Kinform.Api;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.FileProviders;

var initializeEnvironment = args.Contains("--init-env", StringComparer.Ordinal);
var checkConfiguration = args.Contains("--check-config", StringComparer.Ordinal);
var startupArgs = args.Where(arg => arg is not ("--init-env" or "--check-config")).ToArray();
var builder = WebApplication.CreateBuilder(startupArgs);
if (initializeEnvironment) {
    var previous = new ConfigurationBuilder().AddUserSecrets("kinform-local-prototype").Build();
    var created = LocalEnvironment.Initialize(Path.Combine(builder.Environment.ContentRootPath, ".env"), previous);
    Console.WriteLine(created ? "Created backend .env; existing key and billing preference preserved. No API requests made." : "Backend .env already exists; nothing overwritten.");
    return;
}
LocalEnvironment.Configure(builder.Configuration, builder.Environment.ContentRootPath, builder.Environment.IsDevelopment(), startupArgs);
if (checkConfiguration) {
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {
        mode = builder.Configuration["Ai:Mode"], model = builder.Configuration["Ai:Model"],
        liveReady = builder.Configuration["Ai:Mode"] == "OpenAI" && AiConfiguration.IsReady(builder.Configuration),
        photoReviewEnabled = !AnimalImageGenerator.IsSelected(builder.Configuration) && builder.Configuration.GetValue<bool>("Ai:PhotoReviewEnabled"),
        photoReviewModel = builder.Configuration["Ai:PhotoReviewModel"] ?? "gpt-5.4-mini",
        animalImageSource = builder.Configuration["Ai:AnimalImageSource"] ?? "Generated",
        imageModel = AnimalImageGenerator.Model(builder.Configuration),
        imageQuality = AnimalImageGenerator.Quality(builder.Configuration),
        notice = "Local configuration check only. No API key value displayed and no OpenAI request made."
    }));
    return;
}
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 12 * 1024 * 1024);
builder.Services.AddSingleton<Catalogue>();
builder.Services.AddSingleton<WildLensTickets>();
builder.Services.AddSingleton<WildLensGate>();
builder.Services.AddSingleton(_ => new TeachingStore(builder.Configuration["Teaching:DataRoot"] ?? Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "evaluation", "private"))));
builder.Services.AddSingleton<TeachingAuth>();
builder.Services.AddSingleton<TeachingMemory>();
builder.Services.AddScoped<TeachingBenchmarks>();
builder.Services.AddHttpClient<WildLensMeta>(client => {
    client.Timeout = TimeSpan.FromSeconds(180);
    client.MaxResponseContentBufferSize = 24 * 1024 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient<OpenAiMatcher>(client => {
    client.Timeout = TimeSpan.FromSeconds(75);
    client.MaxResponseContentBufferSize = 512 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<ImageGenerationGate>();
builder.Services.AddHttpClient<IAnimalImageGenerator, AnimalImageGenerator>(client => {
    client.Timeout = TimeSpan.FromSeconds(150);
    client.MaxResponseContentBufferSize = 4 * 1024 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddMemoryCache(options => options.SizeLimit = 128);
builder.Services.AddSingleton<ReferenceRequestGate>();
builder.Services.AddHttpClient<IAnimalPhotoReviewer, AnimalPhotoReviewer>(client => {
    client.Timeout = TimeSpan.FromSeconds(30);
    client.MaxResponseContentBufferSize = 256 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient<IAnimalReferenceResolver, AnimalReferences>(client => {
    client.Timeout = TimeSpan.FromSeconds(10);
    client.MaxResponseContentBufferSize = 2 * 1024 * 1024;
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Kinform-Local-Prototype/0.2");
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient<GbifCatalogue>(client => {
    client.Timeout = TimeSpan.FromSeconds(15);
    client.MaxResponseContentBufferSize = 2 * 1024 * 1024;
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Kinform-Local-Prototype/0.1");
});
builder.Services.AddSingleton<DemoMatcher>();
builder.Services.AddScoped<IAnimalMatcher>(services =>
    builder.Configuration["Ai:Mode"] == "OpenAI"
        ? services.GetRequiredService<OpenAiMatcher>() : services.GetRequiredService<DemoMatcher>());
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .WithMethods("GET", "POST").WithHeaders("Content-Type", "X-WildLens-Teaching").AllowCredentials()));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("teaching-auth", limiter => {
        limiter.PermitLimit = 10; limiter.Window = TimeSpan.FromMinutes(1); limiter.QueueLimit = 0;
    });
    options.AddFixedWindowLimiter("catalogue", limiter => {
        limiter.PermitLimit = 20;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
    options.AddFixedWindowLimiter("matching", limiter =>
    {
        // Global per-process cap for the local prototype, not distributed production billing.
        limiter.PermitLimit = 10;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
});
var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    if (!app.Configuration.GetValue<bool>("Prototype:AllowPublicAccess") &&
        context.Connection.RemoteIpAddress is { } remote && !IPAddress.IsLoopback(remote))
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsJsonAsync(new ApiError("local_only", "This prototype is restricted to local development."));
        return;
    }
    try { await next(context); }
    catch (BadHttpRequestException)
    {
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new ApiError("invalid_request", "The request is invalid or too large."));
    }
});
app.UseCors();
app.UseRateLimiter();
var assetRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
if (Directory.Exists(assetRoot)) app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(assetRoot) });

app.MapGet("/health", () => new { status = "ok", service = "Kinform.Api" });
app.MapGet("/api/config", (IAnimalMatcher matcher, Catalogue catalogue, IConfiguration config) => new
{
    mode = matcher.IsDemo ? "demo" : "experimental-live",
    provider = matcher.IsDemo ? "None" : "OpenAI",
    model = config["Ai:Model"],
    liveReady = !matcher.IsDemo && AiConfiguration.IsReady(config),
    photoReviewEnabled = !matcher.IsDemo && !AnimalImageGenerator.IsSelected(config) && config.GetValue<bool>("Ai:PhotoReviewEnabled") && AiConfiguration.IsReady(config),
    photoReviewModel = config["Ai:PhotoReviewModel"] ?? "gpt-5.4-mini",
    matchingStrategy = matcher.IsDemo ? "fixed-demo" : AnimalImageGenerator.IsSelected(config) ? "portrait-to-animal-character" : "caricaturist-signature-first",
    experience = !matcher.IsDemo && AnimalImageGenerator.IsSelected(config) ? "animal-character" : "comparison",
    resultCount = !matcher.IsDemo && AnimalImageGenerator.IsSelected(config) ? 1 : 3,
    portraitUsedForGeneration = !matcher.IsDemo && AnimalImageGenerator.IsSelected(config),
    analysisVersion = OpenAiMatcher.Version,
    analysisFeatureCount = 20, analysisCalls = 2, analysisCacheEnabled = false, artisticSignatureEnabled = !matcher.IsDemo,
    animalImageSource = AnimalImageGenerator.IsSelected(config) ? "Generated" : "Reference",
    imageModel = AnimalImageGenerator.Model(config), imageQuality = AnimalImageGenerator.Quality(config),
    photoProvider = new { name = AnimalImageGenerator.IsSelected(config) ? "OpenAI image generation" : "iNaturalist",
        sourceUrl = AnimalImageGenerator.IsSelected(config) ? AnimalImageGenerator.Source : "https://www.inaturalist.org/" },
    externalCatalogue = new { provider = "GBIF", sourceUrl = GbifCatalogue.SourceUrl, purpose = "taxonomy-discovery-only" },
    catalogueSize = catalogue.Animals.Length,
    catalogueVersion = Catalogue.Version,
    hybridEnabled = false,
    notice = matcher.IsDemo ? "Fixed demo examples; no face analysis." : AnimalImageGenerator.IsSelected(config) ?
        "One portrait-inspired cartoon animal. Creative artwork, not a scientific match." : "Experimental visual resemblance, not scientific measurement."
});
app.MapGet("/api/animals", (Catalogue catalogue) => catalogue.Animals);
app.MapGet("/api/catalogue/search", async (string? q, string? field, int? offset, GbifCatalogue catalogue, CancellationToken token) => {
    try { return Results.Ok(await catalogue.SearchAsync(q, field, offset ?? 0, token)); }
    catch (MatchException exception) {
        return Results.Json(new ApiError(exception.Code, exception.Message), statusCode: exception.Code == "invalid_search" ? 400 : 503);
    }
    catch (OperationCanceledException) when (!token.IsCancellationRequested) {
        return Results.Json(new ApiError("catalogue_timeout", "GBIF took too long to respond. Try again later."), statusCode: 504);
    }
    catch (HttpRequestException) {
        return Results.Json(new ApiError("catalogue_unavailable", "GBIF is unreachable. The local references still work."), statusCode: 503);
    }
}).RequireRateLimiting("catalogue");
app.MapPost("/api/matches", async (MatchRequest request, IAnimalMatcher matcher, IConfiguration config, CancellationToken cancellationToken) =>
{
    if (!request.Consent)
        return Results.BadRequest(new ApiError("consent_required", "Confirm permission to process this photograph first."));
    if (!matcher.IsDemo && AnimalImageGenerator.IsSelected(config) && !request.PortraitEditConsent)
        return Results.BadRequest(new ApiError("portrait_edit_consent_required", "Refresh the app and agree to sending your portrait to OpenAI for animal-character image creation before continuing."));
    byte[]? jpeg = null;
    try
    {
        jpeg = JpegInput.Parse(request.ImageBase64);
        var ranked = await matcher.MatchAsync(jpeg, cancellationToken);
        return Results.Ok(new MatchResult(Guid.NewGuid().ToString("N"), matcher.IsDemo, matcher.IsDemo ? Catalogue.Version : OpenAiMatcher.Version,
            matcher.IsDemo ? "Fixed demo examples — this photo was not analysed." : AnimalImageGenerator.IsSelected(config) ?
                "An AI-created cartoon animal inspired by your portrait. This is a creative transformation, not a detected animal identity or a scientific resemblance score." :
                "Subjective AI suggestions from visible facial shapes, not probabilities or biological relationships. Photos are looked up afterward; this is not an exhaustive species search.",
            ranked.Select((animal, index) => new MatchItem(index + 1, animal)).ToArray(), matcher.Features,
            !matcher.IsDemo && AnimalImageGenerator.IsSelected(config) ? "animal-character" : "comparison"));
    }
    catch (MatchException exception)
    {
        // Never log model output, portrait data, the request body or the credential.
        app.Logger.LogWarning("Match rejected: {Code}; validation rule: {DiagnosticCode}", exception.Code, exception.DiagnosticCode ?? "none");
        var status = exception.Code is "invalid_image" or "unusable_portrait" or "weak_visual_matches" or "unclear_artistic_signature" ? 422 : 503;
        return Results.Json(new ApiError(exception.Code, exception.Message, exception.DiagnosticCode), statusCode: status);
    }
    catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
    {
        return Results.Json(new ApiError("provider_timeout", "The AI service took too long. Requests may have been billed. No analysis is cached and no automatic retry was made."), statusCode: 504);
    }
    catch (HttpRequestException)
    {
        return Results.Json(new ApiError("provider_unavailable", "The AI service is temporarily unreachable."), statusCode: 503);
    }
    finally { if (jpeg is not null) Array.Clear(jpeg); }
}).RequireRateLimiting("matching");

app.MapPost("/api/hybrids", () => Results.Json(new ApiError("hybrid_not_configured",
    "Hybrid generation is not connected yet. Your photo comparison is still available."), statusCode: 501));
app.MapWildLens();
app.MapTeaching();
app.Run();

public partial class Program;
