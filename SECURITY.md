# Source and data security

Provider keys belong only in backend host configuration or the ignored Development `.env`. Values prefixed `EXPO_PUBLIC_` are delivered to visitors' browsers. Example configuration files contain placeholders; replace them only in your local/deployed private configuration.

Keep private teaching photos, labels, password hashes, benchmark snapshots, generated artworks and archived comparison cards outside source control. Defaults use `evaluation/private/` and an opt-in backend archive folder outside `wwwroot`. `.gitignore` and `.vercelignore` reduce accidental inclusion; they do not remove files already committed to Git history.

Before publishing or sharing a fork, inspect tracked files and all relevant history. If a real credential was committed, revoke/replace it and remove it from history before publishing. Do not paste credentials, private portraits, authentication exports or production configuration into public issues. Report sensitive findings to the maintainer privately.

The default API is restricted to loopback, paid model requests are disabled until explicitly configured, and private teaching has separate loopback/session checks. CORS is not authentication. The prototype does not supply per-user spending quotas, a durable billing ledger or a hard dollar limit. Public hosting requires operational access controls, monitoring and a data-retention policy appropriate to that deployment.

Card storage is opt-in and retains the human original and generated artwork together. Enable it deliberately, disclose it to visitors and manage backups/deletion on the server. A size quota is not age-based retention. See [deployment](docs/IIS.md) and [teaching storage](docs/TEACHING.md).
