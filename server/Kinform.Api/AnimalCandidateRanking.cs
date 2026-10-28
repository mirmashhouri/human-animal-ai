using System.Text.Json;

namespace Kinform.Api;

public static class AnimalCandidateRanking {
    public const int CandidateCount = 8;
    public static object Schema => new {
        type = "object", additionalProperties = false,
        properties = new { candidates = new { type = "array", minItems = CandidateCount, maxItems = CandidateCount, items = new {
            type = "object", additionalProperties = false,
            properties = new {
                name = new { type = "string", minLength = 1, maxLength = 80 }, scientificName = new { type = "string", minLength = 3, maxLength = 80 },
                scores = new { type = "object", additionalProperties = false,
                    properties = VisualProfile.Fields.ToDictionary(entry => entry.Name, _ => (object)new { type = "integer", minimum = 0, maximum = 4 }),
                    required = VisualProfile.Fields.Select(entry => entry.Name).ToArray() },
                reason = new { type = "string", minLength = 1, maxLength = 200 }, difference = new { type = "string", minLength = 1, maxLength = 160 }
            }, required = new[] { "name", "scientificName", "scores", "reason", "difference" }
        } } }, required = new[] { "candidates" }
    };
    public static AnimalSuggestion[] ReadAndRank(JsonElement root, FaceFeature[] features, int resultCount = 3) {
        if (resultCount is not (1 or 3)) throw new ArgumentOutOfRangeException(nameof(resultCount));
        if (features.Length != 20 || !features.Select(x => x.Feature).SequenceEqual(VisualProfile.Fields.Select(x => x.Name))) throw VisualProfile.Invalid("candidate_profile_alignment");
        var signature = Enumerable.Range(0, 19).Where(i => features[i].SignatureRank is >= 1 and <= 3 && features[i].Visibility == "clear").ToArray();
        if (signature.Length == 0) throw VisualProfile.Invalid("candidate_signature_missing");
        var values = root.GetProperty("candidates");
        if (values.ValueKind != JsonValueKind.Array || values.GetArrayLength() != CandidateCount) throw VisualProfile.Invalid("candidate_count");
        var candidates = values.EnumerateArray().Select(item => {
            var name = VisualProfile.Text(item, "name", 80, "candidate_name");
            var species = VisualProfile.Text(item, "scientificName", 80, "candidate_species");
            var reason = VisualProfile.Text(item, "reason", 200, "candidate_reason");
            var difference = VisualProfile.Text(item, "difference", 160, "candidate_difference");
            if (!OpenAiMatcher.ValidScientificName(species)) throw VisualProfile.Invalid("candidate_species");
            var scoreMap = item.GetProperty("scores");
            VisualProfile.RequireFieldMap(scoreMap, "candidate_score_fields");
            var scores = VisualProfile.Fields.Select(field => {
                var value = scoreMap.GetProperty(field.Name);
                if (value.ValueKind != JsonValueKind.Number || !value.TryGetDecimal(out var number) ||
                    number is < 0 or > 4 || number != decimal.Truncate(number)) throw VisualProfile.Invalid("candidate_score_value");
                return (int)number;
            }).ToArray();
            // Derive supporting fields from the one source of truth. A second AI list can contradict it.
            var evidence = Enumerable.Range(0, features.Length).Where(i => features[i].Visibility == "clear" && scores[i] >= 3).ToArray();
            // Missing/ambiguous evidence never contributes, even if the model invents a high score.
            var weightedScore = scores.Select((score, index) => features[index].Visibility == "clear" ? score * VisualProfile.Fields[index].Weight : 0).Sum();
            // Personal focal shapes lead; many generic agreements cannot outweigh a weaker signature fit.
            var signatureScore = signature.Sum(i => scores[i] * features[i].Salience);
            var supportsSignature = signature.All(i => scores[i] >= 2) && signature.Any(i => scores[i] >= 3);
            var keywords = evidence.OrderBy(i => features[i].SignatureRank ?? int.MaxValue)
                .ThenByDescending(i => VisualProfile.Fields[i].Weight).ThenBy(i => i)
                .Select(i => features[i].Keyword!).Distinct(StringComparer.OrdinalIgnoreCase).Take(3).ToArray();
            var signatureKeywords = signature.Where(i => scores[i] >= 3).OrderBy(i => features[i].SignatureRank).Select(i => features[i].Keyword!).Distinct();
            return new { Species = species, SignatureScore = signatureScore, SupportsSignature = supportsSignature,
                Score = weightedScore, StrongShapeEvidence = evidence.Count(i => i < 19),
                Suggestion = new AnimalSuggestion(name, species, "Signature echoes: " + string.Join(", ", signatureKeywords) + ". " + reason + " Difference: " + difference, keywords) };
        }).ToArray();
        if (candidates.Select(x => x.Species).Distinct(StringComparer.OrdinalIgnoreCase).Count() != CandidateCount)
            throw VisualProfile.Invalid("candidate_duplicate_species");
        var best = candidates.Where(x => x.SupportsSignature && x.StrongShapeEvidence >= 2).OrderByDescending(x => x.SignatureScore).ThenByDescending(x => x.Score)
            .ThenBy(x => x.Species, StringComparer.Ordinal).Take(resultCount).Select(x => x.Suggestion).ToArray();
        if (best.Length != resultCount) throw new MatchException("weak_visual_matches", resultCount == 1 ?
            "The AI could not choose a supported animal for this character. Try another clear, front-facing portrait." :
            "The distinctive facial shapes did not support three useful animal comparisons. Try another clear, front-facing portrait.");
        return best;
    }
}
