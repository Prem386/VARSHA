import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchRainfallForecast,
  fetchOfficialAlerts,
  WeatherApiError,
  DEFAULT_PILOT_COORDINATES,
} from '../src/features/weather/weatherService.ts'
import type { AlertListResponse, RainfallResponse } from '../src/types/index.ts'

test('fetchRainfallForecast returns normalized response with default coordinates', async () => {
  let requestedUrl = ''
  const mockPayload: RainfallResponse = {
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
      precipitation_mm: 0.2,
      unit: 'mm',
      is_model_derived: true,
      is_physical_observation: false,
      interval_description: 'Preceding 15-minute model accumulation estimate',
    },
    hourly: [
      {
        timestamp: '2026-10-24T12:00:00Z',
        precipitation_mm: 0.1,
        precipitation_probability_pct: 25,
        interval_minutes: 60,
        unit: 'mm',
        is_model_derived: true,
      },
    ],
    summary: {
      forecast_hours: 24,
      total_precipitation_mm: 0.5,
      max_hourly_precipitation_mm: 0.2,
      max_probability_pct: 45,
    },
    caveats: ['Model derived'],
  }

  const mockFetch = async (url: string | URL | Request): Promise<Response> => {
    requestedUrl = url.toString()
    return new Response(JSON.stringify(mockPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await fetchRainfallForecast(
    DEFAULT_PILOT_COORDINATES.latitude,
    DEFAULT_PILOT_COORDINATES.longitude,
    24,
    { fetchFn: mockFetch as unknown as typeof fetch }
  )

  assert.match(requestedUrl, /latitude=19\.033/)
  assert.match(requestedUrl, /longitude=73\.0297/)
  assert.match(requestedUrl, /forecast_hours=24/)
  assert.equal(result.provider.status, 'ok')
  assert.equal(result.current?.precipitation_mm, 0.2)
  assert.equal(result.summary?.total_precipitation_mm, 0.5)
  assert.equal(result.is_model_derived, true)
  assert.equal(result.is_physical_observation, false)
})

test('fetchRainfallForecast throws WeatherApiError on HTTP error status', async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify({ detail: 'Open-Meteo rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await assert.rejects(
    async () => {
      await fetchRainfallForecast(19.033, 73.0297, 24, {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof WeatherApiError)
      assert.equal(err.statusCode, 429)
      assert.match(err.message, /Open-Meteo rate limit exceeded/)
      return true
    }
  )
})

test('fetchRainfallForecast wraps network failure into WeatherApiError', async () => {
  const mockFetch = async (): Promise<Response> => {
    throw new TypeError('Failed to fetch')
  }

  await assert.rejects(
    async () => {
      await fetchRainfallForecast(19.033, 73.0297, 24, {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof WeatherApiError)
      assert.equal(err.statusCode, 0)
      assert.match(err.message, /Unable to connect/)
      return true
    }
  )
})

test('fetchOfficialAlerts returns normalized alert list', async () => {
  let requestedUrl = ''
  const mockPayload: AlertListResponse = {
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
        identifier: 'IN-ALERT-001',
        sender: 'IMD-Mumbai',
        sent: '2026-10-24T10:00:00Z',
        status: 'Actual',
        msg_type: 'Alert',
        event: 'Heavy Rain',
        headline: 'Heavy rainfall warning for Thane and Navi Mumbai',
        description: 'Isolated heavy to very heavy rain expected.',
        instruction: 'Avoid low lying underpasses and waterlogged zones.',
        severity: 'Severe',
        urgency: 'Expected',
        certainty: 'Likely',
        is_active: true,
        effective: '2026-10-24T10:00:00Z',
        expires: '2026-10-24T16:00:00Z',
        retrieved_at: '2026-10-24T12:00:00Z',
        alternate_languages: [],
        area_description: 'Navi Mumbai, Thane',
        geocodes: [],
        geometry_type: 'unresolved',
        has_spatial_geometry: false,
        warnings: [],
      },
    ],
    spatial_filter_applied: false,
  }

  const mockFetch = async (url: string | URL | Request): Promise<Response> => {
    requestedUrl = url.toString()
    return new Response(JSON.stringify(mockPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await fetchOfficialAlerts(true, {
    fetchFn: mockFetch as unknown as typeof fetch,
  })

  assert.match(requestedUrl, /active_only=true/)
  assert.equal(result.total, 1)
  assert.equal(result.alerts[0].identifier, 'IN-ALERT-001')
  assert.equal(result.alerts[0].severity, 'Severe')
  assert.equal(result.alerts[0].event, 'Heavy Rain')
})

test('fetchOfficialAlerts handles HTTP 500 upstream failure', async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify({ detail: 'SACHET RSS upstream unreachable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await assert.rejects(
    async () => {
      await fetchOfficialAlerts(true, {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    },
    (err: unknown) => {
      assert.ok(err instanceof WeatherApiError)
      assert.equal(err.statusCode, 500)
      assert.match(err.message, /SACHET RSS upstream unreachable/)
      return true
    }
  )
})
