using System.Net;
using System.Text;

namespace Kinform.Api;

public sealed record TeachingPassword(string Password);
public sealed record TeachingSave(TeachingCase Case, int ExpectedRevision);
public sealed record TeachingPhoto(string ImageBase64);
public sealed record TeachingImport(string Name, string Version, string[] CaseIds, TeachingPrediction[] Predictions);
public sealed record TeachingRunRequest(string Name, string[] CaseIds, bool Consent, bool UseMemory = false);

public static class TeachingRoutes {
    public static void MapTeaching(this WebApplication app) {
        var routes = app.MapGroup("/api/teaching");
        routes.AddEndpointFilter(async (invocation, next) => {
            var context = invocation.HttpContext;
            var remote = context.Connection.RemoteIpAddress;
            if (remote is null || !IPAddress.IsLoopback(remote))
                return Results.Json(new ApiError("local_only", "The private studio is available only on this computer."), statusCode: 403);
            var origin = context.Request.Headers.Origin.ToString();
            var allowed = app.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
            if (origin.Length > 0 && !allowed.Contains(origin, StringComparer.Ordinal))
                return Results.Json(new ApiError("origin_denied", "This origin cannot access the private studio."), statusCode: 403);
            if (context.Request.Method != "GET" && context.Request.Headers["X-WildLens-Teaching"] != "1")
                return Results.Json(new ApiError("studio_header_required", "Use the private studio to change teaching data."), statusCode: 403);
            var path = context.Request.Path.Value ?? "";
            var auth = context.RequestServices.GetRequiredService<TeachingAuth>();
            if (path is not ("/api/teaching/status" or "/api/teaching/login" or "/api/teaching/setup") && !auth.Authenticated(context))
                return Results.Json(new ApiError("private_login_required", "Sign in to the private teaching studio."), statusCode: 401);
            try { return await next(invocation); }
            catch (TeachingIssue issue) { return Results.Json(new ApiError(issue.Code, issue.Message), statusCode: issue.Status); }
            catch (MatchException issue) { return Results.Json(new ApiError(issue.Code, issue.Message), statusCode: 400); }
            catch (IOException) { return Results.Json(new ApiError("teaching_storage_error", "The private dataset could not be read or saved. Existing data was preserved."), statusCode: 500); }
            catch (System.Text.Json.JsonException) { return Results.Json(new ApiError("teaching_data_error", "A private data file contains invalid JSON. Existing data was preserved."), statusCode: 500); }
            catch (UnauthorizedAccessException) { return Results.Json(new ApiError("teaching_storage_error", "The private data folder could not be accessed."), statusCode: 500); }
        });
        routes.MapGet("/status", (HttpContext context, TeachingAuth auth, IConfiguration config) => new {
            configured = auth.Configured, authenticated = auth.Authenticated(context), metaReady = WildLensMeta.Ready(config),
            promptVersion = WildLensMeta.PromptVersion
        });
        routes.MapPost("/setup", (TeachingPassword input, HttpContext context, TeachingAuth auth) => {
            auth.Setup(input.Password, context); return Results.Ok(new { authenticated = true });
        }).RequireRateLimiting("teaching-auth");
        routes.MapPost("/login", (TeachingPassword input, HttpContext context, TeachingAuth auth) => {
            auth.Login(input.Password, context); return Results.Ok(new { authenticated = true });
        }).RequireRateLimiting("teaching-auth");
        routes.MapPost("/logout", (HttpContext context, TeachingAuth auth) => { auth.Logout(context); return Results.Ok(new { authenticated = false }); });
        routes.MapGet("/cases", (TeachingStore store) => {
            var cases = store.Cases(); return Results.Ok(new { cases, datasetHash = TeachingStore.DatasetHash(cases) });
        });
        routes.MapGet("/memory", (TeachingMemory memory, IConfiguration config) => Results.Ok(memory.Status(WildLensMeta.PreferenceWeight(config))));
        routes.MapGet("/feedback", (TeachingFeedback feedback) => Results.Ok(feedback.Rounds()));
        routes.MapGet("/feedback/export", (TeachingFeedback feedback) => Results.File(
            System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(feedback.Rounds(), TeachingScoring.Json), "application/json", "wildlens-result-feedback.json"));
        routes.MapGet("/feedback/artworks/{name}", (string name, TeachingFeedback feedback) => {
            var path = feedback.ArtworkPath(name); return File.Exists(path) ? Results.File(path, "image/png") : Results.NotFound();
        });
        routes.MapPost("/feedback/photos", (FeedbackUpload input, TeachingFeedback feedback) => Results.Ok(feedback.Upload(input)));
        routes.MapPost("/feedback/generate", async (FeedbackGenerate input, TeachingFeedback feedback, IConfiguration config, CancellationToken token) => {
            if (!WildLensMeta.Ready(config)) throw new TeachingIssue("meta_not_ready", "Meta access is not ready. Existing feedback is saved.", 503);
            return Results.Ok(await feedback.GenerateAsync(input, token));
        }).RequireRateLimiting("matching");
        routes.MapPost("/feedback/review", (FeedbackReview input, TeachingFeedback feedback) => Results.Ok(feedback.Review(input)));
        routes.MapGet("/suggestions", (TeachingSuggestions suggestions) => Results.Ok(suggestions.Library()));
        routes.MapGet("/suggestions/export", (TeachingSuggestions suggestions) => Results.File(
            System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(suggestions.Library(), TeachingScoring.Json), "application/json", "wildlens-animal-choice-drafts.json"));
        routes.MapGet("/artworks/{name}", (string name, TeachingSuggestions suggestions) => {
            var path = suggestions.ArtworkPath(name);
            return File.Exists(path) ? Results.File(path, "image/png") : Results.NotFound();
        });
        routes.MapPost("/suggestions/start", (SuggestionStart input, TeachingSuggestions suggestions, IConfiguration config) => {
            if (!WildLensMeta.Ready(config)) throw new TeachingIssue("meta_not_ready", "Meta access is not ready. Saved choices remain available.", 503);
            return Results.Ok(suggestions.Start(input));
        });
        routes.MapPost("/suggestions/stop", (SuggestionStop input, TeachingSuggestions suggestions) => Results.Ok(suggestions.Stop(input.Id)));
        routes.MapPost("/suggestions/review", (SuggestionReview input, TeachingSuggestions suggestions) => Results.Ok(suggestions.Review(input)));
        routes.MapPost("/memory/settings", (MemorySettings input, TeachingMemory memory, IConfiguration config) => { memory.SetEnabled(input.Enabled); return Results.Ok(memory.Status(WildLensMeta.PreferenceWeight(config))); });
        routes.MapGet("/memory/export", (TeachingMemory memory) => Results.File(
            System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(memory.Index(), TeachingScoring.Json), "application/json", "wildlens-trait-vectors.json"));
        routes.MapPost("/cases/save", (TeachingSave input, TeachingStore store) => Results.Ok(store.Save(input.Case, input.ExpectedRevision)));
        routes.MapPost("/photos", (TeachingPhoto input, TeachingStore store) => Results.Ok(new { file = store.Upload(input.ImageBase64) }));
        routes.MapGet("/photos/{name}", (string name, TeachingStore store) => {
            var path = store.PhotoPath("references/" + name);
            return File.Exists(path) ? Results.File(path, "image/jpeg") : Results.NotFound();
        });
        routes.MapGet("/export", (TeachingStore store) => Results.File(Encoding.UTF8.GetBytes(store.Export()), "application/x-ndjson", "wildlens-private-feedback.jsonl"));
        routes.MapGet("/runs", (TeachingStore store) => store.Runs());
        routes.MapGet("/runs/compare", (string a, string b, TeachingStore store) => TeachingScoring.Compare(store.Run(a), store.Run(b)));
        routes.MapGet("/runs/{id}/export", (string id, TeachingStore store) => Results.File(
            System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(store.Run(id), TeachingScoring.Json), "application/json", "wildlens-benchmark.json"));
        routes.MapPost("/runs/import", (TeachingImport input, TeachingStore store) =>
            Results.Ok(store.SaveRun(input.Name, input.Version, "import", store.SelectCases(input.CaseIds), input.Predictions)));
        routes.MapPost("/runs/current", async (TeachingRunRequest input, TeachingBenchmarks benchmark, IConfiguration config, CancellationToken token) => {
            if (!WildLensMeta.Ready(config)) throw new TeachingIssue("meta_not_ready", "Meta access is not ready. You can import predictions without model calls.", 503);
            return Results.Ok(await benchmark.RunAsync(input.Name, input.CaseIds, input.Consent, token, input.UseMemory));
        }).RequireRateLimiting("matching");
    }
}
public sealed record SuggestionStop(string Id);
