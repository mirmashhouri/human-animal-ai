# Deployment and backend updates

Wildfie has a static Expo web frontend and an ASP.NET Core API. They deploy separately. The frontend needs the public API origin; the Meta credential belongs only on the backend.

## Vercel frontend

Import this Git repository and use its root directory. `vercel.json` defines:

| Setting | Value |
| --- | --- |
| Framework | Other |
| Install command | `npm ci` |
| Build command | `npm run web:build` |
| Output directory | `apps/mobile/dist` |
| Public environment variable | `EXPO_PUBLIC_API_URL=https://api.example.com` |

The API URL is public configuration. Add it to the intended Vercel environments and rebuild after changing it; Expo embeds `EXPO_PUBLIC_*` values in the browser bundle. Do not store provider credentials there. `.vercelignore` excludes the backend, private data, local configuration and artifacts from frontend uploads.

A local frontend build is `npm run web:build`. Its output is `apps/mobile/dist/`.

### A push did not update production

Compare the full Git commit SHA on GitHub with the SHA on Vercel's deployment details. The project overview shows the current production deployment, which may be older than the latest attempted build.

- If a deployment exists for the new SHA and is Error, read that deployment's build log.
- If it is Queued or Building, wait for that build rather than redeploying an older one.
- If no deployment exists for that SHA, check the connected Git repository, production branch, Git app repository access and any ignored-build rules. A missing deployment record is different from a failed build.
- To deploy the intended new revision manually, use **Deployments → Create Deployment** and select its branch or full SHA. Redeploying an older deployment rebuilds that older revision.

If repeated pushes produce no deployment, inspect/re-establish the Git integration after confirming repository access. Do not disconnect it just to troubleshoot a build error. See [Vercel Git integration](https://vercel.com/docs/git).

## HTTPS and CORS

Use an HTTPS API URL with a trusted certificate that covers its hostname. A certificate warning cannot be ignored by the frontend's browser requests. A domain certificate usually does not cover the server's raw IP address. A nonstandard HTTPS port can work if networking permits it and the frontend URL includes that port.

Set `AllowedHosts` to the API hostname and `Cors:Origins` to exact frontend origins, without a trailing slash. CORS is a browser access policy, not API authentication. Preview deployments need their own deliberately allowed origins if they call this API.

## IIS backend

Install the matching .NET 10 Hosting Bundle on the Windows server. Use a dedicated site/application pool, a valid HTTPS binding and private data folders outside `wwwroot`.

Publish locally:

```powershell
dotnet publish server/Kinform.Api -c Release --self-contained false -o artifacts/api
```

For a first deployment, copy the publish output into the IIS site's physical folder. The generated `web.config` configures ASP.NET Core hosting. Set the application pool to **No Managed Code**. Configure the Meta key and flags in protected host configuration, for example IIS ASP.NET Core environment variables:

```text
ASPNETCORE_ENVIRONMENT=Production
MODEL_API_KEY=YOUR_META_API_KEY
META_CREDIT_CONFIRMED=true
META_ENABLE_PAID_REQUESTS=true
```

The Development `.env` file is not loaded in Production. Keep real `web.config` and `appsettings.Production.json` files out of Git. A non-secret production configuration can contain:

```json
{
  "AllowedHosts": "api.example.com",
  "Prototype": { "AllowPublicAccess": true },
  "Cors": { "Origins": ["https://your-frontend.vercel.app"] },
  "Teaching": {
    "DataRoot": "C:\\ProgramData\\Wildfie\\private",
    "PreferenceWeight": 0.15
  },
  "Archive": { "Enabled": false }
}
```

Create the private data folder and grant only the dedicated application-pool identity the access it needs. Public access removes the loopback guard on the public studio; the teaching API retains its separate loopback/session checks. Do not expose private teaching through a public reverse proxy without a deliberate authentication design.

Test `/health` and `/api/wildlens/config` first; neither generates model output. Then test CORS from the frontend. Live generation is a separate, potentially billed check.

### Updating an existing backend

1. Publish again with the command above.
2. Back up the deployed application and its configuration.
3. Stop only this API's application pool.
4. Replace the published binaries/assets. Preserve the server's `web.config`, `appsettings.Production.json`, credentials, private teaching folder and archive folder.
5. Start the pool, check `/health` and `/api/wildlens/config`, then test the frontend connection.

Frontend-only changes deploy through Vercel. Backend changes require the IIS publish/copy cycle. Do not replace unrelated websites, certificates or bindings on a shared IIS server.

## Optional saved comparison cards

Card storage is off by default. To retain the final original/animal comparison PNG, merge this into your server configuration:

```json
{
  "Archive": {
    "Enabled": true,
    "Root": "C:\\ProgramData\\Wildfie\\cards",
    "MaxTotalBytes": 1073741824
  }
}
```

Run `scripts/Prepare-CardFolder.ps1 -AppPoolName YourApiPool` as administrator on the server to prepare its default folder and permissions. The script is also included in publish output. If you use another `Archive:Root`, create/grant access to that folder explicitly.

The browser sends the combined PNG after a successful creation. Files are saved under `yyyy-MM-dd/HHmmss-<id>.png` in UTC. The upload limit is 8 MiB per PNG; the default aggregate quota is 1 GiB. A short-lived signed permit prevents arbitrary uploads and makes retries idempotent. There is no public archive browsing route. A process restart invalidates outstanding permits but keeps saved files.

This retains both the original photo and generated artwork in one image. Set an appropriate retention/backup policy and tell visitors when enabling it. There is a size quota, not automatic age-based deletion. Archived cards do not become teaching examples. A storage failure does not undo a completed generation or prevent a browser download.

[ASP.NET Core on IIS documentation](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/)
