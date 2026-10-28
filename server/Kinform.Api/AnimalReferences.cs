using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace Kinform.Api;

public interface IAnimalReferenceResolver {
    Task<Animal> ResolveAsync(AnimalSuggestion suggestion, CancellationToken cancellationToken);
}

public sealed class ReferenceRequestGate {
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly SemaphoreSlim[] speciesWork = Enumerable.Range(0, 32).Select(_ => new SemaphoreSlim(1, 1)).ToArray();
    private DateTimeOffset next;
    // Bounded striped locks coalesce same-species requests without growing a lock dictionary.
    public SemaphoreSlim ForSpecies(string key) => speciesWork[(int)((uint)StringComparer.Ordinal.GetHashCode(key) % (uint)speciesWork.Length)];
    public async Task WaitAsync(CancellationToken token) {
        await gate.WaitAsync(token);
        try {
            var delay = next - DateTimeOffset.UtcNow;
            if (delay > TimeSpan.Zero) await Task.Delay(delay, token);
            next = DateTimeOffset.UtcNow.AddSeconds(1);
        } finally { gate.Release(); }
    }
}

// iNaturalist species names/IDs and individually licensed photos. Never receives a portrait.
public sealed class AnimalReferences(HttpClient client, IMemoryCache cache, ReferenceRequestGate gate,
    IAnimalPhotoReviewer? reviewer = null) : IAnimalReferenceResolver {
    private const string Root = "https://api.inaturalist.org/v1/";
    public async Task<Animal> ResolveAsync(AnimalSuggestion suggestion, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var key = "reference:" + (reviewer?.CacheKey ?? "metadata-only") + ":" + suggestion.ScientificName;
        if (cache.TryGetValue<Animal>(key, out var cached) && cached is not null)
            return cached with { MatchReason = suggestion.Reason };
        var work = gate.ForSpecies(key);
        await work.WaitAsync(cancellationToken);
        try {
            if (cache.TryGetValue<Animal>(key, out cached) && cached is not null)
                return cached with { MatchReason = suggestion.Reason };
            var animal = await ResolveUncachedAsync(suggestion with { Reason = "", SearchKeywords = null }, cancellationToken);
            animal = animal with { MatchReason = null, SearchKeywords = null };
            var minutes = animal.PhotoReviewStatus == "approved" ? 360 : animal.PhotoReviewStatus == "no_suitable" ? 15 : animal.PhotoStatus == "available" ? 60 : 2;
            cache.Set(key, animal, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(minutes) });
            return animal with { MatchReason = suggestion.Reason };
        } finally { work.Release(); }
    }

    private async Task<Animal> ResolveUncachedAsync(AnimalSuggestion suggestion, CancellationToken cancellationToken) {
        var searchUrl = "https://www.inaturalist.org/taxa/search?q=" + Uri.EscapeDataString(suggestion.ScientificName);
        var animal = new Animal("suggested-" + suggestion.ScientificName.ToLowerInvariant().Replace(' ', '-'),
            suggestion.Name, suggestion.ScientificName, "AI-suggested species", "Species could not be verified. Follow the source link to check it.",
            [], "Photo unavailable", searchUrl, searchUrl, "", false, null, searchUrl, "unverified_species");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(60));
        try {
            using var taxa = await GetAsync("taxa?q=" + Uri.EscapeDataString(suggestion.ScientificName) + "&rank=species&per_page=3", timeout.Token);
            var taxon = taxa.RootElement.GetProperty("results").EnumerateArray().FirstOrDefault(t =>
                Text(t, "name") == suggestion.ScientificName && Text(t, "rank") == "species" &&
                t.TryGetProperty("is_active", out var active) && active.ValueKind == JsonValueKind.True && HasAncestor(t, 1));
            if (taxon.ValueKind != JsonValueKind.Undefined && taxon.TryGetProperty("id", out var idValue) && idValue.TryGetInt64(out var id) && id > 0) {
                var speciesUrl = $"https://www.inaturalist.org/taxa/{id}";
                animal = animal with { Id = "inat-" + id, Name = Text(taxon, "preferred_common_name") ?? suggestion.Name,
                    Family = Text(taxon, "iconic_taxon_name") ?? "Animalia", SpeciesSourceUrl = speciesUrl, SourceUrl = speciesUrl,
                    LicenseUrl = speciesUrl, PhotoStatus = "unavailable", Description = "Verified iNaturalist species. A reusable photo is not currently available." };
                var candidates = new List<Animal>();
                if (taxon.TryGetProperty("default_photo", out var photo) && WithPhoto(animal, photo) is { } defaultPhoto) candidates.Add(defaultPhoto);
                if (candidates.Count == 0 || reviewer?.Enabled == true) {
                    try {
                    // Observation records can be large; keep this below the 2 MB response cap.
                    using var observations = await GetAsync($"observations?taxon_id={id}&quality_grade=research&photos=true&photo_license=cc0,cc-by,cc-by-sa&per_page=3&order_by=votes", timeout.Token);
                    foreach (var observation in observations.RootElement.GetProperty("results").EnumerateArray().Take(3)) {
                        if (!observation.TryGetProperty("taxon", out var observedTaxon) || !HasAncestor(observedTaxon, id)) continue;
                        if (!observation.TryGetProperty("photos", out var photos)) continue;
                        // Limit each observation so one photographer's burst does not fill the batch.
                        foreach (var candidate in photos.EnumerateArray().Take(8).Select(p => WithPhoto(animal, p)).OfType<Animal>().Take(2)) {
                            if (candidates.All(x => x.ImagePath != candidate.ImagePath)) candidates.Add(candidate);
                            if (candidates.Count == AnimalPhotoReviewer.MaxCandidates) break;
                        }
                        if (candidates.Count == AnimalPhotoReviewer.MaxCandidates) break;
                    }
                    } catch (OperationCanceledException) when (!timeout.IsCancellationRequested) { }
                    catch (Exception e) when (e is HttpRequestException or JsonException or KeyNotFoundException or InvalidOperationException) { }
                }
                if (candidates.Count > 0 && reviewer?.Enabled == true) {
                    animal = animal with { PhotoReviewStatus = "unavailable", Description = "Animal-photo review could not finish. No unreviewed image is displayed; your species suggestion is preserved." };
                    var review = await reviewer.ReviewAsync(suggestion.ScientificName, candidates.Select(x => x.ImagePath).ToArray(), timeout.Token);
                    if (review.Status == "approved" && review.SelectedIndex >= 0 && review.SelectedIndex < candidates.Count)
                        animal = candidates[review.SelectedIndex] with { PhotoReviewStatus = "approved", Description = "AI-selected for a visible, clear animal face. Photo review can make mistakes. This is an illustrative species reference, not a measured human–animal comparison." };
                    else if (review.Status == "no_suitable")
                        animal = animal with { PhotoReviewStatus = "no_suitable", Description = "No suitable animal portrait was found in this batch. The reviewed photos did not pass the visible-face checks." };
                } else if (candidates.Count > 0) {
                    animal = candidates[0] with { PhotoReviewStatus = "disabled", Description = "Illustrative species photo. Automatic visible-face review is disabled; this photo has not been checked for portrait suitability." };
                }
            }
        } catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) {
            // Preserve the paid AI result when a free photo lookup times out.
        } catch (Exception exception) when (exception is HttpRequestException or JsonException or KeyNotFoundException or InvalidOperationException) {
            // Missing photos are explicit; do not substitute an unrelated animal.
        }
        return animal with { MatchReason = suggestion.Reason };
    }

    private async Task<JsonDocument> GetAsync(string relative, CancellationToken token) {
        await gate.WaitAsync(token);
        using var response = await client.GetAsync(Root + relative, token);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
    }
    private static string? Text(JsonElement item, string name) => item.ValueKind == JsonValueKind.Object &&
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static bool HasAncestor(JsonElement item, long id) => item.ValueKind == JsonValueKind.Object &&
        ((item.TryGetProperty("id", out var self) && self.TryGetInt64(out var selfId) && selfId == id) ||
        (item.TryGetProperty("ancestor_ids", out var ancestors) && ancestors.ValueKind == JsonValueKind.Array &&
        ancestors.EnumerateArray().Any(x => x.TryGetInt64(out var ancestor) && ancestor == id)));

    public static Animal? WithPhoto(Animal animal, JsonElement photo) {
        if (photo.ValueKind != JsonValueKind.Object || Text(photo, "license_code") is not ("cc0" or "cc-by" or "cc-by-sa")) return null;
        if (photo.TryGetProperty("hidden", out var hidden) && hidden.ValueKind == JsonValueKind.True) return null;
        if (photo.TryGetProperty("flags", out var flags) && flags.ValueKind == JsonValueKind.Array && flags.GetArrayLength() != 0) return null;
        if (!photo.TryGetProperty("id", out var idValue) || !idValue.TryGetInt64(out var id) || id <= 0) return null;
        var attribution = Text(photo, "attribution");
        if (string.IsNullOrWhiteSpace(attribution) || attribution.Length > 500) return null;
        if (!Uri.TryCreate(Text(photo, "medium_url") ?? Text(photo, "url"), UriKind.Absolute, out var uri) ||
            uri.Scheme != "https" || uri.Host != "inaturalist-open-data.s3.amazonaws.com" || !uri.IsDefaultPort ||
            uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0 ||
            !Regex.IsMatch(uri.AbsolutePath, $@"^/photos/{id}/(square|small|medium|large)\.(jpg|jpeg|png)$")) return null;
        var image = Regex.Replace(uri.AbsoluteUri, @"/(square|small|large)\.", "/medium.");
        var source = $"https://www.inaturalist.org/photos/{id}";
        return animal with { ImagePath = image, PhotoCredit = attribution + " · iNaturalist", SourceUrl = source, LicenseUrl = source,
            PhotoStatus = "available", Description = "Illustrative species photograph from iNaturalist, retrieved after the AI suggestion. The AI did not compare this exact photo." };
    }
}
