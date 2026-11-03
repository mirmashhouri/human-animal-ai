using System.Text.Json;
using Kinform.Api;

if (args.Length != 3 || args[0] is not ("--import" or "--seed-portraits" or "--seed-feedback" or "--activate-memory")) {
    Console.WriteLine("Offline tools: --import <private-root> <predictions.json>, --seed-portraits <private-root> <starter/manifest.json>, --seed-feedback <private-root> <feedback/manifest.json>, or --activate-memory <private-root> <new-report-folder>. No model calls.");
    return;
}
var store = new TeachingStore(Path.GetFullPath(args[1]));
if (args[0] == "--activate-memory") {
    var output = Path.GetFullPath(args[2]);
    if (Directory.Exists(output)) throw new Exception("Use a new report folder so previous activation reports remain intact.");
    var feedback = Path.Combine(store.Root, "preferences.jsonl");
    var before = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(feedback)));
    var cases = store.Cases();
    var confirmed = cases.Where(c => !c.Archived && (c.Preference is not null || c.Feedback is not null)).ToArray();
    foreach (var c in confirmed) if (!TeachingMemory.HasApprovedProfile(c) || TeachingMemory.PhotoHash(store, c) != TeachingMemory.ApprovedPhotoHash(c))
        throw new Exception("A confirmed preference has a changed photo or annotation. Existing feedback was preserved.");
    Directory.CreateDirectory(output);
    foreach (var file in new[] { "memory-index.json", "memory-settings.json" }) {
        var source = Path.Combine(store.StudioRoot, file);
        if (File.Exists(source)) File.Copy(source, Path.Combine(output, "previous-" + file));
    }
    var memory = new TeachingMemory(store); var pool = memory.Capture();
    if (pool.Index.Vectors.All(v => v.Split != "train")) throw new Exception("No confirmed/rated training examples are eligible. No model calls made.");
    memory.SetEnabled(true);
    var after = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(feedback)));
    if (after != before) throw new Exception("Feedback changed concurrently. Activation did not modify the labels.");
    var report = new {
        status = "ready", activatedAt = DateTimeOffset.UtcNow, enabled = memory.Settings().Enabled,
        memoryVersion = TeachingMemory.Version, datasetHash = pool.Index.DatasetHash,
        confirmedChoices = confirmed.Length, customChoices = confirmed.Count(c => c.Preference?.Custom == true || c.Feedback?.Verdict == "disagree"),
        readyForRetrieval = pool.Index.Vectors.Count(v => v.Split == "train"),
        validationExamples = pool.Index.Vectors.Count(v => v.Split == "validation"), testExamples = pool.Index.Vectors.Count(v => v.Split == "test"),
        unassignedExamples = cases.Count(c => !c.Archived && c.Split == "unassigned"),
        feedbackUnchanged = true, fineTuned = false, modelCalls = 0,
        notice = "Main-app requests use relevant confirmed training judgments for bounded local ranking. Validation/test examples stay excluded. Existing labels, reasons, artwork choices and splits are unchanged."
    };
    var json = JsonSerializer.Serialize(report, new JsonSerializerOptions(TeachingScoring.Json) { WriteIndented = true });
    File.WriteAllText(Path.Combine(output, "activation.json"), json); Console.WriteLine(json); return;
}
if (args[0] is "--seed-portraits" or "--seed-feedback") {
    var isFeedback = args[0] == "--seed-feedback";
    var path = Path.GetFullPath(args[2]); var folder = Path.GetDirectoryName(path)!;
    var records = JsonSerializer.Deserialize<JsonElement[]>(File.ReadAllText(path)) ?? throw new Exception("Invalid portrait manifest.");
    if (records.Length is < 1 or > 1000) throw new Exception("Use 1–1000 attributed portraits.");
    var existing = store.Cases().Select(c => c.CaseId).ToHashSet(); var imported = 0;
    foreach (var (record, i) in records.Select((r,i) => (r,i))) {
        var checksum = record.GetProperty("sha256").GetString()!; var id = (isFeedback ? "feedback-" : "starter-") + checksum[..20];
        if (existing.Contains(id)) continue;
        var source = record.GetProperty("file").GetString()!;
        var full = Path.GetFullPath(Path.Combine(folder,source));
        if (!full.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("Invalid starter photo path.");
        var bytes = File.ReadAllBytes(full);
        if (Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant() != checksum) throw new Exception("Starter photo checksum mismatch.");
        var photo = store.Upload(Convert.ToBase64String(bytes));
        store.Save(new TeachingCase {
            CaseId = id, GroupId = "person-" + TeachingScoring.Hash(record.GetProperty("person").GetString())[..20],
            PersonPosition = record.GetProperty("person").GetString()!, Reference = new() { File = photo, Kind = isFeedback ? "licensed-feedback" : "licensed-starter", PersonOnly = true },
            TraitScale = 5, Split = isFeedback ? "train" : i % 10 == 8 ? "validation" : i % 10 == 9 ? "test" : "train",
            Extra = new() { ["source"] = record.Clone(), [isFeedback ? "feedbackPack" : "starterPack"] = JsonSerializer.SerializeToElement(isFeedback ? "wikimedia-feedback-v1" : "wikimedia-portraits-v1") }
        }, 0); existing.Add(id); imported++;
    }
    Console.WriteLine(JsonSerializer.Serialize(new { imported, total = store.Cases().Length, note = "No animal labels, ratings or model calls were invented." })); return;
}
var input = JsonSerializer.Deserialize<TeachingImport>(File.ReadAllText(args[2]), TeachingScoring.Json) ?? throw new Exception("Invalid prediction manifest.");
var run = store.SaveRun(input.Name, input.Version, "offline-import", store.SelectCases(input.CaseIds), input.Predictions);
Console.WriteLine(JsonSerializer.Serialize(new { run.Id, run.Name, run.Metrics, note = "Imported predictions supplied by the creator. No model calls or training." }, TeachingScoring.Json));
