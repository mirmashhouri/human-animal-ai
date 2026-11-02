using System.Security.Cryptography;
using System.Text.Json;

namespace Kinform.Api;

public sealed record TeachingFeature(string Key, string Label, string Low, string High);
public sealed record MemoryVector(string CaseId, int Revision, string GroupId, string Split, string PhotoHash, double?[] Values, bool[] Salient);
public sealed record MemoryIndex(string Version, string DatasetHash, DateTimeOffset UpdatedAt, MemoryVector[] Vectors);
public sealed record MemorySettings(bool Enabled = true);
public sealed record MemoryMatch(TeachingCase Example, double Score);
public sealed record PortraitFeature(string Key, double? Value);
public sealed record PortraitProfile(int Id, string Position, PortraitFeature[] Features, string[] SalientFeatures);
public sealed record MemoryContext(PortraitProfile Profile, MemoryMatch[] Matches, string IndexHash);
public sealed record MemoryPool(MemoryIndex Index, TeachingCase[] Cases);

// Transparent, masked trait vectors, not identity embeddings. Unknown ≠ neutral.
public sealed class TeachingMemory(TeachingStore store) {
    public string PhotoPath(TeachingCase item) => store.PhotoPath(item.Reference.File);
    public const string Version = "wildlens-trait-memory-v3-feedback";
    public static readonly string[] AppearanceKeys = ["eye_color", "hair_shape", "hair_color", "glasses", "facial_hair", "pose", "clothing"];
    public static readonly TeachingFeature[] Features = [
        new("face_ratio", "Face length", "Short / wide", "Long / narrow"), new("face_roundness", "Face roundness", "Angular", "Round"),
        new("forehead_height", "Forehead height", "Short", "Tall"), new("forehead_width", "Forehead width", "Narrow", "Wide"),
        new("cheek_fullness", "Cheek fullness", "Hollow / flat", "Full / rounded"), new("jaw_width", "Jaw width", "Narrow", "Wide"),
        new("chin_pointedness", "Chin shape", "Rounded", "Pointed"), new("eye_size", "Eye size", "Small", "Large"),
        new("eye_spacing", "Eye spacing", "Close", "Wide"), new("eye_roundness", "Eye shape", "Elongated", "Round"),
        new("eye_projection", "Eye prominence", "Deep-set", "Prominent"), new("brow_thickness", "Eyebrow thickness", "Thin", "Thick"),
        new("nose_length", "Nose length", "Short", "Long"), new("nose_width", "Nose width", "Narrow", "Wide"),
        new("nose_projection", "Nose prominence", "Low", "High"), new("mouth_width", "Mouth width", "Narrow", "Wide"),
        new("lip_fullness", "Lip fullness", "Thin", "Full"), new("smile_curve", "Smile curve", "Downturned", "Upturned"),
        new("tooth_display", "Visible teeth", "Little / none", "Much"), new("ear_prominence", "Ear prominence", "Close / small", "Prominent")
    ];
    public static string PhotoHash(TeachingStore store, TeachingCase item) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(store.PhotoPath(item.Reference.File)))).ToLowerInvariant();
    public static PortraitProfile? ApprovedProfile(TeachingCase c) => c.Preference is { } p && p.ReferenceFile == c.Reference.File &&
        c.AcceptedAnimals.SequenceEqual(new[] { p.Animal }) && c.SelectionCues.SequenceEqual(p.Reasons) ? p.RetrievalProfile :
        c.Feedback is { } f && f.ReferenceFile == c.Reference.File && c.AcceptedAnimals.SequenceEqual(new[] { f.PreferredAnimal }) &&
        c.SelectionCues.SequenceEqual(f.Observations) ? f.RetrievalProfile : null;
    public static bool HasApprovedProfile(TeachingCase c) => ApprovedProfile(c) is not null;
    public static string? ApprovedPhotoHash(TeachingCase c) => c.Preference?.PhotoHash ?? c.Feedback?.PhotoHash;
    public static double? Value(TeachingCase c, string key) {
        var manual = c.Traits.FirstOrDefault(t => t.Key == key);
        // Explicit human uncertainty/hidden annotations mask the AI estimate too.
        return manual is not null ? (manual.Visibility == "clear" ? manual.Value / c.TraitScale : null) :
            ApprovedProfile(c)?.Features.FirstOrDefault(f => f.Key == key)?.Value / 5;
    }
    public static bool Salient(TeachingCase c, string key) => c.SalientFeatures.Contains(key) ||
        (c.Traits.Length == 0 && c.SalientFeatures.Length == 0 && ApprovedProfile(c)?.SalientFeatures.Contains(key) == true);
    public static bool Indexable(TeachingCase c) => !c.Archived && c.AcceptedAnimals.Length > 0 && c.Reference.PersonOnly &&
        (Features.Any(f => Value(c, f.Key) is not null) || c.SalientFeatures.Any(k => Features.Any(f => f.Key == k)));
    public static bool Eligible(TeachingCase c) => c.Split == "train" && Indexable(c);
    public static MemoryIndex WriteIndex(TeachingStore store, TeachingCase[] cases) {
        var vectors = cases.Where(Indexable).Where(c => !HasApprovedProfile(c) || ApprovedPhotoHash(c) == PhotoHash(store, c))
            .Select(c => new MemoryVector(c.CaseId, c.Revision, c.GroupId, c.Split, PhotoHash(store, c),
            Features.Select(f => Value(c, f.Key)).ToArray(), Features.Select(f => Salient(c, f.Key)).ToArray())).ToArray();
        var index = new MemoryIndex(Version, TeachingStore.DatasetHash(cases), DateTimeOffset.UtcNow, vectors);
        TeachingStore.Atomic(Path.Combine(store.StudioRoot, "memory-index.json"), JsonSerializer.Serialize(index, TeachingScoring.Json)); return index;
    }
    public MemoryIndex Index() {
        var cases = store.Cases(); var path = Path.Combine(store.StudioRoot, "memory-index.json");
        if (File.Exists(path)) {
            try {
                var saved = JsonSerializer.Deserialize<MemoryIndex>(File.ReadAllText(path), TeachingScoring.Json);
                if (saved is not null && saved.Version == Version && saved.DatasetHash == TeachingStore.DatasetHash(cases)) return saved;
            } catch (JsonException) { }
        }
        return WriteIndex(store, cases);
    }
    public MemorySettings Settings() {
        var path = Path.Combine(store.StudioRoot, "memory-settings.json");
        return File.Exists(path) ? JsonSerializer.Deserialize<MemorySettings>(File.ReadAllText(path), TeachingScoring.Json) ?? new() : new();
    }
    public void SetEnabled(bool enabled) => TeachingStore.Atomic(Path.Combine(store.StudioRoot, "memory-settings.json"), JsonSerializer.Serialize(new MemorySettings(enabled), TeachingScoring.Json));
    public MemoryPool Capture() { var cases = store.Cases(); return new(WriteIndex(store,cases),cases); }
    public MemoryMatch[] Search(PortraitProfile query, string queryPhotoHash, string[] excludedGroups, int take = 3, MemoryPool? pool = null) {
        pool ??= Capture(); var index = pool.Index; var cases = pool.Cases.ToDictionary(c => c.CaseId);
        var result = new List<MemoryMatch>();
        foreach (var vector in index.Vectors) {
            if (excludedGroups.Contains(vector.GroupId) || vector.PhotoHash == queryPhotoHash || !cases.TryGetValue(vector.CaseId, out var item) || item.Revision != vector.Revision || !Eligible(item)) continue;
            double distance = 0, weights = 0; var shared = 0; var salientOverlap = 0;
            for (var i = 0; i < Features.Length; i++) {
                var key = Features[i].Key; var value = query.Features.FirstOrDefault(f => f.Key == key)?.Value;
                if (value is { } q && double.IsFinite(q) && q is >= -5 and <= 5 && vector.Values[i] is { } existing) {
                    var importance = item.Traits.FirstOrDefault(t => t.Key == key)?.Importance;
                    var weight = importance == 0 ? 0 : importance ?? (vector.Salient[i] ? 3 : 1);
                    if (weight > 0) { distance += Math.Abs(q / 5 - existing) / 2 * weight; weights += weight; shared++; }
                }
                if (vector.Salient[i] && query.SalientFeatures.Contains(key)) salientOverlap++;
            }
            // Only user-marked salience can work without numeric ratings; no invented zero values.
            if (shared == 0 && salientOverlap == 0) continue;
            var numeric = weights > 0 ? (1 - distance / weights) * (.65 + .35 * Math.Min(1, shared / 3.0)) : 0;
            var salience = salientOverlap > 0 ? .60 + .08 * Math.Min(3, salientOverlap) : 0;
            var score = weights > 0 ? Math.Min(1, numeric + .03 * Math.Min(3, salientOverlap)) : salience;
            if (score >= .60) result.Add(new(item, Math.Round(score, 4)));
        }
        return result.OrderByDescending(r => r.Score).ThenBy(r => r.Example.CaseId).DistinctBy(r => r.Example.GroupId).Take(Math.Clamp(take, 1, 5)).ToArray();
    }
    public object Status() {
        var index = Index(); var all = store.Cases(); return new { enabled = Settings().Enabled, version = Version,
            indexedExamples = index.Vectors.Count(v => v.Split == "train"), vectorCount = index.Vectors.Length, labeledExamples = all.Count(c => !c.Archived && c.AcceptedAnimals.Length > 0),
            totalExamples = all.Count(c => !c.Archived), index.DatasetHash, index.UpdatedAt,
            notice = "Only confirmed/labeled training portraits are retrieved: manual features or an AI geometry profile attached to your confirmed choice. Draft suggestions never enter memory. No fine-tuning. Saving a choice makes no Meta calls." };
    }
}
