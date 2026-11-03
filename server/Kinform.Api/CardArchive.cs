using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text.Json;

namespace Kinform.Api;

public sealed record CardUpload(string Token, string ImageBase64, bool Consent);
public sealed record SavedCard(string Id, string FileName, DateTimeOffset SavedAt);
public sealed class ArchiveIssue(string code, string message, int status = 400) : Exception(message) {
    public string Code { get; } = code;
    public int Status { get; } = status;
}

// Only a completed public generation can issue one server-named card save.
// The client draws the exact same PNG used for its download. No public read route.
public sealed class CardArchive(IConfiguration config, IWebHostEnvironment environment) {
    public const int MaxImageBytes = 8 * 1024 * 1024;
    private readonly byte[] key = RandomNumberGenerator.GetBytes(32);
    private readonly SemaphoreSlim writes = new(1, 1);
    private sealed record Permit(string Id, DateTimeOffset CreatedAt, DateTimeOffset Expires);
    public bool Enabled => config.GetValue<bool>("Archive:Enabled");
    public string Root => Path.GetFullPath(config["Archive:Root"] is { Length: > 0 } root ?
        Path.Combine(environment.ContentRootPath, root) : Path.Combine(environment.ContentRootPath, "App_Data", "cards"));

    public string Issue() {
        if (!Enabled) throw new ArchiveIssue("archive_disabled", "Server saving is disabled.", 409);
        var now = DateTimeOffset.UtcNow;
        var data = JsonSerializer.SerializeToUtf8Bytes(new Permit(Guid.NewGuid().ToString("N"), now, now.AddMinutes(30)));
        return Convert.ToBase64String(data) + "." + Convert.ToBase64String(HMACSHA256.HashData(key, data));
    }
    private Permit Verify(string token) {
        try {
            if (string.IsNullOrEmpty(token) || token.Length > 1024) throw new FormatException();
            var parts = token.Split('.');
            if (parts.Length != 2) throw new FormatException();
            var data = Convert.FromBase64String(parts[0]);
            if (!CryptographicOperations.FixedTimeEquals(HMACSHA256.HashData(key, data), Convert.FromBase64String(parts[1]))) throw new FormatException();
            var permit = JsonSerializer.Deserialize<Permit>(data) ?? throw new FormatException();
            if (!Guid.TryParseExact(permit.Id, "N", out _) || permit.Expires < DateTimeOffset.UtcNow ||
                permit.CreatedAt > DateTimeOffset.UtcNow.AddMinutes(1)) throw new FormatException();
            return permit;
        } catch (Exception e) when (e is FormatException or JsonException or ArgumentException) {
            throw new ArchiveIssue("invalid_archive_token", "The server-save window expired or is invalid. You can still download this card.", 401);
        }
    }
    public async Task<SavedCard> SaveAsync(CardUpload input, CancellationToken token) {
        if (!Enabled) throw new ArchiveIssue("archive_disabled", "Server saving is disabled.", 409);
        if (!input.Consent) throw new ArchiveIssue("consent_required", "Confirm permission to save this comparison card.");
        var permit = Verify(input.Token);
        if (string.IsNullOrEmpty(input.ImageBase64) || input.ImageBase64.Length > (MaxImageBytes + 2) / 3 * 4)
            throw new ArchiveIssue("card_too_large", "The card is too large for server storage. You can still download it.", 413);
        byte[] bytes;
        try { bytes = Convert.FromBase64String(input.ImageBase64); }
        catch (FormatException) { throw new ArchiveIssue("invalid_card", "The comparison card is not a valid PNG."); }
        try {
            ValidatePng(bytes);
            var root = Root;
            var webRoot = Path.GetFullPath(environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot"));
            if (Inside(root, webRoot)) throw new ArchiveIssue("archive_unavailable", "The server storage folder must be private.", 503);
            var directory = Path.Combine(root, permit.CreatedAt.UtcDateTime.ToString("yyyy-MM-dd"));
            var name = permit.CreatedAt.UtcDateTime.ToString("HHmmss") + "-" + permit.Id + ".png";
            var path = Path.Combine(directory, name);
            await writes.WaitAsync(token);
            try {
                if (File.Exists(path)) {
                    var previous = await File.ReadAllBytesAsync(path, token);
                    try {
                        if (!previous.AsSpan().SequenceEqual(bytes)) throw new ArchiveIssue("card_already_saved", "A different card has already been saved for this creation.", 409);
                    } finally { Array.Clear(previous); }
                    return new(permit.Id, name, permit.CreatedAt);
                }
                // Bounded server storage; an owner can raise the limit explicitly.
                var limit = config.GetValue<long?>("Archive:MaxTotalBytes") ?? 1024L * 1024 * 1024;
                long used = 0;
                if (Directory.Exists(root)) foreach (var file in Directory.EnumerateFiles(root, "*.png", SearchOption.AllDirectories)) {
                    used += new FileInfo(file).Length;
                    if (used > limit - bytes.Length) break;
                }
                if (limit <= 0 || bytes.Length > limit || used > limit - bytes.Length)
                    throw new ArchiveIssue("archive_full", "Server storage is full. Your card is still available to download.", 507);
                Directory.CreateDirectory(directory);
                var temporary = Path.Combine(directory, "." + Guid.NewGuid().ToString("N") + ".tmp");
                try {
                    await File.WriteAllBytesAsync(temporary, bytes, token);
                    token.ThrowIfCancellationRequested();
                    File.Move(temporary, path);
                } finally { if (File.Exists(temporary)) File.Delete(temporary); }
                return new(permit.Id, name, permit.CreatedAt);
            } finally { writes.Release(); }
        } finally { Array.Clear(bytes); }
    }
    private static bool Inside(string path, string parent) => path.Equals(parent, StringComparison.OrdinalIgnoreCase) ||
        path.StartsWith(parent.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    private static void ValidatePng(byte[] bytes) {
        if (bytes.Length is < 57 or > MaxImageBytes || !bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) throw Invalid();
        var offset = 8; var first = true; var imageData = false;
        while (offset <= bytes.Length - 12) {
            var length = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
            if (length > bytes.Length - offset - 12) throw Invalid();
            var type = bytes.AsSpan(offset + 4, 4);
            if (first) {
                if (length != 13 || !type.SequenceEqual("IHDR"u8)) throw Invalid();
                var width = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + 8, 4));
                var height = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + 12, 4));
                if (width is < 64 or > 4096 || height is < 64 or > 16384 || (ulong)width * height > 30_000_000) throw Invalid();
                first = false;
            } else if (type.SequenceEqual("IHDR"u8)) throw Invalid();
            if (type.SequenceEqual("IDAT"u8)) imageData = true;
            offset += (int)length + 12;
            if (type.SequenceEqual("IEND"u8)) {
                if (length != 0 || !imageData || offset != bytes.Length) throw Invalid();
                return;
            }
        }
        throw Invalid();
        static ArchiveIssue Invalid() => new("invalid_card", "The comparison card is not a supported PNG.");
    }
}
