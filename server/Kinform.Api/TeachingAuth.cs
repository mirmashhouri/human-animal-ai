using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;

namespace Kinform.Api;

public sealed class TeachingAuth(TeachingStore store) {
    private const string CookieName = "wildlens_teaching";
    private readonly object gate = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> sessions = new();
    private string FilePath => Path.Combine(store.StudioRoot, "auth.json");
    private sealed record Credential(string Salt, string Hash, int Iterations);
    public bool Configured => File.Exists(FilePath);
    public bool Authenticated(HttpContext context) {
        var key = context.Request.Cookies[CookieName];
        if (key is null || !sessions.TryGetValue(key, out var expires)) return false;
        if (expires > DateTimeOffset.UtcNow) return true;
        sessions.TryRemove(key, out _); return false;
    }
    public void Setup(string password, HttpContext context) {
        lock (gate) {
            if (Configured) throw new TeachingIssue("already_configured", "The private password is already configured. Sign in instead.", 409);
            if (password is null || password.Length is < 10 or > 200 || password.Any(char.IsControl))
                throw new TeachingIssue("invalid_password", "Choose a private password with 10–200 characters.");
            var salt = RandomNumberGenerator.GetBytes(16);
            var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 210000, HashAlgorithmName.SHA256, 32);
            using var stream = new FileStream(FilePath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            JsonSerializer.Serialize(stream, new Credential(Convert.ToBase64String(salt), Convert.ToBase64String(hash), 210000), TeachingScoring.Json);
            SignIn(context);
        }
    }
    public void Login(string password, HttpContext context) {
        if (!Configured) throw new TeachingIssue("setup_needed", "Create your private password first.", 409);
        if (password is null || password.Length > 200) throw new TeachingIssue("invalid_login", "Password incorrect.", 401);
        var credential = JsonSerializer.Deserialize<Credential>(File.ReadAllText(FilePath), TeachingScoring.Json) ?? throw new IOException("Invalid private credentials.");
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(credential.Salt), credential.Iterations, HashAlgorithmName.SHA256, 32);
        if (!CryptographicOperations.FixedTimeEquals(hash, Convert.FromBase64String(credential.Hash)))
            throw new TeachingIssue("invalid_login", "Password incorrect.", 401);
        SignIn(context);
    }
    private void SignIn(HttpContext context) {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var expires = DateTimeOffset.UtcNow.AddHours(12); sessions[token] = expires;
        context.Response.Cookies.Append(CookieName, token, new CookieOptions {
            HttpOnly = true, SameSite = SameSiteMode.Strict, Secure = context.Request.IsHttps,
            Path = "/api/teaching", Expires = expires, IsEssential = true
        });
    }
    public void Logout(HttpContext context) {
        if (context.Request.Cookies[CookieName] is { } key) sessions.TryRemove(key, out _);
        context.Response.Cookies.Delete(CookieName, new CookieOptions { Path = "/api/teaching", SameSite = SameSiteMode.Strict });
    }
}
