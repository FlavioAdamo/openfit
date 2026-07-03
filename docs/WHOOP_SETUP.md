# Complete Guide: Connect OpenFit to WHOOP

This guide documents the setup used to connect OpenFit to wearable data through the official WHOOP API. It was last updated on June 26, 2026.

## Before You Start

You need:

- an active WHOOP account with data already visible in the WHOOP app;
- access to the [WHOOP Developer Dashboard](https://developer.whoop.com/);
- OpenFit running with `npm run dev` or through the desktop app.

The data flow is:

```text
WHOOP strap -> WHOOP mobile app -> WHOOP API -> OpenFit
```

OpenFit does not pair the strap directly and does not replace synchronization between the strap, the WHOOP app, and the WHOOP cloud.

## 1. Create a WHOOP Developer App

1. Open the [WHOOP Developer Dashboard](https://developer.whoop.com/).
2. Sign in with the same WHOOP account you want to connect to OpenFit.
3. Create a new application for OpenFit personal use.
4. Store the generated **Client ID** and **Client Secret**.

Use one WHOOP developer app consistently. The Client ID, Client Secret, and callback URL must all belong to the same app entry.

## 2. Register the Redirect URI

In the WHOOP developer app, register this exact redirect URI:

```text
http://127.0.0.1:42813/oauth/callback
```

The value must match character by character, including protocol, IP address, port, and path.

## 3. Enable the Required Read Scopes

Grant these scopes for the application:

```text
offline
read:profile
read:body_measurement
read:cycles
read:recovery
read:sleep
read:workout
```

These are the same read scopes OpenFit requests in the OAuth flow. Do not add broader permissions unless you explicitly need them for another tool.

## 4. Why the Callback Is Local

`127.0.0.1` identifies only the computer where OpenFit is running. It is not a public website and cannot be reached from the internet.

During connection, OpenFit:

1. temporarily opens a local server on port `42813`;
2. opens the system browser for WHOOP consent;
3. receives the OAuth code at `/oauth/callback`;
4. verifies `state` and completes the code exchange;
5. closes the local server when the flow completes or after five minutes.

The callback registered in the WHOOP developer app must match the one shown in OpenFit exactly.

## 5. Connect OpenFit

1. Start OpenFit:

   ```bash
   npm run dev
   ```

2. Open **Settings**.
3. Select **WHOOP** as the provider.
4. Paste the **Client ID**.
5. Paste the **Client Secret**.
6. Verify that the Callback URL is:

   ```text
   http://127.0.0.1:42813/oauth/callback
   ```

7. Click **Save and connect**.
8. In the browser, approve the requested WHOOP access.
9. Return to OpenFit. The first sync starts automatically.

## 6. Final Verification

The configuration is working when:

- OpenFit shows `WHOOP` instead of `Demo mode`;
- a last synchronization time appears;
- Recovery, sleep, workouts, heart rate, or other WHOOP-backed metrics contain real data;
- credentials and cache files in the app data folder are encrypted with `safeStorage`.

Metric availability depends on what WHOOP has already synchronized for the account, the granted scopes, and the selected date range.

## Troubleshooting

### The Save and Connect Button Is Disabled

Check that:

- Client ID and Client Secret are both present;
- the callback is exactly `http://127.0.0.1:42813/oauth/callback`;
- the operating system secure store is available.

### `invalid_client`

- Copy the Client ID and Client Secret again from the same WHOOP developer app.
- Remove accidental leading or trailing spaces.
- Make sure the credentials are not from a different WHOOP app than the one where the callback was registered.

### The Callback Is Rejected or the App Never Returns to OpenFit

- Register exactly this redirect URI:

  ```text
  http://127.0.0.1:42813/oauth/callback
  ```

- Do not use `localhost`.
- Do not omit `/oauth/callback`.
- Do not add a trailing slash.

### Port 42813 Is Already in Use

Close other OpenFit windows or processes and try again. Only one OAuth flow can use the callback port at a time.

### The Browser Authorizes the App but OpenFit Does Not Receive the Callback

- keep OpenFit open during the whole consent flow;
- temporarily disable only local rules that block `127.0.0.1`;
- check that VPNs or proxies are not intercepting loopback addresses;
- try again without changing the callback.

### The App Connects but the Dashboard Still Looks Empty

1. Open the WHOOP app and confirm data is already present there.
2. Return to OpenFit and click **Sync**.
3. Check a recent day first, especially today or yesterday.
4. Verify that the requested scopes were granted in the WHOOP consent flow.

OpenFit maps WHOOP values into the existing dashboard fields when there is a clear equivalent, so some data may appear under names such as oxygen saturation, HRV, sleep, or activity instead of WHOOP-specific labels.

## Quick Checklist

- [ ] WHOOP developer app created
- [ ] Client ID and Client Secret copied from that app
- [ ] Local callback registered exactly
- [ ] Required WHOOP read scopes enabled
- [ ] WHOOP selected in OpenFit settings
- [ ] Client ID and Client Secret entered in OpenFit
- [ ] Consent completed in the browser
- [ ] First sync completed

## Official References

- [WHOOP Developer Dashboard](https://developer.whoop.com/)
- [WHOOP OAuth documentation](https://developer.whoop.com/docs/developing/oauth/)
- [WHOOP API reference](https://developer.whoop.com/api/)
