using System.Text.Json;

namespace Kinform.Api;

public sealed record Animal(string Id, string Name, string ScientificName, string Family,
    string Description, string[] Traits, string PhotoCredit, string LicenseUrl, string SourceUrl,
    string ImagePath, bool HybridEligible, string? MatchReason = null,
    string? SpeciesSourceUrl = null, string PhotoStatus = "available", string PhotoReviewStatus = "not_reviewed",
    string[]? SearchKeywords = null, string ImageOrigin = "reference", string? ImageError = null);
public sealed record FaceFeature(string Feature, string Observation, string? Keyword = null, string? Visibility = null,
    int Salience = 0, string? ArtisticEmphasis = null, int? SignatureRank = null);
public sealed record PortraitPlan(FaceFeature[] Features, AnimalSuggestion[] Suggestions);
public sealed record AnimalSuggestion(string Name, string ScientificName, string Reason, string[]? SearchKeywords = null);
public sealed record MatchItem(int Rank, Animal Animal);
public sealed record MatchResult(string Id, bool IsDemo, string CatalogueVersion,
    string Notice, MatchItem[] Matches, FaceFeature[]? Features = null, string Experience = "comparison");
public sealed record MatchRequest(string ImageBase64, bool Consent, bool PortraitEditConsent = false);
public sealed record ApiError(string Code, string Message, string? DiagnosticCode = null);

public sealed class Catalogue
{
    public const string Version = "prototype-3-v1";
    public Animal[] Animals { get; }

    public Catalogue()
    {
        var file = Path.Combine(AppContext.BaseDirectory, "Data", "animals.json");
        Animals = JsonSerializer.Deserialize<Animal[]>(File.ReadAllText(file), new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("Animal catalogue is missing.");
        if (Animals.Length < 3 || Animals.Select(a => a.Id).Distinct().Count() != Animals.Length)
            throw new InvalidOperationException("The catalogue needs at least three distinct valid animals.");
    }

    public Animal[] ValidateRanking(IEnumerable<string> ids)
    {
        var selection = ids.ToArray();
        if (selection.Length != 3 || selection.Distinct().Count() != 3)
            throw new MatchException("invalid_provider_result", "The model did not return three distinct matches.");
        return selection.Select(id => Animals.FirstOrDefault(a => a.Id == id)
            ?? throw new MatchException("invalid_provider_result", "The model returned an animal outside the catalogue.")).ToArray();
    }
}

public sealed class MatchException(string code, string message, string? diagnosticCode = null) : Exception(message)
{
    public string Code { get; } = code;
    public string? DiagnosticCode { get; } = diagnosticCode;
}

public interface IAnimalMatcher
{
    bool IsDemo { get; }
    FaceFeature[] Features { get; }
    Task<Animal[]> MatchAsync(byte[] jpeg, CancellationToken cancellationToken);
}

public sealed class DemoMatcher(Catalogue catalogue) : IAnimalMatcher
{
    public bool IsDemo => true;
    public FaceFeature[] Features => [];
    public Task<Animal[]> MatchAsync(byte[] jpeg, CancellationToken cancellationToken)
    {
        // Deliberately fixed examples, never an image hash masquerading as face analysis.
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(catalogue.Animals.Take(3).ToArray());
    }
}
