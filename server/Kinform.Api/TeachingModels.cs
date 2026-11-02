using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kinform.Api;

public sealed record TeachingCrop(double X, double Y, double Width, double Height);
public sealed record TeachingReference {
    public string File { get; init; } = "";
    public string? OriginalFile { get; init; }
    public string? Kind { get; init; }
    public bool PersonOnly { get; init; }
    public TeachingCrop? Crop { get; init; }
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; init; }
}
public sealed record TeachingTrait(string Key, double? Value, string Visibility, int? Importance, string RenderInstruction);
public sealed record TeachingCase {
    public string CaseId { get; init; } = "";
    public string GroupId { get; init; } = "";
    public string PersonPosition { get; init; } = "";
    public TeachingReference Reference { get; init; } = new();
    public string[] AcceptedAnimals { get; init; } = [];
    public string[] RejectedAnimals { get; init; } = [];
    public string[] SelectionCues { get; init; } = [];
    public JsonElement[] CreativeMappings { get; init; } = [];
    public string CreativeNotes { get; init; } = "";
    public string Confidence { get; init; } = "unspecified";
    public string Split { get; init; } = "unassigned";
    public TeachingTrait[] Traits { get; init; } = [];
    // Older examples keep their original −100…100 annotations without migration.
    public int TraitScale { get; init; } = 100;
    public string[] SalientFeatures { get; init; } = [];
    public Dictionary<string, string> Appearance { get; init; } = [];
    public TeachingPreference? Preference { get; init; }
    public FeedbackJudgment? Feedback { get; init; }
    public bool Archived { get; init; }
    public int Revision { get; init; }
    public DateTimeOffset? UpdatedAt { get; init; }
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; init; }
}
public sealed record TeachingSnapshot(string CaseId, string GroupId, string Split, string[] AcceptedAnimals,
    string[] RejectedAnimals, string LabelHash, int Revision, string InputHash);
public sealed record TeachingEvidence(string CaseId, int Revision, double Score);
public sealed record TeachingPrediction(string CaseId, string[] Animals, string? Error = null, TeachingEvidence[]? Evidence = null);
public sealed record TeachingMetrics(int Cases, int Covered, int Missing, int Groups, int Top1Hits, int Top3Hits,
    int RejectedChoices, double? Top1Agreement, double? Top3Agreement);
public sealed record TeachingRun(string Id, string Name, string Version, string Source, DateTimeOffset CreatedAt,
    string DatasetHash, TeachingSnapshot[] Cases, TeachingPrediction[] Predictions, TeachingMetrics Metrics,
    string Status = "complete", string? MemoryHash = null);
public sealed record TeachingComparison(int ComparableCases, int ExcludedCases, TeachingMetrics A, TeachingMetrics B, double? Top1Delta);
public sealed class TeachingIssue(string code, string message, int status = 400) : Exception(message) {
    public string Code { get; } = code;
    public int Status { get; } = status;
}

public static class TeachingScoring {
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = false };
    public static readonly string[] TraitKeys = [
        "face_ratio", "face_roundness", "forehead_width", "cheek_width", "jaw_width",
        "cheek_fullness", "jaw_taper", "chin_width", "chin_pointedness", "lower_face_height",
        "eye_size", "eye_spacing", "eye_roundness", "eye_tilt", "eye_projection",
        "nose_length", "nose_width", "nose_projection", "nose_bridge", "nose_mouth_gap",
        "mouth_width", "lip_fullness", "smile_curve", "smile_asymmetry", "tooth_display",
        "head_turn", "head_tilt", "ear_prominence", "neck_length", "shoulder_width", "forehead_height", "brow_thickness"
    ];
    public static string Normalize(string label) => string.Join(' ', label.Trim().ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    public static string Hash<T>(T value) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value, Json))).ToLowerInvariant();
    public static TeachingSnapshot Snapshot(TeachingCase item) => new(item.CaseId, item.GroupId, item.Split,
        item.AcceptedAnimals, item.RejectedAnimals, Hash(new {
            accepted = item.AcceptedAnimals.Select(Normalize).Order().ToArray(),
            rejected = item.RejectedAnimals.Select(Normalize).Order().ToArray()
        }), item.Revision, Hash(item.Reference));
    public static TeachingMetrics Score(TeachingSnapshot[] cases, TeachingPrediction[] predictions) {
        var byId = predictions.ToDictionary(p => p.CaseId, StringComparer.Ordinal);
        var covered = 0; var top1 = 0; var top3 = 0; var rejected = 0;
        foreach (var item in cases) {
            if (!byId.TryGetValue(item.CaseId, out var prediction) || prediction.Error is not null || prediction.Animals.Length == 0) continue;
            covered++;
            var accepted = item.AcceptedAnimals.Select(Normalize).ToHashSet();
            var animals = prediction.Animals.Select(Normalize).ToArray();
            if (accepted.Contains(animals[0])) top1++;
            if (animals.Take(3).Any(accepted.Contains)) top3++;
            if (item.RejectedAnimals.Select(Normalize).Contains(animals[0])) rejected++;
        }
        return new(cases.Length, covered, cases.Length - covered, cases.Select(c => c.GroupId).Distinct().Count(),
            top1, top3, rejected, cases.Length == 0 ? null : (double)top1 / cases.Length,
            cases.Length == 0 ? null : (double)top3 / cases.Length);
    }
    public static TeachingComparison Compare(TeachingRun a, TeachingRun b) {
        var other = b.Cases.ToDictionary(c => c.CaseId);
        // Historical scores use frozen labels. Compare only identical labels AND dataset partitions.
        var common = a.Cases.Where(c => other.TryGetValue(c.CaseId, out var match) &&
            c.LabelHash == match.LabelHash && c.Split == match.Split && c.GroupId == match.GroupId && c.InputHash == match.InputHash).ToArray();
        var left = Score(common, a.Predictions); var right = Score(common, b.Predictions);
        return new(common.Length, a.Cases.Select(c => c.CaseId).Union(b.Cases.Select(c => c.CaseId)).Count() - common.Length,
            left, right, common.Length == 0 ? null : right.Top1Agreement - left.Top1Agreement);
    }
}
