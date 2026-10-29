using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Kinform.Api;

public sealed class TeachingStore {
    private readonly object gate = new();
    public string Root { get; }
    private string CasesFile => Path.Combine(Root, "preferences.jsonl");
    public string StudioRoot => Path.Combine(Root, "studio");
    public TeachingStore(string root) {
        Root = Path.GetFullPath(root);
        Directory.CreateDirectory(Path.Combine(Root, "references"));
        Directory.CreateDirectory(Path.Combine(StudioRoot, "runs"));
    }
    private TeachingCase[] Read() {
        if (!File.Exists(CasesFile)) return [];
        var cases = File.ReadLines(CasesFile).Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(line => JsonSerializer.Deserialize<TeachingCase>(line, TeachingScoring.Json) ?? throw new IOException("Invalid teaching data."))
            .Select(item => item with { Revision = Math.Max(1, item.Revision) }).ToArray();
        if (cases.Select(c => c.CaseId).Distinct().Count() != cases.Length) throw new IOException("Duplicate case ids in private data.");
        return cases;
    }
    public TeachingCase[] Cases() { lock (gate) return Read(); }
    public static string DatasetHash(TeachingCase[] cases) => TeachingScoring.Hash(cases.OrderBy(c => c.CaseId).ToArray());
    private static bool Id(string value) => value is not null && Regex.IsMatch(value, "^[a-zA-Z0-9_-]{1,100}$");
    public string PhotoPath(string reference) {
        if (reference is null || !Regex.IsMatch(reference, "^references/[a-zA-Z0-9_-]{1,100}\\.jpe?g$", RegexOptions.IgnoreCase))
            throw new TeachingIssue("invalid_photo", "Select a stored JPEG photo.");
        var full = Path.GetFullPath(Path.Combine(Root, reference.Replace('/', Path.DirectorySeparatorChar)));
        var references = Path.GetFullPath(Path.Combine(Root, "references")) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(references, StringComparison.OrdinalIgnoreCase)) throw new TeachingIssue("invalid_photo", "Invalid photo path.");
        // Do not follow links/junctions to files outside the private data folder.
        if ((File.GetAttributes(Path.Combine(Root, "references")) & FileAttributes.ReparsePoint) != 0 ||
            (File.Exists(full) && (File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0))
            throw new TeachingIssue("invalid_photo", "Linked photo paths are unsupported.");
        return full;
    }
    public string Upload(string encoded) {
        var bytes = JpegInput.Parse(encoded);
        try {
            var name = "references/" + Guid.NewGuid().ToString("N") + ".jpg";
            using var stream = new FileStream(PhotoPath(name), FileMode.CreateNew, FileAccess.Write);
            stream.Write(bytes); return name;
        } finally { Array.Clear(bytes); }
    }
    private static string[] Names(string[] names) {
        if (names is null || names.Length > 30 || names.Any(n => string.IsNullOrWhiteSpace(n) || n.Length > 80 || n.Any(char.IsControl)))
            throw new TeachingIssue("invalid_labels", "Use up to 30 short animal names.");
        return names.Select(n => string.Join(' ', n.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)))
            .DistinctBy(TeachingScoring.Normalize).ToArray();
    }
    public TeachingCase Save(TeachingCase value, int expectedRevision) {
        lock (gate) {
            if (value is null) throw new TeachingIssue("invalid_case", "Provide an example to save.");
            var cases = Read().ToList();
            var current = cases.FirstOrDefault(c => c.CaseId == value.CaseId);
            if (current is null ? expectedRevision != 0 : current.Revision != expectedRevision)
                throw new TeachingIssue("case_conflict", "This example changed. Reload it before saving.", 409);
            var item = value with {
                CaseId = current?.CaseId ?? (string.IsNullOrWhiteSpace(value.CaseId) ? Guid.NewGuid().ToString("N") : value.CaseId),
                AcceptedAnimals = Names(value.AcceptedAnimals), RejectedAnimals = Names(value.RejectedAnimals),
                // Preserve original human feedback and import metadata when the editor omits them.
                Extra = current?.Extra ?? value.Extra, UpdatedAt = DateTimeOffset.UtcNow, Revision = (current?.Revision ?? 0) + 1
            };
            var metadata = new Dictionary<string, JsonElement>(item.Extra ?? []);
            metadata["rationaleStatus"] = JsonSerializer.SerializeToElement(item.SelectionCues is { Length: > 0 } ? "supplied" : "not_supplied");
            metadata["trainingStatus"] = JsonSerializer.SerializeToElement("not_trained");
            item = item with { Extra = metadata };
            Validate(item);
            void Audit(TeachingCase previous) => File.AppendAllText(Path.Combine(StudioRoot, "history.jsonl"),
                JsonSerializer.Serialize(new { at = item.UpdatedAt, previous }, TeachingScoring.Json) + "\n", new UTF8Encoding(false));
            if (current is not null) {
                Audit(current);
                cases[cases.IndexOf(current)] = item;
            } else cases.Add(item);
            // Split assignment belongs to the related group, never to one crop alone.
            cases = cases.Select(c => {
                if (c.GroupId != item.GroupId || c.Split == item.Split) return c;
                Audit(c); return c with { Split = item.Split, Revision = c.Revision + 1, UpdatedAt = item.UpdatedAt };
            }).ToList();
            Atomic(CasesFile, string.Join("\n", cases.Select(c => JsonSerializer.Serialize(c, TeachingScoring.Json))) + "\n");
            TeachingMemory.WriteIndex(this, cases.ToArray());
            return item;
        }
    }
    private void Validate(TeachingCase item) {
        if (!Id(item.CaseId) || !Id(item.GroupId) || string.IsNullOrWhiteSpace(item.PersonPosition) || item.PersonPosition.Length > 180 ||
            item.Split is not ("unassigned" or "train" or "validation" or "test") ||
            item.Confidence is not ("unspecified" or "certain" or "alternatives" or "uncertain") || item.CreativeNotes is null || item.CreativeNotes.Length > 4000 ||
            item.SelectionCues is null || item.SelectionCues.Length > 30 || item.SelectionCues.Any(c => string.IsNullOrWhiteSpace(c) || c.Length > 500) ||
            item.CreativeMappings is null || item.CreativeMappings.Length > 20 || item.Traits is null || item.Traits.Length > 32 || item.Reference is null ||
            item.TraitScale is not (5 or 100) || item.SalientFeatures is null || item.SalientFeatures.Length > 32 ||
            item.SalientFeatures.Distinct().Count() != item.SalientFeatures.Length || item.SalientFeatures.Any(k => !TeachingScoring.TraitKeys.Contains(k)) ||
            item.Appearance is null || item.Appearance.Count > 10 || item.Appearance.Any(p => !TeachingMemory.AppearanceKeys.Contains(p.Key) || p.Value is null || p.Value.Length > 80 || p.Value.Any(char.IsControl)))
            throw new TeachingIssue("invalid_case", "Check the position, group, labels and annotation lengths.");
        if (item.AcceptedAnimals.Select(TeachingScoring.Normalize).Intersect(item.RejectedAnimals.Select(TeachingScoring.Normalize)).Any())
            throw new TeachingIssue("overlapping_labels", "An animal cannot be both accepted and rejected.");
        if (!File.Exists(PhotoPath(item.Reference.File))) throw new TeachingIssue("missing_photo", "Upload a photo first.");
        if (item.Reference.OriginalFile is { } original && !File.Exists(PhotoPath(original))) throw new TeachingIssue("missing_photo", "The original photo is missing.");
        if (item.Reference.Crop is { } crop && (!double.IsFinite(crop.X + crop.Y + crop.Width + crop.Height) || crop.X < 0 || crop.Y < 0 || crop.Width <= 0 || crop.Height <= 0 || crop.X + crop.Width > 1.001 || crop.Y + crop.Height > 1.001))
            throw new TeachingIssue("invalid_crop", "Keep the crop inside the photo.");
        if (item.Traits.Any(t => t is null || !TeachingScoring.TraitKeys.Contains(t.Key) || t.Value is { } v && (!double.IsFinite(v) || Math.Abs(v) > item.TraitScale) ||
                t.Importance is < 0 or > 5 || t.Visibility is not ("clear" or "uncertain" or "hidden") ||
                t.RenderInstruction is null || t.RenderInstruction.Length > 500 || (t.Visibility != "clear" && t.Value is not null)) ||
            item.Traits.Select(t => t.Key).Distinct().Count() != item.Traits.Length)
            throw new TeachingIssue("invalid_traits", "Use unique traits within the selected scale, and leave uncertain/hidden values empty.");
    }
    public TeachingCase[] SelectCases(string[] ids) {
        lock (gate) {
            if (ids is null || ids.Length is < 1 or > 5000 || ids.Distinct().Count() != ids.Length) throw new TeachingIssue("invalid_scope", "Select distinct labeled examples.");
            var all = Read().ToDictionary(c => c.CaseId);
            return ids.Select(id => all.TryGetValue(id, out var item) && !item.Archived && item.AcceptedAnimals.Length > 0
                ? item : throw new TeachingIssue("invalid_scope", "Every selected example needs accepted animals and must be active.")).ToArray();
        }
    }
    public TeachingRun SaveRun(string name, string version, string source, TeachingCase[] cases, TeachingPrediction[] predictions, string status = "complete", string? memoryHash = null) {
        lock (gate) {
            if (string.IsNullOrWhiteSpace(name) || name.Length > 120 || string.IsNullOrWhiteSpace(version) || version.Length > 180 || predictions is null ||
                predictions.Length > cases.Length || predictions.Select(p => p.CaseId).Distinct().Count() != predictions.Length ||
                predictions.Any(p => p is null || !cases.Any(c => c.CaseId == p.CaseId) || p.Animals is null || p.Animals.Length > 10 ||
                    p.Animals.Any(n => string.IsNullOrWhiteSpace(n) || n.Length > 80) || (p.Error?.Length ?? 0) > 1000))
                throw new TeachingIssue("invalid_predictions", "Provide a run name/version and unique predictions for the selected case ids.");
            predictions = predictions.Select(p => p with {
                Animals = p.Animals.Select(n => string.Join(' ', n.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))).DistinctBy(TeachingScoring.Normalize).ToArray(),
                Error = string.IsNullOrWhiteSpace(p.Error) ? null : p.Error.Trim()
            }).ToArray();
            var snapshots = cases.Select(TeachingScoring.Snapshot).ToArray();
            var run = new TeachingRun(Guid.NewGuid().ToString("N"), name.Trim(), version.Trim(), source,
                DateTimeOffset.UtcNow, TeachingScoring.Hash(snapshots.OrderBy(c => c.CaseId).ToArray()), snapshots, predictions, TeachingScoring.Score(snapshots, predictions), status, memoryHash);
            Atomic(Path.Combine(StudioRoot, "runs", run.Id + ".json"), JsonSerializer.Serialize(run, TeachingScoring.Json));
            return run;
        }
    }
    public TeachingRun[] Runs() { lock (gate) return Directory.GetFiles(Path.Combine(StudioRoot, "runs"), "*.json")
        .Select(path => JsonSerializer.Deserialize<TeachingRun>(File.ReadAllText(path), TeachingScoring.Json) ?? throw new IOException("Invalid benchmark run."))
        .OrderByDescending(r => r.CreatedAt).ToArray(); }
    public TeachingRun Run(string id) => Runs().FirstOrDefault(r => r.Id == id) ?? throw new TeachingIssue("run_missing", "Benchmark run not found.", 404);
    public string Export() { lock (gate) return string.Join("\n", Read().Select(c => JsonSerializer.Serialize(c, TeachingScoring.Json))) + "\n"; }
    public static void Atomic(string path, string contents) {
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(temporary, contents, new UTF8Encoding(false));
        File.Move(temporary, path, overwrite: true);
    }
}
