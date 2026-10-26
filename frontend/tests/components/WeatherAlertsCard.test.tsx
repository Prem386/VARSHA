import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  WeatherAlertsCard,
  formatHourSlot,
  selectNextSixForecastHours,
} from '../../src/features/weather/WeatherAlertsCard.tsx'
import type { AlertListResponse, RainfallResponse } from '../../src/types/index.ts'

afterEach(() => {
  cleanup()
})

const mockRainfallSuccess: RainfallResponse = {
  provider: {
    provider: 'open_meteo',
    status: 'ok',
    is_cached: false,
    is_stale: false,
    retrieved_at: '2026-10-24T12:00:00Z',
    error_message: null,
    endpoint_url: 'https://api.open-meteo.com/v1/forecast?...',
  },
  requested_coordinate: { latitude: 19.033, longitude: 73.0297 },
  data_type: 'forecast_model',
  is_model_derived: true,
  is_physical_observation: false,
  current: {
    timestamp: '2026-10-24T11:45:00Z',
    interval_seconds: 900,
    precipitation_mm: 1.5,
    unit: 'mm',
    is_model_derived: true,
    is_physical_observation: false,
    interval_description: 'Preceding 15-minute model accumulation estimate',
  },
  hourly: [],
  summary: {
    forecast_hours: 24,
    total_precipitation_mm: 12.8,
    max_hourly_precipitation_mm: 3.4,
    max_probability_pct: 85.0,
  },
  caveats: ['NWP Model data'],
}

const mockAlertsSuccess: AlertListResponse = {
  provider: {
    provider: 'ndma_sachet',
    status: 'ok',
    is_cached: false,
    is_stale: false,
    retrieved_at: '2026-10-24T12:00:00Z',
    error_message: null,
    feed_url: 'https://sachet.ndma.gov.in/test.xml',
  },
  total: 1,
  alerts: [
    {
      provider: 'ndma_sachet',
      identifier: 'ALERT-MUM-01',
      sender: 'IMD-Mumbai',
      sent: '2026-10-24T10:00:00Z',
      status: 'Actual',
      msg_type: 'Alert',
      event: 'Heavy Rain Alert',
      headline: 'Heavy to very heavy rainfall warning for Navi Mumbai region',
      description: 'Intense rain bands expected across coastal Konkan.',
      instruction: 'Avoid inundated low-lying underpasses and follow civic advisories.',
      severity: 'Severe',
      urgency: 'Expected',
      certainty: 'Likely',
      is_active: true,
      effective: '2026-10-24T10:00:00Z',
      expires: '2026-10-24T16:00:00Z',
      retrieved_at: '2026-10-24T12:00:00Z',
      alternate_languages: [],
      area_description: 'Navi Mumbai, Thane, Raigad',
      geocodes: [],
      geometry_type: 'unresolved',
      has_spatial_geometry: false,
      warnings: [],
    },
  ],
  spatial_filter_applied: false,
}

const mockAlertsEmpty: AlertListResponse = {
  provider: {
    provider: 'ndma_sachet',
    status: 'ok',
    is_cached: false,
    is_stale: false,
    retrieved_at: '2026-10-24T12:00:00Z',
    error_message: null,
    feed_url: 'https://sachet.ndma.gov.in/test.xml',
  },
  total: 0,
  alerts: [],
  spatial_filter_applied: false,
}

describe('WeatherAlertsCard Component', () => {
  it('renders successful rainfall response with current model estimate and 24h summary', async () => {
    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={mockRainfallSuccess}
        initialAlerts={mockAlertsEmpty}
      />
    )

    // Current rainfall metric
    expect(screen.getByText('1.5 mm')).toBeTruthy()
    expect(screen.getByText('NWP Model-derived')).toBeTruthy()
    expect(screen.getByText(/preceding 15 min evaluation interval/i)).toBeTruthy()

    // 24-hour summary metrics
    expect(screen.getByText('12.8 mm')).toBeTruthy()
    expect(screen.getByText('3.4 mm')).toBeTruthy()
    expect(screen.getByText('85%')).toBeTruthy()

    // Attribution
    const attribution = screen.getByText('Open-Meteo.com')
    expect(attribution.getAttribute('href')).toBe('https://open-meteo.com/')
  })

  it('renders official disaster alerts with severity badge and expandable details', async () => {
    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={mockRainfallSuccess}
        initialAlerts={mockAlertsSuccess}
      />
    )

    // Alert title & headline
    expect(screen.getByText('Heavy to very heavy rainfall warning for Navi Mumbai region')).toBeTruthy()
    expect(screen.getByText('Severe Severity')).toBeTruthy()
    expect(screen.getByText('Heavy Rain Alert')).toBeTruthy()
    expect(screen.getByText(/Navi Mumbai, Thane, Raigad/)).toBeTruthy()

    // Expand details
    const toggleButton = screen.getByRole('button', { name: /Show Instructions & Details/ })
    fireEvent.click(toggleButton)

    expect(screen.getByText(/Avoid inundated low-lying underpasses/)).toBeTruthy()
    expect(screen.getByText(/Intense rain bands expected/)).toBeTruthy()
  })

  it('renders empty alert state when total is zero, distinguishing from service failure', async () => {
    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={mockRainfallSuccess}
        initialAlerts={mockAlertsEmpty}
      />
    )

    const noAlertsState = screen.getByTestId('no-alerts-state')
    expect(noAlertsState).toBeTruthy()
    expect(screen.getByText('No Active Official Disaster Alerts')).toBeTruthy()
    expect(
      screen.getByText(/There are no active government warnings currently broadcast in the NDMA SACHET feed/)
    ).toBeTruthy()
  })

  it('handles rainfall service failure gracefully while still displaying official alerts', async () => {
    const mockRainfallFail = vi.fn().mockRejectedValue(new Error('Open-Meteo connection timed out'))
    const mockAlertsOk = vi.fn().mockResolvedValue(mockAlertsSuccess)

    render(
      <WeatherAlertsCard
        autoFetch={true}
        fetchRainfallFn={mockRainfallFail}
        fetchAlertsFn={mockAlertsOk}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Rainfall forecast unavailable')).toBeTruthy()
    })

    expect(screen.getByText('Open-Meteo connection timed out')).toBeTruthy()
    // Official alerts must still render successfully
    expect(screen.getByText('Heavy to very heavy rainfall warning for Navi Mumbai region')).toBeTruthy()
  })

  it('handles alerts service failure gracefully while still displaying rainfall forecast', async () => {
    const mockRainfallOk = vi.fn().mockResolvedValue(mockRainfallSuccess)
    const mockAlertsFail = vi.fn().mockRejectedValue(new Error('NDMA SACHET feed unreachable'))

    render(
      <WeatherAlertsCard
        autoFetch={true}
        fetchRainfallFn={mockRainfallOk}
        fetchAlertsFn={mockAlertsFail}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Official alert feed unavailable')).toBeTruthy()
    })

    expect(screen.getByText('NDMA SACHET feed unreachable')).toBeTruthy()
    // Rainfall data must still render successfully
    expect(screen.getByText('1.5 mm')).toBeTruthy()
    expect(screen.getByText('12.8 mm')).toBeTruthy()
  })

  it('displays degraded/stale cache warnings when provider is stale', () => {
    const staleRainfall: RainfallResponse = {
      ...mockRainfallSuccess,
      provider: {
        ...mockRainfallSuccess.provider,
        status: 'degraded',
        is_stale: true,
        is_cached: true,
      },
    }

    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={staleRainfall}
        initialAlerts={mockAlertsEmpty}
      />
    )

    expect(screen.getByText(/Open-Meteo upstream is currently unreachable. Displaying cached forecast/)).toBeTruthy()
    expect(screen.getByText(/⚠ Stale Fallback/)).toBeTruthy()
  })

  it('displays loading indicator while auto-fetching with no initial data', () => {
    // Hang promises to observe loading state
    const pendingPromise = new Promise<never>(() => {})

    render(
      <WeatherAlertsCard
        autoFetch={true}
        fetchRainfallFn={() => pendingPromise}
        fetchAlertsFn={() => pendingPromise}
      />
    )

    expect(screen.getByText('Retrieving model precipitation forecast…')).toBeTruthy()
    expect(screen.getByText('Connecting to NDMA SACHET warning feed…')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refresh weather and alerts data/ })).toBeTruthy()
  })

  it('triggers refetch when Refresh button is clicked', async () => {
    const fetchRainfall = vi.fn().mockResolvedValue(mockRainfallSuccess)
    const fetchAlerts = vi.fn().mockResolvedValue(mockAlertsEmpty)

    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={mockRainfallSuccess}
        initialAlerts={mockAlertsEmpty}
        fetchRainfallFn={fetchRainfall}
        fetchAlertsFn={fetchAlerts}
      />
    )

    const refreshButton = screen.getByRole('button', { name: /Refresh weather and alerts data/ })
    fireEvent.click(refreshButton)

    await waitFor(() => {
      expect(fetchRainfall).toHaveBeenCalledTimes(1)
      expect(fetchAlerts).toHaveBeenCalledTimes(1)
    })
  })

  it('handles missing 24-hour summary gracefully without fabricating data', () => {
    const rainfallWithoutSummary: RainfallResponse = {
      ...mockRainfallSuccess,
      summary: null,
    }

    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={rainfallWithoutSummary}
        initialAlerts={mockAlertsEmpty}
      />
    )

    expect(
      screen.getByText('24-hour summary unavailable for this forecast coordinate.')
    ).toBeTruthy()
  })

  it('displays explicit distinction notice and accurate geographic scope without falsely claiming alerts apply to Navi Mumbai', () => {
    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={mockRainfallSuccess}
        initialAlerts={mockAlertsEmpty}
      />
    )

    // Notice clarifies that rainfall is coordinate-targeted while alerts are from the SACHET feed
    expect(
      screen.getByText(/Rainfall is a model-derived forecast for Navi Mumbai/)
    ).toBeTruthy()
    expect(
      screen.getByText(/Official alerts reflect active broadcasts from the NDMA SACHET feed/)
    ).toBeTruthy()
    expect(
      screen.getByText(/check the affected districts on each warning card for local relevance/)
    ).toBeTruthy()
    expect(
      screen.getByText(/Neither confirms road waterlogging nor guarantees route safety/)
    ).toBeTruthy()
  })

  it('renders next 6 hours forecast in Navi Mumbai local time (IST) with accumulation and probability', () => {
    const mockRainfallWithHourly: RainfallResponse = {
      ...mockRainfallSuccess,
      hourly: [
        {
          timestamp: '2026-10-24T12:00:00Z',
          precipitation_mm: 0.5,
          precipitation_probability_pct: 45.0,
          interval_minutes: 60,
          unit: 'mm',
          is_model_derived: true,
        },
        {
          timestamp: '2026-10-24T13:00:00Z',
          precipitation_mm: 1.2,
          precipitation_probability_pct: 60.0,
          interval_minutes: 60,
          unit: 'mm',
          is_model_derived: true,
        },
        {
          timestamp: '2026-10-24T14:00:00Z',
          precipitation_mm: 2.5,
          precipitation_probability_pct: 80.0,
          interval_minutes: 60,
          unit: 'mm',
          is_model_derived: true,
        },
        {
          timestamp: '2026-10-24T15:00:00Z',
          precipitation_mm: 0.0,
          precipitation_probability_pct: 20.0,
          interval_minutes: 60,
          unit: 'mm',
          is_model_derived: true,
        },
        {
          timestamp: '2026-10-24T16:00:00Z',
          precipitation_mm: 0.8,
          precipitation_probability_pct: 35.0,
          interval_minutes: 60,
          unit: 'mm',
          is_model_derived: true,
        },
        {
          timestamp: '2026-10-24T17:00:00Z',
          precipitation_mm: 0.1,
          precipitation_probability_pct: 10.0,
          interval_minutes: 60,
          unit: 'mm',
          is_model_derived: true,
        },
        {
          timestamp: '2026-10-24T18:00:00Z',
          precipitation_mm: 4.0,
          precipitation_probability_pct: 90.0,
          interval_minutes: 60,
          unit: 'mm',
          is_model_derived: true,
        },
      ],
    }

    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={mockRainfallWithHourly}
        initialAlerts={mockAlertsEmpty}
      />
    )

    const hourlyBox = screen.getByTestId('hourly-forecast-box')
    expect(hourlyBox).toBeTruthy()
    expect(screen.getByText('Next 6 Hours Forecast (IST)')).toBeTruthy()

    // 6 slot items rendered (first 6 hours of 7 provided)
    const slotCards = hourlyBox.querySelectorAll('.hourly-slot-card')
    expect(slotCards.length).toBe(6)

    // Check hourly values
    expect(screen.getByText('0.5 mm')).toBeTruthy()
    expect(screen.getByText('1.2 mm')).toBeTruthy()
    expect(screen.getByText('2.5 mm')).toBeTruthy()
    expect(screen.getByText('0 mm')).toBeTruthy()
    expect(screen.getByText('0.8 mm')).toBeTruthy()
    expect(screen.getByText('0.1 mm')).toBeTruthy()
    // 7th slot (4.0 mm) should not be in the 6-hour slice
    expect(screen.queryByText('4 mm')).toBeNull()
    expect(screen.queryByText('4.0 mm')).toBeNull()

    // Check probabilities
    expect(screen.getByText('45% prob')).toBeTruthy()
    expect(screen.getByText('60% prob')).toBeTruthy()
    expect(screen.getByText('80% prob')).toBeTruthy()
    expect(screen.getByText('20% prob')).toBeTruthy()
    expect(screen.getByText('35% prob')).toBeTruthy()
    expect(screen.getByText('10% prob')).toBeTruthy()
  })

  describe('selectNextSixForecastHours and formatHourSlot helpers', () => {
    it('excludes current hour (step.timestamp <= currentHourStart) and selects next 6 future hours', () => {
      // Current time is 17:35 UTC (current hour is 17:00-18:00 UTC)
      const refTime = '2026-10-23T17:35:00Z'
      const steps = [
        { timestamp: '2026-10-23T16:00:00Z', precipitation_mm: 0.1, precipitation_probability_pct: 10, interval_minutes: 60, unit: 'mm', is_model_derived: true },
        { timestamp: '2026-10-23T17:00:00Z', precipitation_mm: 0.9, precipitation_probability_pct: 50, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // Current hour
        { timestamp: '2026-10-23T18:00:00Z', precipitation_mm: 1.0, precipitation_probability_pct: 60, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // 1st future
        { timestamp: '2026-10-23T19:00:00Z', precipitation_mm: 2.0, precipitation_probability_pct: 70, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // 2nd future
        { timestamp: '2026-10-23T20:00:00Z', precipitation_mm: 0.5, precipitation_probability_pct: 40, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // 3rd future
        { timestamp: '2026-10-23T21:00:00Z', precipitation_mm: 0.0, precipitation_probability_pct: 10, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // 4th future
        { timestamp: '2026-10-23T22:00:00Z', precipitation_mm: 0.2, precipitation_probability_pct: 20, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // 5th future
        { timestamp: '2026-10-23T23:00:00Z', precipitation_mm: 1.5, precipitation_probability_pct: 80, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // 6th future
        { timestamp: '2026-10-24T00:00:00Z', precipitation_mm: 3.0, precipitation_probability_pct: 90, interval_minutes: 60, unit: 'mm', is_model_derived: true }, // 7th future
      ]

      const selected = selectNextSixForecastHours(steps, refTime)
      expect(selected.length).toBe(6)
      // 17:00 (current hour) is excluded
      expect(selected[0].timestamp).toBe('2026-10-23T18:00:00Z')
      expect(selected[5].timestamp).toBe('2026-10-23T23:00:00Z')
      // 24:00 is not in the 6-hour slice
      expect(selected.some((s) => s.timestamp === '2026-10-24T00:00:00Z')).toBe(false)
    })

    it('safely handles out-of-order and malformed timestamps without crashing or fabricating', () => {
      const refTime = '2026-10-23T12:00:00Z'
      const messySteps = [
        { timestamp: 'not-a-valid-date', precipitation_mm: 9.9, precipitation_probability_pct: 99, interval_minutes: 60, unit: 'mm', is_model_derived: true },
        { timestamp: '2026-10-23T15:00:00Z', precipitation_mm: 1.5, precipitation_probability_pct: 40, interval_minutes: 60, unit: 'mm', is_model_derived: true },
        { timestamp: '2026-10-23T13:00:00Z', precipitation_mm: 0.5, precipitation_probability_pct: 20, interval_minutes: 60, unit: 'mm', is_model_derived: true },
        { timestamp: '2026-10-23T14:00:00Z', precipitation_mm: 1.0, precipitation_probability_pct: 30, interval_minutes: 60, unit: 'mm', is_model_derived: true },
        // @ts-expect-error test malformed input
        { timestamp: null, precipitation_mm: 0.0, precipitation_probability_pct: 0, interval_minutes: 60, unit: 'mm', is_model_derived: true },
      ]

      const selected = selectNextSixForecastHours(messySteps, refTime)
      expect(selected.length).toBe(3)
      // Sorted chronologically
      expect(selected[0].timestamp).toBe('2026-10-23T13:00:00Z')
      expect(selected[1].timestamp).toBe('2026-10-23T14:00:00Z')
      expect(selected[2].timestamp).toBe('2026-10-23T15:00:00Z')
    })

    it('formats timestamps in Asia/Kolkata (IST) correctly', () => {
      // 12:00 UTC is 17:30 IST (5:30 pm)
      expect(formatHourSlot('2026-10-24T12:00:00Z')).toMatch(/5:30\s*pm/i)
      // 18:30 UTC is 00:00 IST next day (12:00 am)
      expect(formatHourSlot('2026-10-24T18:30:00Z')).toMatch(/12:00\s*am/i)
      // Missing or null returns placeholder
      expect(formatHourSlot(null)).toBe('—')
      expect(formatHourSlot(undefined)).toBe('—')
    })
  })

  it('renders partial accumulation label and note when 24-hour summary is incomplete', () => {
    const partialRainfall: RainfallResponse = {
      ...mockRainfallSuccess,
      summary: {
        forecast_hours: 24,
        total_precipitation_mm: 8.5,
        max_hourly_precipitation_mm: 2.1,
        max_probability_pct: 70.0,
        valid_hours: 18,
        is_complete: false,
      },
    }

    render(
      <WeatherAlertsCard
        autoFetch={false}
        initialRainfall={partialRainfall}
        initialAlerts={mockAlertsEmpty}
      />
    )

    // Labeled as Rolling 24-Hour Forecast Summary
    expect(screen.getByText('Rolling 24-Hour Forecast Summary')).toBeTruthy()

    // Must clearly flag partial completeness
    expect(screen.getByText('Total Accumulation (Partial: 18/24h)')).toBeTruthy()
    expect(screen.getByText('8.5 mm')).toBeTruthy()
    expect(screen.getByText(/Incomplete forecast: 6 of 24 hourly intervals were missing/)).toBeTruthy()
  })
})
