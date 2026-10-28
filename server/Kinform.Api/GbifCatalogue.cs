using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Kinform.Api;

public sealed record SpeciesRecord(long Key, string Name, string ScientificName, string Family,
    string DatasetKey, string SourceUrl, string DatasetUrl);
public sealed record SpeciesSearch(string Query, string Field, long TotalRecords, int Offset,
    int? NextOffset, string Source, string SourceUrl, string Notice, SpeciesRecord[] Results);

// Taxonomy discovery only. Never sends portraits or silently promotes unreviewed photos into matching.
// https://techdocs.gbif.org/en/openapi/v1/species
public sealed class GbifCatalogue(HttpClient client, IMemoryCache cache)
{
    public const string SourceUrl = "https://www.gbif.org/";
    private const int PageSize = 12;
    private const int MaxOffset = 240;

    public async Task<SpeciesSearch> SearchAsync(string? query, string? field, int offset, CancellationToken token)
    {
        query = query?.Trim();
        field ??= "common";
        if (string.IsNullOrWhiteSpace(query) || query.Length is < 2 or > 80 || query.Any(char.IsControl) ||
            field is not ("common" or "scientific") || offset < 0 || offset > MaxOffset || offset % PageSize != 0)
            throw new MatchException("invalid_search", "Enter an animal name of 2–80 characters and a valid search page.");

        var cacheKey = $"gbif:{field}:{offset}:{query.ToLowerInvariant()}";
        if (cache.TryGetValue<SpeciesSearch>(cacheKey, out var cached) && cached is not null) return cached;
        var qField = field == "common" ? "VERNACULAR" : "SCIENTIFIC";
        // Fixed upstream origin: user input is never treated as a URL. No arbitrary photo proxy.
        using var response = await client.GetAsync("https://api.gbif.org/v1/species/search?highertaxonKey=1&rank=SPECIES&status=ACCEPTED" +
            $"&qField={qField}&q={Uri.EscapeDataString(query)}&limit={PageSize}&offset={offset}", token);
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
            throw new MatchException("catalogue_busy", "GBIF is busy. Wait a minute before searching again.");
        if (!response.IsSuccessStatusCode)
            throw new MatchException("catalogue_unavailable", "GBIF search is unavailable. The three local references still work.");
        SpeciesSearch result;
        try
        {
            using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
            var root = payload.RootElement;
            var records = new List<SpeciesRecord>();
            foreach (var item in root.GetProperty("results").EnumerateArray().Take(PageSize))
            {
                if (GetText(item, "kingdom") != "Animalia" || GetText(item, "rank") != "SPECIES" ||
                    GetText(item, "taxonomicStatus") != "ACCEPTED") continue;
                if (!item.TryGetProperty("key", out var keyValue) || !keyValue.TryGetInt64(out var key) || key <= 0) continue;
                if (!Guid.TryParse(GetText(item, "datasetKey"), out var datasetKey)) continue;
                var scientific = GetText(item, "canonicalName") ?? GetText(item, "scientificName");
                if (string.IsNullOrWhiteSpace(scientific)) continue;
                string? common = null;
                if (item.TryGetProperty("vernacularNames", out var names) && names.ValueKind == JsonValueKind.Array)
                    common = names.EnumerateArray().Where(name => GetText(name, "language") is "eng" or "en")
                        .Select(name => GetText(name, "vernacularName")).FirstOrDefault(name => !string.IsNullOrWhiteSpace(name));
                records.Add(new SpeciesRecord(key, common ?? scientific, scientific, GetText(item, "family") ?? "Family not supplied",
                    datasetKey.ToString(), $"https://www.gbif.org/species/{key}", $"https://www.gbif.org/dataset/{datasetKey}"));
            }
            var total = root.GetProperty("count").GetInt64();
            var end = root.GetProperty("endOfRecords").GetBoolean();
            int? next = !end && offset < MaxOffset && offset + PageSize < total ? offset + PageSize : null;
            result = new SpeciesSearch(query, field, total, offset, next, "GBIF — Global Biodiversity Information Facility", SourceUrl,
                "Species records, not face matches. Records can overlap across checklists. Photographs and domestic breeds need separate coverage and rights review.",
                records.DistinctBy(record => record.Key).ToArray());
        }
        catch (Exception exception) when (exception is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            throw new MatchException("catalogue_invalid_response", "GBIF returned an unreadable response. Please try again later.");
        }
        cache.Set(cacheKey, result, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10), Size = 1 });
        return result;
    }

    private static string? GetText(JsonElement item, string property) =>
        item.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
