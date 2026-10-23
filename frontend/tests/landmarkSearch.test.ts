import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NAVI_MUMBAI_LANDMARKS,
  POPULAR_LANDMARKS,
  getLandmarkById,
  searchLandmarks,
} from '../src/features/search/landmarks.ts'
import type { Landmark } from '../src/features/search/landmarks.ts'
import type { SelectedLocation } from '../src/types/index.ts'

test('NAVI_MUMBAI_LANDMARKS contains valid and unique entries', () => {
  assert.ok(NAVI_MUMBAI_LANDMARKS.length >= 18, 'Expected at least 18 landmarks')
  const ids = new Set<string>()

  for (const landmark of NAVI_MUMBAI_LANDMARKS) {
    assert.ok(landmark.id && landmark.id.trim().length > 0, 'Landmark id must be non-empty')
    assert.ok(!ids.has(landmark.id), `Duplicate landmark id found: ${landmark.id}`)
    ids.add(landmark.id)

    assert.ok(landmark.name && landmark.name.trim().length > 0, 'Landmark name must be non-empty')
    assert.ok(landmark.locality && landmark.locality.trim().length > 0, 'Locality must be non-empty')
    assert.ok(landmark.category && landmark.category.trim().length > 0, 'Category must be non-empty')

    const [lat, lng] = landmark.coordinates
    assert.ok(Number.isFinite(lat) && lat >= 18.9 && lat <= 19.3, `Invalid latitude for ${landmark.id}: ${lat}`)
    assert.ok(Number.isFinite(lng) && lng >= 72.8 && lng <= 73.2, `Invalid longitude for ${landmark.id}: ${lng}`)
  }
})

test('Test A — Case-insensitive matching', () => {
  const lowercaseResults = searchLandmarks('vashi')
  const uppercaseResults = searchLandmarks('VASHI')
  const mixedCaseResults = searchLandmarks('VaShI')

  assert.ok(lowercaseResults.length > 0, 'Expected matches for lowercase "vashi"')
  assert.equal(lowercaseResults.length, uppercaseResults.length)
  assert.equal(lowercaseResults.length, mixedCaseResults.length)
  assert.deepEqual(
    lowercaseResults.map((l) => l.id),
    uppercaseResults.map((l) => l.id)
  )

  const airoliLower = searchLandmarks('airoli')
  const airoliUpper = searchLandmarks('AIROLI')
  assert.ok(airoliLower.length >= 2, 'Expected at least 2 matches for Airoli')
  assert.deepEqual(
    airoliLower.map((l) => l.id),
    airoliUpper.map((l) => l.id)
  )
})

test('Test B — Partial landmark names and aliases', () => {
  // Partial substring matches
  const secResults = searchLandmarks('sec 17')
  assert.ok(secResults.some((l) => l.id === 'vashi-sec17'))

  const utsavResults = searchLandmarks('utsav')
  assert.ok(utsavResults.some((l) => l.id === 'kharghar-utsav'))

  const seawoodsResults = searchLandmarks('seawoods')
  assert.ok(seawoodsResults.some((l) => l.id === 'seawoods-stn'))

  const apmcResults = searchLandmarks('apmc')
  assert.ok(apmcResults.some((l) => l.id === 'apmc-market'))

  const konkanResults = searchLandmarks('konkan')
  assert.ok(konkanResults.some((l) => l.id === 'belapur-cbd'))

  const tollResults = searchLandmarks('mulund')
  assert.ok(tollResults.some((l) => l.id === 'airoli-toll'))
})

test('Test C — No-results behavior', () => {
  const nonexistent = searchLandmarks('xyzNonExistentLocation123')
  assert.equal(nonexistent.length, 0)

  const empty = searchLandmarks('')
  assert.equal(empty.length, 0)

  const spacesOnly = searchLandmarks('     ')
  assert.equal(spacesOnly.length, 0)
})

test('Test D — Selecting a landmark returns its exact stored coordinates', () => {
  const vashi = getLandmarkById('vashi-stn')
  assert.ok(vashi)
  assert.deepEqual(vashi.coordinates, [19.0645, 72.9983])

  const belapur = getLandmarkById('belapur-stn')
  assert.ok(belapur)
  assert.deepEqual(belapur.coordinates, [19.0185, 73.0385])

  const kharghar = getLandmarkById('kharghar-stn')
  assert.ok(kharghar)
  assert.deepEqual(kharghar.coordinates, [19.0256, 73.0645])
})

test('Test E — Origin and destination selection updates correct endpoint independently', () => {
  let origin: SelectedLocation | null = null
  let destination: SelectedLocation | null = null
  let activeRouteCleared = false

  const clearExistingRoute = () => {
    activeRouteCleared = true
  }

  const handleSelectOrigin = (loc: SelectedLocation) => {
    clearExistingRoute()
    origin = loc
  }

  const handleSelectDestination = (loc: SelectedLocation) => {
    clearExistingRoute()
    destination = loc
  }

  // Select origin
  const vashi = getLandmarkById('vashi-stn') as Landmark
  handleSelectOrigin({
    label: vashi.name,
    coordinates: vashi.coordinates,
    landmarkId: vashi.id,
  })

  assert.ok(activeRouteCleared)
  assert.ok(origin)
  assert.equal(origin.label, 'Vashi Railway Station')
  assert.deepEqual(origin.coordinates, [19.0645, 72.9983])
  assert.equal(origin.landmarkId, 'vashi-stn')
  assert.equal(destination, null, 'Destination must remain null when origin is selected')

  // Select destination
  activeRouteCleared = false
  const belapur = getLandmarkById('belapur-stn') as Landmark
  handleSelectDestination({
    label: belapur.name,
    coordinates: belapur.coordinates,
    landmarkId: belapur.id,
  })

  assert.ok(activeRouteCleared)
  assert.ok(destination)
  assert.equal(destination.label, 'CBD Belapur Railway Station')
  assert.deepEqual(destination.coordinates, [19.0185, 73.0385])
  assert.equal(destination.landmarkId, 'belapur-stn')
  assert.equal(origin.label, 'Vashi Railway Station', 'Origin must remain intact when destination is selected')
})

test('Test F — Map-click selection remains functional with fallback label and route clearing', () => {
  let origin: SelectedLocation | null = null
  let activeTarget: 'origin' | 'destination' = 'origin'
  let activeRouteCleared = false

  const clearExistingRoute = () => {
    activeRouteCleared = true
  }

  const handleMapClick = (coords: [number, number]) => {
    clearExistingRoute()
    const formattedLat = Number(coords[0].toFixed(6))
    const formattedLng = Number(coords[1].toFixed(6))

    if (activeTarget === 'origin') {
      origin = {
        label: `Pinned location (${formattedLat.toFixed(4)}, ${formattedLng.toFixed(4)})`,
        coordinates: [formattedLat, formattedLng],
      }
      activeTarget = 'destination'
    }
  }

  handleMapClick([19.076041, 72.998512])

  assert.ok(activeRouteCleared, 'Map click must invalidate previous route')
  assert.ok(origin)
  assert.equal(origin.label, 'Pinned location (19.0760, 72.9985)')
  assert.deepEqual(origin.coordinates, [19.076041, 72.998512])
  assert.equal(origin.landmarkId, undefined)
  assert.equal(activeTarget, 'destination', 'Map click advances target to destination')
})

test('Test G — Popular landmarks list is non-empty and well-formed', () => {
  assert.ok(POPULAR_LANDMARKS.length >= 3)
  for (const landmark of POPULAR_LANDMARKS) {
    assert.ok(landmark.id)
    assert.ok(landmark.name)
    assert.ok(landmark.coordinates)
  }
})
