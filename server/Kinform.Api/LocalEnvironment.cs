using System.Text;

namespace Kinform.Api;

// A deliberately small, literal .env format: one NAME=value per line, optional quotes/comments.
// No interpolation, shell evaluation, multiline values or mutation of the parent process environment.
public static class LocalEnvironment
{
    private static readonly Dictionary<string, string> Names = new(StringComparer.Ordinal) {
        ["OPENAI_API_KEY"] = "Ai:ApiKey", ["OPENAI_MODEL"] = "Ai:Model",
        ["AI_MODE"] = "Ai:Mode", ["AI_ENABLE_PAID_REQUESTS"] = "Ai:EnablePaidRequests",
        ["AI_PHOTO_REVIEW_ENABLED"] = "Ai:PhotoReviewEnabled", ["AI_PHOTO_REVIEW_MODEL"] = "Ai:PhotoReviewModel",
        ["AI_ANIMAL_IMAGE_SOURCE"] = "Ai:AnimalImageSource", ["OPENAI_IMAGE_MODEL"] = "Ai:ImageModel",
        ["AI_IMAGE_QUALITY"] = "Ai:ImageQuality",
        ["MODEL_API_KEY"] = "WildLens:ApiKey", ["META_API_KEY"] = "WildLens:ApiKey",
        ["META_VISION_MODEL"] = "WildLens:VisionModel", ["META_IMAGE_MODEL"] = "WildLens:ImageModel",
        ["META_SEGMENTATION_MODEL"] = "WildLens:SegmentationModel",
        ["META_ENABLE_PAID_REQUESTS"] = "WildLens:EnablePaidRequests", ["META_CREDIT_CONFIRMED"] = "WildLens:CreditConfirmed"
    };

    public static Dictionary<string, string?> Parse(string contents)
    {
        if (contents.Length > 65536) throw new FormatException("The backend .env file is too large.");
        var settings = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var number = 0;
        foreach (var raw in contents.Split('\n')) {
            number++;
            var line = raw.Trim().TrimStart('\uFEFF');
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith("export ", StringComparison.Ordinal)) line = line[7..].TrimStart();
            var equals = line.IndexOf('=');
            if (equals <= 0 || !Names.TryGetValue(line[..equals].Trim(), out var target)) throw Invalid(number);
            var value = line[(equals + 1)..].Trim();
            if (value.StartsWith('"') || value.StartsWith('\'')) {
                var closing = value.IndexOf(value[0], 1);
                if (closing < 0) throw Invalid(number);
                var tail = value[(closing + 1)..].Trim();
                if (tail.Length > 0 && !tail.StartsWith('#')) throw Invalid(number);
                value = value[1..closing];
            } else {
                var comment = Enumerable.Range(1, Math.Max(0, value.Length - 1))
                    .FirstOrDefault(index => value[index] == '#' && char.IsWhiteSpace(value[index - 1]), -1);
                if (comment >= 0) value = value[..comment].TrimEnd();
            }
            if (value.Any(char.IsControl) || !settings.TryAdd(target, value)) throw Invalid(number);
        }
        return settings;
    }

    public static void Configure(ConfigurationManager config, string contentRoot, bool isDevelopment, string[] args)
    {
        var file = Path.Combine(contentRoot, ".env");
        if (isDevelopment && File.Exists(file)) config.AddInMemoryCollection(Parse(File.ReadAllText(file)));
        var aliases = Names.Select(pair => new KeyValuePair<string, string?>(pair.Value, Environment.GetEnvironmentVariable(pair.Key)))
            .Where(pair => pair.Value is not null);
        config.AddInMemoryCollection(aliases);
        // Explicit host settings and CLI overrides take precedence over the development file.
        config.AddEnvironmentVariables();
        config.AddCommandLine(args);
    }

    public static bool Initialize(string file, IConfiguration previous)
    {
        if (File.Exists(file)) return false;
        var settings = new Dictionary<string, string> {
            ["OPENAI_API_KEY"] = previous["Ai:ApiKey"] ?? "sk-REPLACE-WITH-YOUR-OPENAI-API-KEY",
            ["OPENAI_MODEL"] = previous["Ai:Model"] ?? "gpt-5.4-mini",
            ["AI_MODE"] = previous["Ai:Mode"] ?? "OpenAI",
            ["AI_ENABLE_PAID_REQUESTS"] = previous.GetValue<bool>("Ai:EnablePaidRequests") ? "true" : "false"
        };
        if (settings.Values.Any(value => value.Any(char.IsControl) || value.Contains('"')))
            throw new FormatException("Existing settings cannot be migrated automatically. Use the backend .env.example template.");
        var contents = "# Backend-only local settings. Do not commit or share this file.\n" +
            string.Join("\n", settings.Select(pair => $"{pair.Key}=\"{pair.Value}\"")) + "\n";
        using var stream = new FileStream(file, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        using var writer = new StreamWriter(stream, new UTF8Encoding(false));
        writer.Write(contents);
        return true;
    }

    // Do not include invalid line contents: they may contain credentials.
    private static FormatException Invalid(int line) => new($"Invalid backend .env setting on line {line}. Use .env.example for the supported names and format.");
}
