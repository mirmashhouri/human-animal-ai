namespace Kinform.Api;

public static class AiConfiguration
{
    public static bool IsReady(IConfiguration config) =>
        config.GetValue<bool>("Ai:EnablePaidRequests") &&
        !string.IsNullOrWhiteSpace(config["Ai:Model"]) &&
        !string.IsNullOrWhiteSpace(config["Ai:ApiKey"]) &&
        !config["Ai:ApiKey"]!.Contains("REPLACE-WITH", StringComparison.OrdinalIgnoreCase);
}
