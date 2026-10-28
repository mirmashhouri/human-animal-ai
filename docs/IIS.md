# IIS deployment notes — preparation only

No IIS settings, Windows firewall rules, DNS records or public infrastructure have been changed. The actual server location, OS version, capacity and existing sites have not been inspected.

## Local publish check

```powershell
dotnet publish server/Kinform.Api -c Release -o artifacts/api
```

The output includes the animal catalogue, bundled reference files and ASP.NET Core IIS configuration. It is an API, not the iOS/Android app binary. The browser build is separate; store users install the mobile app and communicate with the API over HTTPS.

## Before deploying to a real server

1. Confirm Windows Server support for the selected .NET 10 runtime, backups, updates, public connectivity and sufficient capacity. Do not disturb existing applications.
2. Complete production session authentication, quotas, persistent cost/idempotency records, upload decoding/sanitization and retention controls. This prototype is not approved for public use yet.
3. Install the matching .NET Hosting Bundle, create a dedicated IIS site/application pool and grant its identity only the necessary file permissions. Keep secrets and any future private uploads outside the public web directory.
4. Configure an actual API domain and HTTPS, exact `AllowedHosts`, and exact web preview origins if a browser front end is hosted. Native apps do not use CORS as an authentication mechanism.
5. Supply secret configuration via protected server configuration. Do not put keys into the app, repository or publicly served files. Keep paid AI disabled until a test budget is deliberately approved.
6. The prototype defaults to `Prototype:AllowPublicAccess=false`. Changing this removes a development guard; it does not provide production security. Only change it after the preceding controls and trusted proxy configuration are implemented.
7. Test restarts and IIS recycling, API/image availability, capacity, error handling, backups and rollback. Do not store future long-running hybrid work only in IIS process memory.

Reference: [Microsoft’s ASP.NET Core IIS deployment guide](https://learn.microsoft.com/en-us/aspnet/core/tutorials/publish-to-iis?view=aspnetcore-10.0).

SQL Server is not needed for the stateless prototype. Add an appropriately licensed SQL Server/Express database with EF Core when persistent catalogue management, sessions, scan jobs and ad-reward ledgers are implemented. A hosted AI provider performs model inference, so this architecture does not require a GPU on IIS.
