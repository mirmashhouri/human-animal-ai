using System.Text.Json;
using Kinform.Api;

if (args.Length != 3 || args[0] is not ("--import" or "--seed-portraits")) {
    Console.WriteLine("Offline tools: --import <private-root> <predictions.json> or --seed-portraits <private-root> <starter/manifest.json>. No model calls.");
    return;
}
var store = new TeachingStore(Path.GetFullPath(args[1]));
if (args[0] == "--seed-portraits") {
    var path = Path.GetFullPath(args[2]); var folder = Path.GetDirectoryName(path)!;
    var records = JsonSerializer.Deserialize<JsonElement[]>(File.ReadAllText(path)) ?? throw new Exception("Invalid portrait manifest.");
    if (records.Length is < 1 or > 1000) throw new Exception("Use 1–1000 attributed portraits.");
    var existing = store.Cases().Select(c => c.CaseId).ToHashSet(); var imported = 0;
    foreach (var (record, i) in records.Select((r,i) => (r,i))) {
        var checksum = record.GetProperty("sha256").GetString()!; var id = "starter-" + checksum[..20];
        if (existing.Contains(id)) continue;
        var source = record.GetProperty("file").GetString()!;
        var full = Path.GetFullPath(Path.Combine(folder,source));
        if (!full.StartsWith(folder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("Invalid starter photo path.");
        var bytes = File.ReadAllBytes(full);
        if (Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant() != checksum) throw new Exception("Starter photo checksum mismatch.");
        var photo = store.Upload(Convert.ToBase64String(bytes));
        store.Save(new TeachingCase {
            CaseId = id, GroupId = "person-" + TeachingScoring.Hash(record.GetProperty("person").GetString())[..20],
            PersonPosition = record.GetProperty("person").GetString()!, Reference = new() { File = photo, Kind = "licensed-starter", PersonOnly = true },
            TraitScale = 5, Split = i % 10 == 8 ? "validation" : i % 10 == 9 ? "test" : "train",
            Extra = new() { ["source"] = record.Clone(), ["starterPack"] = JsonSerializer.SerializeToElement("wikimedia-portraits-v1") }
        }, 0); existing.Add(id); imported++;
    }
    Console.WriteLine(JsonSerializer.Serialize(new { imported, total = store.Cases().Length, note = "No animal labels, ratings or model calls were invented." })); return;
}
var input = JsonSerializer.Deserialize<TeachingImport>(File.ReadAllText(args[2]), TeachingScoring.Json) ?? throw new Exception("Invalid prediction manifest.");
var run = store.SaveRun(input.Name, input.Version, "offline-import", store.SelectCases(input.CaseIds), input.Predictions);
Console.WriteLine(JsonSerializer.Serialize(new { run.Id, run.Name, run.Metrics, note = "Imported predictions supplied by the creator. No model calls or training." }, TeachingScoring.Json));
