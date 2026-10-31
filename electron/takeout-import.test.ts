import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const { importTakeoutFolder, translateTakeoutFiles } = require('./takeout-import.cjs')

const options = { timeZone: 'America/New_York', today: '2026-06-12' }
const legacy = (name: string) => `Takeout/Fitbit/Global Export Data/${name}`
const google = (name: string) => `Takeout/Google Health/Physical Activity_GoogleData/${name}`
const json = (value: unknown) => JSON.stringify(value)

describe('Google Takeout translator', () => {
  it('reads the legacy Fitbit layout into local days', async () => {
    const result = await translateTakeoutFiles([
      // Per-minute stamps are UTC: 03:00Z on 10 June is still 9 June in New York.
      { path: legacy('steps-2026-06-10.json'), text: json([
        { dateTime: '06/10/26 03:00:00', value: '100' },
        { dateTime: '06/10/26 15:00:00', value: '5000' },
        { dateTime: '06/11/26 01:00:00', value: '200' },
        { dateTime: '06/13/26 15:00:00', value: '900' },
      ]) },
      { path: legacy('distance-2026-06-10.json'), text: json([{ dateTime: '06/10/26 15:00:00', value: '350000' }]) },
      { path: legacy('moderately_active_minutes-2026-06-10.json'), text: json([{ dateTime: '06/10/26 00:00:00', value: '15' }]) },
      { path: legacy('very_active_minutes-2026-06-10.json'), text: json([{ dateTime: '06/10/26 00:00:00', value: '25' }]) },
      { path: legacy('sedentary_minutes-2026-06-10.json'), text: json([
        { dateTime: '06/10/26 00:00:00', value: '700' },
        { dateTime: '06/11/26 00:00:00', value: '1440' },
      ]) },
      { path: legacy('calories-2026-06-10.json'), text: json([{ dateTime: '06/11/26 16:00:00', value: '1500' }]) },
      { path: legacy('resting_heart_rate-2026-06-10.json'), text: json([
        { dateTime: '06/10/26 00:00:00', value: { date: '06/10/26', value: 58.44, error: 6 } },
        { dateTime: '06/11/26 00:00:00', value: { date: '06/11/26', value: 0, error: 0 } },
      ]) },
      { path: legacy('weight-2026-06-10.json'), text: json([{ logId: 1, weight: 165, fat: 21.5, date: '06/10/26', time: '07:00:00' }]) },
      { path: legacy('sleep-2026-06-10.json'), text: json([
        { logId: 11, dateOfSleep: '2026-06-10', minutesAsleep: 400, efficiency: 92, mainSleep: true },
        { logId: 12, dateOfSleep: '2026-06-10', minutesAsleep: 30, efficiency: 80, mainSleep: false },
      ]) },
      { path: legacy('food_logs-0.json'), text: json([
        { logDate: '2026-06-10', nutritionalValues: { calories: 600 } },
        { logDate: '2026-06-10', loggedFood: { calories: 250 } },
      ]) },
      { path: 'Takeout/Fitbit/Sleep/sleep_score.csv', text: 'sleep_log_entry_id,timestamp,overall_score,composition_score\n11,2026-06-11T11:00:00Z,84,20\n' },
      { path: legacy('heart_rate-2026-06-10.json'), text: 'intraday heart rate is not read' },
    ], options)

    // 11 June holds only resting calories and a full sedentary day; 13 June is in the future.
    expect(Object.keys(result.days)).toEqual(['2026-06-09', '2026-06-10'])
    expect(result.days['2026-06-09']).toMatchObject({ steps: 100 })
    expect(result.days['2026-06-10']).toMatchObject({
      steps: 5200,
      distanceKm: 3.5,
      activeMinutes: 40,
      sedentaryMinutes: 700,
      restingHeartRate: 58.4,
      weight: 74.84,
      bodyFat: 21.5,
      sleepMinutes: 430,
      sleepEfficiency: 92,
      sleepScore: 84,
      caloriesIn: 850,
      hrvMs: null,
    })
    expect(result).toMatchObject({ readFiles: 11, skippedFiles: 1 })
  })

  it('reads the Google Health layout and prefers it over legacy duplicates', async () => {
    const result = await translateTakeoutFiles([
      // A phone and the tracker count the same walk; only the busier source counts.
      { path: google('steps_2026-06-10.csv'), text: 'timestamp,steps,data source\n2026-06-10T14:00:00Z,4000,Fitbit Air\n2026-06-10T14:01:00Z,500,Fitbit Air\n2026-06-10T14:00:00Z,3000,Phone\n' },
      { path: legacy('steps-2026-06-10.json'), text: json([{ dateTime: '06/10/26 14:00:00', value: '4400' }]) },
      // Daily aggregates are labelled at midnight UTC and keep that date.
      { path: google('daily_resting_heart_rate.csv'), text: 'timestamp,beats per minute,data source\n2026-06-11T00:00:00Z,61.2,Fitbit Air\n' },
      { path: google('daily_sleep_temperature_derivations.csv'), text: 'timestamp,nightly temperature celsius,baseline temperature celsius,data source\n2026-06-11T00:00:00Z,34.1,33.8,Fitbit Air\n' },
      // A weigh-in at 02:30Z on 11 June happened on the evening of 10 June locally.
      { path: google('weight_2026-06-10.csv'), text: 'timestamp,weight grams,data source\n2026-06-11T02:30:00Z,72500,Fitbit App\n' },
      // Each night appears once per sleep algorithm.
      { path: 'Takeout/Google Health/Health Fitness Data_GoogleData/UserSleeps_2026-06-10.csv', text: 'sleep_id,algorithm_version,sleep_start,sleep_end,minutes_asleep,minutes_in_sleep_period\na1,sleep_session_v1,2026-06-11T03:00:00Z,2026-06-11T10:30:00Z,400,440\na2,sleep_session_v2,2026-06-11T03:00:00Z,2026-06-11T10:30:00Z,410,440\n' },
      { path: 'Takeout/Google Health/Health Fitness Data_GoogleData/UserSleepScores_2026-06-10.csv', text: 'sleep_id,overall_score\na1,80\na2,83\n' },
    ], options)

    expect(result.days['2026-06-10']).toMatchObject({ steps: 4500, weight: 72.5 })
    expect(result.days['2026-06-11']).toMatchObject({
      restingHeartRate: 61.2,
      skinTemperature: 0.3,
      sleepMinutes: 410,
      sleepEfficiency: 93,
      sleepScore: 83,
    })
  })

  it('walks an extracted folder and rejects one without Fitbit data', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openfit-takeout-'))
    try {
      const folder = path.join(root, 'Takeout', 'Google Health', 'Physical Activity_GoogleData')
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'daily_respiratory_rate.csv'), 'timestamp,breaths per minute,data source\n2026-06-11T00:00:00Z,14.8,Fitbit Air\n')
      fs.writeFileSync(path.join(folder, 'UserSensorCompressionToken_2026-06.csv'), 'token\nabc\n')
      fs.writeFileSync(path.join(folder, 'readme.txt'), 'not data')

      const result = await importTakeoutFolder(root, options)
      expect(result.days['2026-06-11']).toMatchObject({ breathingRate: 14.8 })
      expect(result).toMatchObject({ readFiles: 1, skippedFiles: 0 })

      fs.rmSync(path.join(root, 'Takeout'), { recursive: true })
      await expect(importTakeoutFolder(root, options)).rejects.toThrow('No Fitbit data found')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
