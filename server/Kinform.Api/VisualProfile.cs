using System.Text.Json;
using System.Text.RegularExpressions;

namespace Kinform.Api;

// Editorial art-comparison weights, not scientifically validated measurements.
public static class VisualProfile {
    public sealed record Field(string Name, int Weight);
    public static readonly IReadOnlyList<Field> Fields = Array.AsReadOnly(new Field[] {
        new("Face outline", 5), new("Face length to width", 5), new("Forehead width", 3),
        new("Cheekbone width", 4), new("Cheek fullness", 3), new("Jaw width", 5),
        new("Jaw contour", 4), new("Chin shape", 4), new("Eye shape", 5), new("Eye size", 3),
        new("Eye spacing", 4), new("Eye tilt", 3), new("Eyelid contour", 2), new("Brow shape", 3),
        new("Brow to eye spacing", 2), new("Nose width", 3), new("Nose length", 3),
        new("Mouth width", 3), new("Lip contour", 2), new("Iris colour", 1)
    });
    public static object Schema => new {
        type = "object", additionalProperties = false,
        properties = new {
            usablePortrait = new { type = "boolean" },
            features = new { type = new[] { "object", "null" }, additionalProperties = false,
                properties = Fields.ToDictionary(entry => entry.Name, _ => (object)new {
                type = "object", additionalProperties = false,
                properties = new {
                    keyword = new { type = "string", minLength = 2, maxLength = 40, pattern = "^[a-zA-Z]+(?:[ -][a-zA-Z]+)*$" },
                    observation = new { type = "string", minLength = 2, maxLength = 180 },
                    visibility = new { type = "string", @enum = new[] { "clear", "uncertain", "not_visible" } },
                    salience = new { type = "integer", minimum = 0, maximum = 3 },
                    artisticEmphasis = new { type = new[] { "string", "null" }, minLength = 2, maxLength = 160 }
                }, required = new[] { "keyword", "observation", "visibility", "salience", "artisticEmphasis" }
            }), required = Fields.Select(entry => entry.Name).ToArray() }
        }, required = new[] { "usablePortrait", "features" }
    };
    public static FaceFeature[] Read(JsonElement root) {
        if (!root.GetProperty("usablePortrait").GetBoolean())
            throw new MatchException("unusable_portrait", "Use a well-lit, front-facing photograph with exactly one clearly visible face.");
        var values = root.GetProperty("features");
        RequireFieldMap(values, "profile_fields");
        var features = Fields.Select(field => {
            var item = values.GetProperty(field.Name);
            var observation = Text(item, "observation", 180, "profile_observation");
            var keyword = Text(item, "keyword", 40, "profile_keyword");
            var visibility = Text(item, "visibility", 20, "profile_visibility");
            if (!item.TryGetProperty("salience", out var salienceValue) || salienceValue.ValueKind != JsonValueKind.Number ||
                !salienceValue.TryGetDecimal(out var number) || number is < 0 or > 3 || number != decimal.Truncate(number)) throw Invalid("profile_salience");
            var salience = (int)number;
            if (!item.TryGetProperty("artisticEmphasis", out var emphasisValue) || emphasisValue.ValueKind is not (JsonValueKind.Null or JsonValueKind.String))
                throw Invalid("profile_artistic_emphasis");
            var emphasis = emphasisValue.ValueKind == JsonValueKind.Null ? null : Text(item, "artisticEmphasis", 160, "profile_artistic_emphasis");
            if (!ValidKeyword(keyword)) throw Invalid("profile_keyword");
            if (visibility is not ("clear" or "uncertain" or "not_visible")) throw Invalid("profile_visibility");
            // Unknown text is never evidence. Normalize it locally, rather than requiring magic wording.
            if (keyword.Equals("not observable", StringComparison.OrdinalIgnoreCase) && visibility == "clear") visibility = "uncertain";
            if (visibility != "clear") { keyword = "not observable"; salience = 0; }
            // Colour may support a look, but never define the caricaturist's structural signature.
            if (salience < 2 || field.Name == "Iris colour") emphasis = null;
            else if (emphasis is null) throw Invalid("profile_artistic_emphasis");
            return new FaceFeature(field.Name, observation, keyword, visibility, salience, emphasis);
        }).ToArray();
        if (features.Take(19).Count(x => x.Visibility == "clear") < 10 ||
            features.Take(8).Count(x => x.Visibility == "clear") < 3 ||
            features.Skip(8).Take(5).Count(x => x.Visibility == "clear") < 2)
            throw new MatchException("unusable_portrait", "Too few facial shapes are clearly visible. Try a front-facing photo with better light, visible eyes and an unobstructed jaw.");
        // Select at most three focal shapes. These ranks are calculated here, not supplied by the AI.
        var signature = Enumerable.Range(0, 19).Where(i => features[i].Visibility == "clear" && features[i].Salience >= 2)
            .OrderByDescending(i => features[i].Salience).ThenByDescending(i => Fields[i].Weight).ThenBy(i => i).Take(3).ToArray();
        if (signature.Length == 0) throw new MatchException("unclear_artistic_signature",
            "The AI could not identify a clearly supported focal shape for this artistic comparison. Try another well-lit portrait; no animal result was invented.");
        for (var rank = 0; rank < signature.Length; rank++) features[signature[rank]] = features[signature[rank]] with { SignatureRank = rank + 1 };
        return features;
    }
    public static bool ValidKeyword(string value) => value.Length is >= 2 and <= 40 && Regex.IsMatch(value, @"\A[a-zA-Z]+(?:[ -][a-zA-Z]+)*\z");
    public static void RequireFieldMap(JsonElement item, string diagnostic) {
        if (item.ValueKind != JsonValueKind.Object) throw Invalid(diagnostic);
        var names = item.EnumerateObject().Select(x => x.Name).ToArray();
        if (names.Length != Fields.Count || names.Distinct(StringComparer.Ordinal).Count() != Fields.Count ||
            Fields.Any(field => !names.Contains(field.Name, StringComparer.Ordinal))) throw Invalid(diagnostic);
    }
    public static string Text(JsonElement item, string property, int max, string diagnostic = "profile_text") {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var text) || text.ValueKind != JsonValueKind.String) throw Invalid(diagnostic);
        var value = text.GetString()?.Trim();
        if (string.IsNullOrWhiteSpace(value) || value.Length > max || value.Any(char.IsControl)) throw Invalid(diagnostic);
        return value;
    }
    // Callers pass constant rule names only, never provider text or facial observations.
    public static MatchException Invalid(string diagnostic = "profile_structure") => new("invalid_provider_result",
        $"The AI response could not be validated ({diagnostic}). No automatic retry or substitute result was made.", diagnostic);
}
