<p align="center">
  <img src="public/app-icon.png" alt="OpenFit app icon" width="96">
</p>

<h1 align="center">OpenFit</h1>

OpenFit is a private, desktop-first Electron dashboard for Google Fitbit Air and other Fitbit devices. Its adaptive interface prioritizes a small set of useful insights and only displays views, metrics, and navigation when Google Health returns real data.

<p align="center">
  <img src="public/openfit-screenshot.webp" alt="OpenFit desktop dashboard screenshot" width="960">
</p>

The renderer uses React, shadcn/Radix, Tailwind CSS v4, assistant-ui, Inter Variable, JetBrains Mono, and Nucleo Essential Outline icons.

> Project status: the application is complete and buildable. Demo mode works without configuration. Accessing personal data requires an OAuth client in your own Google Cloud project.

## How Fitbit data reaches OpenFit

Fitbit Air does **not provide a public Bluetooth synchronization interface** for third-party applications. The supported data path is:

```text
Fitbit Air -> Bluetooth -> Fitbit/Google Health mobile app
                                  |
                                  v cloud sync
                         Google Health API -> OpenFit
```

OpenFit uses **Google Health API v4** as its default provider. The legacy Fitbit Web API remains available only as a transitional adapter and is scheduled for deprecation in September 2026.

The desktop application can replace the browsing and analysis experience, but it cannot perform initial device pairing, firmware updates, or phone-to-device synchronization.

## Quick start

Requirements:

- Node.js 22 or later;
- npm 10 or later;
- Codex Desktop and a signed-in Codex account, only if you want to use the health assistant. OpenFit reuses the local login and does not require an API key.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build       # Type-check and bundle the renderer
npm test            # Run normalizer and adapter tests
npm run capture:ui  # Run desktop/mobile visual QA in Electron Chromium
npm run dist        # Package the app for macOS, Windows, or Linux
```

Packages generated locally in `release/` are unsigned unless an Apple Developer ID certificate is available in the Keychain. For public distribution, follow the [release checklist](docs/RELEASE.md).

## Connect Google Health

### Before you begin

You need:

- the Google account used by the Fitbit mobile app;
- access to [Google Cloud Console](https://console.cloud.google.com/);
- Fitbit Air or another supported tracker already paired and synchronized with the Fitbit app;
- OpenFit running with `npm run dev` or as an installed desktop application.

API configuration, OAuth consent, and OAuth credentials must all belong to the same Google Cloud project.

### 1. Create a Google Cloud project

1. Open [Create a Google Cloud project](https://console.cloud.google.com/projectcreate).
2. Name the project `OpenFit`.
3. For a personal account, leave **Organization** set to **No organization**.
4. Create the project and select it from the project picker.

### 2. Enable Google Health API

1. With the OpenFit project selected, open [Google Health API](https://console.cloud.google.com/apis/library/health.googleapis.com).
2. Click **Enable**.
3. Wait until the page shows that the API is enabled or displays **Manage**.

### 3. Configure the OAuth consent screen

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) and click **Get started**.
2. Set the application name to `OpenFit` and enter a support email.
3. Select **External** as the audience. **Internal** only supports accounts in the same Google Workspace organization.
4. Enter a contact email and complete the setup.
5. Open [Audience](https://console.cloud.google.com/auth/audience), add the Google account used by Fitbit as a test user, and save it.

While the application remains in OAuth testing mode, only explicitly listed test users can authorize it. Google normally expires refresh tokens for external applications in testing after seven days; reconnect the account when needed or complete Google's production requirements.

### 4. Add read-only scopes

Open [Google Auth Platform scopes](https://console.cloud.google.com/auth/scopes), choose **Add or remove scopes**, and add these read-only Google Health scopes:

```text
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.ecg.readonly
https://www.googleapis.com/auth/googlehealth.irn.readonly
https://www.googleapis.com/auth/googlehealth.location.readonly
https://www.googleapis.com/auth/googlehealth.nutrition.readonly
https://www.googleapis.com/auth/googlehealth.profile.readonly
https://www.googleapis.com/auth/googlehealth.settings.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
```

Do not add write scopes. OpenFit also requests the standard `openid` and `profile` scopes to display the account name and avatar.

### 5. Create the OAuth client

1. Open [Google Auth Platform clients](https://console.cloud.google.com/auth/clients).
2. Create an OAuth client of type **Web application**.
3. Name it `OpenFit Desktop`.
4. Leave **Authorized JavaScript origins** empty.
5. Add this exact **Authorized redirect URI**:

   ```text
   http://127.0.0.1:42813/oauth/callback
   ```

6. Create the client and retain its Client ID and Client Secret.

Do not commit or share these credentials. During authorization, OpenFit starts a temporary loopback server on port `42813`, validates OAuth `state` and PKCE, receives the authorization code, and then closes the server.

### 6. Connect OpenFit

1. Start OpenFit.
2. Click **Connect Fitbit** and select **Google Health**.
3. Paste the Client ID and Client Secret.
4. Confirm that the callback URL is `http://127.0.0.1:42813/oauth/callback`.
5. Click **Save and connect**.
6. In the system browser, select the same Google account that you added as a test user and approve the requested access.
7. Return to OpenFit. The first synchronization starts automatically.

The connection is working when OpenFit shows **Google Health** instead of **Demo mode**, displays a last synchronization time, and begins showing real device and health metrics. Metric availability depends on the device, region, granted consent, and recent Fitbit mobile synchronization.

### Long-term history

Each sync loads one day together with its 14-day trends. For longer trends, open **Data** and choose **Last 30 days**, **Last 90 days**, or **Last year**. OpenFit reads daily summaries from Google Health in 30-day chunks, newest first, and stores them in the encrypted archive. The trend sections on Activity, Health, Sleep, and Body then offer 14-day, 30-day, 90-day, and 1-year windows. Column charts switch to weekly averages above 60 days.

History holds daily summaries only. Hourly steps, heart rate samples, and sleep stages still load when you open a day. A full year takes about 250 requests and about a minute at the provider's rate limit. You can stop a run and keep what was fetched so far. The legacy Fitbit adapter does not provide history.

### Security note

The Client Secret, OAuth tokens, and health cache stay in Electron's main process and are encrypted with `safeStorage` using Keychain on macOS, Credential Manager on Windows, or an available secret store on Linux. They are not exposed to the renderer or written to the repository.

A Client Secret distributed in a desktop binary is not a durable global secret. The current setup is appropriate for personal use and development. A public release should move the OAuth code exchange to a small backend and complete Google's verification and security-review requirements.

### Troubleshooting

`redirect_uri_mismatch`

- Register `http://127.0.0.1:42813/oauth/callback` exactly. Do not use `localhost`, omit the path, or add a trailing slash.

`Access blocked`, `access_denied`, or unauthorized user

- Confirm that the OAuth audience is **External**.
- Add the correct account under **Audience -> Test users**.
- Sign in with the same account used by the Fitbit app.

`invalid_client`

- Copy the Client ID and Client Secret again from the same OAuth client.
- Remove accidental leading or trailing spaces.
- Do not mix credentials from different Cloud projects.

HTTP 403 or API not enabled

- Confirm that Google Health API is enabled in the same project as the OAuth client.

Port `42813` is already in use

- Close other OpenFit processes and retry. Only one OAuth flow can use the callback port at a time.

Some metrics are missing

- Open the Fitbit app on the phone and wait for the tracker to synchronize.
- Return to OpenFit and click **Sync**.
- ECG, SpO2, skin temperature, HRV, and irregular-rhythm notifications may not be available for every device, account, or country. OpenFit hides sections for which no data exists.

For a longer checklist, see [Google Health setup](docs/GOOGLE_HEALTH_SETUP.md).

## Project structure

```text
electron/
  main.cjs                    Electron shell, OAuth loopback, IPC, encrypted storage
  preload.cjs                 Minimal typed IPC bridge
  codex-service.cjs           Read-only Codex app-server JSONL client
  google-health-service.cjs   Google Health API v4 provider
  fitbit-legacy-service.cjs   Legacy Fitbit Web API provider with PKCE
src/
  components/                 Views, charts, and assistant-ui chat
  data/                       Demo data and provider-independent normalization
  lib/                        Formatting and pure utilities
  App.tsx                     UI and connection-state orchestration
  types.ts                    Shared renderer/preload contracts
scripts/
  capture-ui.cjs              Electron visual smoke test
docs/
  ARCHITECTURE.md             System decisions and boundaries
  DATA_COVERAGE.md            Data coverage and limitations
  GOOGLE_HEALTH_SETUP.md      Extended OAuth setup guide
  RELEASE.md                  Signing, notarization, and release process
```

See [Architecture](docs/ARCHITECTURE.md) for security boundaries and design decisions.

## Interface principles

- one primary metric per screen, with secondary details ordered by importance;
- no empty cards: unavailable sections remain hidden;
- one accent color for status, progress, and actions;
- aggregated intraday samples for responsive charts without changing minimum, maximum, or latest values;
- accessible shadcn/Radix components and responsive layouts without horizontal overflow.

## Health assistant

The chat button in the top bar opens a right-side panel built with assistant-ui primitives. Its bridge uses `codex app-server`, the same local interface used by Codex clients, with a read-only sandbox, approvals disabled, and tool calls denied by default.

When you send a message, OpenFit creates a compact context containing normalized metrics, available dates, and details for the selected day. It does not include OAuth credentials or encrypted files. This context is sent to Codex/OpenAI only after you use the chat. Codex may navigate to an OpenFit view or date, but it cannot modify health data.

No Codex model name is hard-coded in this repository. The app-server selects its configured default model unless a model is supplied programmatically through the service options.

## Official references

- [Google Health API: Cloud and OAuth setup](https://developers.google.com/health/setup)
- [Google Health API: scopes](https://developers.google.com/health/scopes)
- [Google Health API: migration from Fitbit Web API](https://developers.google.com/health/migration)
- [Google Health API: data types](https://developers.google.com/health/data-types)
- [Google Health API: endpoints](https://developers.google.com/health/endpoints)
- [Google OAuth for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth for installed applications](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Fitbit OAuth 2.0 with PKCE](https://dev.fitbit.com/build/reference/web-api/developer-guide/authorization/)

Icons: Nucleo Essential Outline (c) Nucleo, used under the [Nucleo license](https://nucleoapp.com/license/).

The information displayed by OpenFit is not a diagnosis or medical advice.
