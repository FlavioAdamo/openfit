# Data Coverage

## Google Health API v4

| Domain | Data read | View |
|---|---|---|
| Account | identity, profile, timezone, join date | header / settings |
| Device | model, type, battery, last sync, hardware features | Devices |
| Activity | steps, distance, floors, calories, active minutes, sedentary minutes, Active Zone Minutes | Today / Activity |
| Intraday | detailed steps and heart rate | Today / Activity / Health |
| Workouts | type, duration, distance, calories, average HR, zones | Activity |
| Heart | heart rate, resting HR, HRV, zones, ECG where supported | Health |
| Breathing | nightly respiratory rate | Health |
| Oxygen | daily SpO2 and supported samples | Health |
| Temperature | nightly skin variation and body temperature | Health |
| Irregular rhythm | IRN profile and notifications | Health / export |
| Metabolic | logged blood glucose | Health / export |
| Cardio fitness | daily and running VO2 max | Health |
| Sleep | sessions, stages, summary, efficiency | Sleep |
| Body | weight and body fat percentage | Body |
| Nutrition | logged calories and hydration | Body |

The Google sync performs independent reads and keeps useful payloads in the exported JSON even when they are not yet rendered in a dedicated view. The interface only shows metrics that are actually present and automatically adapts the navigation.

## Fitbit Air

Depending on regional and account availability, Fitbit Air supports 24/7 heart rate, steps, calories, distance, Active Zone Minutes, sleep and sleep stages, SpO2, HRV, respiratory rate, skin temperature, resting HR, and irregular rhythm notifications. It does not produce an on-demand ECG. The related section is hidden when the data is unavailable.

## Long-term history

The Data page can load daily summaries for the last 30, 90, or 365 days from Google Health. Each run reads the whole range again in 30-day chunks, newest first, and merges it into the encrypted archive. Newer values replace stored ones, and missing values never erase them.

- Only daily values are stored: steps, calories, distance, floors, active and zone minutes, sedentary time, resting heart rate, HRV, breathing rate, SpO2, skin and body temperature, cardio fitness, sleep duration and efficiency, weight, body fat, water, and calories logged.
- Hourly steps, heart rate samples, sleep stages, workouts, ECG, and irregular rhythm records are not part of the history. They load for a day when you open it.
- Sleep score is not exposed by Google Health and stays empty.
- The legacy Fitbit adapter does not provide history.

## Hard Limits

- Data appears only after synchronization with the mobile app. There is no public BLE stream for desktop apps.
- Readiness Score, Cardio Load, Sleep Score, Stress Score, and proprietary coaching are not all exposed as Google or Fitbit values. OpenFit shows base measurements and local insights. It does not pretend to reproduce unavailable proprietary scores.
- GPS location is requested only to enrich compatible workouts. It is not rendered on a map yet.
- Availability and granularity depend on model, region, firmware, plan, and OAuth consent.

Sources: [third-party access and availability](https://developers.google.com/health/data-types), [endpoints](https://developers.google.com/health/endpoints), [paired devices](https://developers.google.com/health/reference/rest/v4/users.pairedDevices).
