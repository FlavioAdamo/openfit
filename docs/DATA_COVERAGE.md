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
- Sleep score is not exposed by Google Health. Only a Takeout import fills it.
- The legacy Fitbit adapter does not download history. A Takeout import works with either provider, and without a connected account.

### Google Takeout import

**Import Takeout folder** on the Data page reads an extracted Google Takeout export and merges its daily summaries into the same archive, with the same rule: imported numbers replace stored ones for the same day, and fields the export lacks keep their stored values. It uses no API quota. Choose the extracted `Takeout` folder, or the `Fitbit` or `Google Health` folder inside it. Zip files are not read.

Exports come in two layouts, and one export can contain both:

| Layout | Files read | Values |
| --- | --- | --- |
| Fitbit (`Takeout/Fitbit/`) | `Global Export Data/` JSON: `steps-*`, `calories-*`, `distance-*`, `altitude-*`, `moderately_active_minutes-*`, `very_active_minutes-*`, `sedentary_minutes-*`, `resting_heart_rate-*`, `sleep-*`, `weight-*`, `food_logs-*`, `water_logs-*` | Steps, calories, distance, floors, active and sedentary minutes, resting heart rate, sleep duration and efficiency, weight, body fat, calories logged, water |
| Fitbit, per-type CSV | `sleep_score.csv`, `Daily Heart Rate Variability Summary - *.csv`, `Daily SpO2 - *.csv`, `Daily Respiratory Rate Summary - *.csv`, `Computed Temperature - *.csv` | Sleep score, HRV, SpO2, breathing rate, skin temperature |
| Google Health (`*_GoogleData/`) | `steps_*`, `distance_*`, `active_minutes_*`, `active_zone_minutes_*`, `daily_resting_heart_rate`, `daily_heart_rate_variability`, `daily_oxygen_saturation`, `daily_respiratory_rate`, `daily_sleep_temperature_derivations`, `weight_*`, `body_fat_*`, `UserSleeps_*`, `UserSleepScores_*` | Steps, distance, active and zone minutes, resting heart rate, HRV, SpO2, breathing rate, skin temperature, weight, body fat, sleep duration, efficiency, and score |

How the import reads them:

- Per-minute samples and weigh-ins are timestamped in UTC and are assigned to days in the computer's time zone. Daily values such as resting heart rate are labelled with their day and keep it.
- When both layouts hold the same value for the same day, the Google Health CSV wins.
- When two devices report the same additive value, such as steps from a phone and a tracker, the day keeps the larger total instead of adding them.
- Google Health exports list each night once per sleep algorithm. Only the newest algorithm's sessions count.
- Exports pad monthly files with placeholder days. A day is kept only when it has a value beyond resting calories and a full day of sedentary time, and days after today are dropped.
- Intraday heart rate, workouts, sleep stages, readiness, stress, and the raw sensor folders are not read. They count as skipped files, along with files that fail to parse.
- Total calories come only from the Fitbit layout's `calories-*` files. The Google Health `calories_*` CSV omits minutes, so its daily sums run low and it is not used.

Assumptions not yet checked against a real export: legacy `weight-*` values are pounds, `altitude-*` counts feet with 10 feet per floor, and `water_logs-*` entries carry an `amount` in millilitres unless a unit field names ounces. The file names come from current open-source Takeout parsers. Google has renamed export folders before, so a file that stops matching shows up in the skipped count.

## Hard Limits

- Data appears only after synchronization with the mobile app. There is no public BLE stream for desktop apps.
- Readiness Score, Cardio Load, Sleep Score, Stress Score, and proprietary coaching are not all exposed as Google or Fitbit values. OpenFit shows base measurements and local insights. It does not pretend to reproduce unavailable proprietary scores.
- GPS location is requested only to enrich compatible workouts. It is not rendered on a map yet.
- Availability and granularity depend on model, region, firmware, plan, and OAuth consent.

Sources: [third-party access and availability](https://developers.google.com/health/data-types), [endpoints](https://developers.google.com/health/endpoints), [paired devices](https://developers.google.com/health/reference/rest/v4/users.pairedDevices).
