using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Kinform.Api;

public sealed record FeedbackJudgment(string RoundId, string ReferenceFile, string PhotoHash, string Verdict,
    string ProposedAnimal, string PreferredAnimal, string[] Observations, string Explanation,
    PortraitProfile RetrievalProfile, string ArtworkFile, DateTimeOffset ConfirmedAt);
public sealed record FeedbackRound(string Id, string CaseId, int CaseRevision, string ReferenceFile, string PhotoHash,
    string Status, DateTimeOffset CreatedAt, WildLensAnalysis? Analysis = null, PortraitProfile? Profile = null,
    string? ArtworkFile = null, string? ArtworkHash = null, string? ImageModel = null, string? PromptVersion = null,
    string? MemoryHash = null, TeachingEvidence[]? Evidence = null, string? Error = null, string? Verdict = null);
public sealed record FeedbackGenerate(string CaseId, int ExpectedRevision, bool Consent);
public sealed record FeedbackReview(string RoundId, int ExpectedRevision, string Verdict, string? PreferredAnimal,
    string? Explanation, bool ReplaceExisting = false);
public sealed record FeedbackUpload(string ImageBase64, string? Title = null);

public sealed class TeachingFeedback(TeachingStore store, WildLensMeta meta) {
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, SemaphoreSlim> Gates = new();
    private string Folder => Path.Combine(store.StudioRoot, "feedback");
    private string RoundsFolder => Path.Combine(Folder, "rounds");
    private string RoundPath(string id) {
        if (!Regex.IsMatch(id ?? "", "^[a-f0-9]{32}$")) throw new TeachingIssue("invalid_round", "Select a saved feedback result.");
        Directory.CreateDirectory(RoundsFolder); return Path.Combine(RoundsFolder, id + ".json");
    }
    private void Write(FeedbackRound round) => TeachingStore.Atomic(RoundPath(round.Id), JsonSerializer.Serialize(round, TeachingScoring.Json));
    public FeedbackRound[] Rounds() {
        Directory.CreateDirectory(RoundsFolder);
        var gate = Gates.GetOrAdd(store.Root, _ => new(1, 1));
        return Directory.GetFiles(RoundsFolder, "*.json").Select(path => {
            // Readers permit atomic replacement while a generation updates its checkpoint.
            using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var r = JsonSerializer.Deserialize<FeedbackRound>(file, TeachingScoring.Json) ?? throw new IOException("Invalid feedback round.");
            return gate.CurrentCount == 1 && r.Status is "analyzing" or "generating" ? r with { Status = "interrupted", Error = "Generation stopped. Completed analysis is saved; no automatic retry." } : r;
        }).OrderByDescending(r => r.CreatedAt).ToArray();
    }
    public string ArtworkPath(string name) {
        if (name is null || !Regex.IsMatch(name, "^[a-f0-9]{32}\\.png$")) throw new TeachingIssue("invalid_artwork", "Choose a saved feedback portrait.");
        var folder = Path.Combine(Folder, "artworks"); Directory.CreateDirectory(folder);
        var full = Path.Combine(folder, name);
        if ((File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0 || (File.Exists(full) && (File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0))
            throw new TeachingIssue("invalid_artwork", "Linked artwork paths are unsupported.");
        return full;
    }
    public TeachingCase Upload(FeedbackUpload input) {
        var photo = store.Upload(input.ImageBase64);
        var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(store.PhotoPath(photo)))).ToLowerInvariant();
        var existing = store.Cases().FirstOrDefault(c => TeachingMemory.PhotoHash(store, c) == hash);
        return store.Save(new() {
            GroupId = existing?.GroupId ?? "uploaded-" + hash[..20], Split = existing?.Split ?? "train",
            PersonPosition = string.IsNullOrWhiteSpace(input.Title) ? "Uploaded portrait" : input.Title.Trim()[..Math.Min(input.Title.Trim().Length, 180)],
            Reference = new() { File = photo, PersonOnly = true, Kind = "feedback-upload" }, TraitScale = 5,
            Extra = new() { ["feedbackPack"] = JsonSerializer.SerializeToElement("uploaded-feedback-v1") }
        }, 0);
    }
    public async Task<FeedbackRound> GenerateAsync(FeedbackGenerate input, CancellationToken token) {
        if (!input.Consent) throw new TeachingIssue("consent_required", "Confirm sending this portrait and relevant preference examples to Meta for analysis and image generation.");
        var gate = Gates.GetOrAdd(store.Root, _ => new(1, 1));
        if (!await gate.WaitAsync(0, token)) throw new TeachingIssue("feedback_busy", "A feedback portrait is already being generated. Wait or stop it first.", 409);
        FeedbackRound? round = null;
        try {
            var c = store.Cases().SingleOrDefault(c => c.CaseId == input.CaseId && !c.Archived) ?? throw new TeachingIssue("case_missing", "Select an active portrait.", 404);
            if (c.Revision != input.ExpectedRevision) throw new TeachingIssue("case_conflict", "This portrait changed. Reload it first.", 409);
            if (!c.Reference.PersonOnly) throw new TeachingIssue("subject_crop_needed", "Choose a single-person reference, or crop the photo in Teach.");
            var bytes = await File.ReadAllBytesAsync(store.PhotoPath(c.Reference.File), token);
            try {
                var encoded = Convert.ToBase64String(bytes);
                round = new(Guid.NewGuid().ToString("N"), c.CaseId, c.Revision, c.Reference.File, TeachingMemory.PhotoHash(store, c), "analyzing", DateTimeOffset.UtcNow);
                Write(round); PortraitProfile[] profiles = [];
                // Exclude this person's own group: the model must predict rather than copy this case's existing label.
                var inspection = await meta.InspectAsync(new(encoded, true, Segment: false), token, excludedGroups: [c.GroupId], onProfiles: p => profiles = p);
                round = round with { Analysis = inspection.Analysis, Profile = profiles.Length == 1 ? profiles[0] : null, PromptVersion = inspection.PromptVersion,
                    MemoryHash = inspection.MemoryHash, Evidence = inspection.MemoryEvidence, Status = "generating" };
                if (inspection.Analysis.GroupPhoto || profiles.Length != 1) throw new TeachingIssue("subject_crop_needed", "This teaching mode needs one clear person. Crop group photos in Teach first.");
                Write(round);
                var image = await meta.RenderAsync(new(encoded, inspection.Ticket, true), token, classifyRefusal: true);
                var png = Convert.FromBase64String(image.Image["data:image/png;base64,".Length..]);
                var filename = Guid.NewGuid().ToString("N") + ".png";
                try {
                    await using (var file = new FileStream(ArtworkPath(filename), FileMode.CreateNew, FileAccess.Write)) await file.WriteAsync(png, CancellationToken.None);
                    round = round with { Status = "ready", ArtworkFile = filename, ArtworkHash = Convert.ToHexString(SHA256.HashData(png)).ToLowerInvariant(), ImageModel = image.Model };
                    Write(round); return round;
                } finally { Array.Clear(png); }
            } finally { Array.Clear(bytes); }
        } catch (Exception error) when (error is TeachingIssue or MatchException or HttpRequestException or OperationCanceledException or IOException or JsonException or KeyNotFoundException or InvalidOperationException) {
            if (round is null) throw;
            var message = error is TeachingIssue or MatchException ? error.Message : error is OperationCanceledException ?
                "Generation stopped or timed out; work accepted by Meta may still be billed. No retry made." : "Generation could not complete. No automatic retry was made.";
            round = round with { Status = error is MatchException { Code: "meta_artwork_rejected" } ? "refused" : "failed", Error = message };
            Write(round); return round;
        } finally { gate.Release(); }
    }
    public TeachingCase Review(FeedbackReview input) {
        var round = Rounds().FirstOrDefault(r => r.Id == input.RoundId) ?? throw new TeachingIssue("round_missing", "Generate a portrait first.", 404);
        if (round.Status != "ready" || round.Analysis is null || round.Profile is null || round.ArtworkFile is null || !File.Exists(ArtworkPath(round.ArtworkFile)))
            throw new TeachingIssue("round_not_ready", "Wait for a generated animal portrait before giving feedback.");
        if (input.Verdict is not ("agree" or "disagree")) throw new TeachingIssue("invalid_verdict", "Choose Agree or Disagree.");
        var c = store.Cases().SingleOrDefault(c => c.CaseId == round.CaseId && !c.Archived) ?? throw new TeachingIssue("case_missing", "Portrait not found.", 404);
        if (c.Revision != input.ExpectedRevision || c.Revision != round.CaseRevision || c.Reference.File != round.ReferenceFile || TeachingMemory.PhotoHash(store, c) != round.PhotoHash)
            throw new TeachingIssue("case_conflict", "The portrait or feedback changed after generation. Reload or generate again.", 409);
        if (c.AcceptedAnimals.Length > 0 && !input.ReplaceExisting) throw new TeachingIssue("existing_labels", "Confirm replacing this portrait's existing animal judgment.", 409);
        var explanation = (input.Explanation ?? "").Trim();
        var preferred = input.Verdict == "agree" ? round.Analysis.AnimalName : (input.PreferredAnimal ?? "").Trim();
        if (input.Verdict == "disagree" && (string.IsNullOrWhiteSpace(preferred) || string.IsNullOrWhiteSpace(explanation)))
            throw new TeachingIssue("correction_required", "For Disagree, enter why and your preferred animal.");
        if (preferred.Length > 80 || explanation.Length > 500) throw new TeachingIssue("invalid_feedback", "Use a short animal name and a reason up to 500 characters.");
        // Agree confirms the result; it does not silently approve the model's explanation as human-authored reasoning.
        var observations = explanation.Length > 0 ? new[] { explanation } : Array.Empty<string>();
        var rejected = c.RejectedAnimals.Where(a => TeachingScoring.Normalize(a) != TeachingScoring.Normalize(preferred)).ToList();
        if (input.Verdict == "disagree" && TeachingScoring.Normalize(preferred) != TeachingScoring.Normalize(round.Analysis.AnimalName)) rejected.Add(round.Analysis.AnimalName);
        var feedback = new FeedbackJudgment(round.Id, round.ReferenceFile, round.PhotoHash, input.Verdict, round.Analysis.AnimalName,
            preferred, observations, explanation, round.Profile, round.ArtworkFile, DateTimeOffset.UtcNow);
        var saved = store.Save(c with { Preference = null, Feedback = feedback, AcceptedAnimals = [preferred], RejectedAnimals = rejected.DistinctBy(TeachingScoring.Normalize).ToArray(),
            SelectionCues = observations, Confidence = "certain" }, c.Revision);
        Write(round with { Verdict = input.Verdict });
        return saved;
    }
}
