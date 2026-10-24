import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PlaceSearchInput } from '../../src/features/search/PlaceSearchInput.tsx'
import type { SelectedLocation, PlaceSearchResponse } from '../../src/types/index.ts'
import * as placesService from '../../src/features/search/placesService.ts'

// Mock searchPlaces at the service boundary
vi.mock('../../src/features/search/placesService.ts', () => ({
  searchPlaces: vi.fn(),
}))

const mockSearchPlaces = vi.mocked(placesService.searchPlaces)

const mockGeoapifyResponse: PlaceSearchResponse = {
  query: 'Seawoods',
  total: 2,
  results: [
    {
      id: 'geo-seawoods-1',
      name: 'Seawoods Grand Central',
      formatted_address: 'Seawoods Grand Central Mall, Sector 40, Seawoods, Navi Mumbai',
      latitude: 19.0215,
      longitude: 73.0177,
      source: 'geoapify',
      category: 'commercial.shopping_mall',
      locality: 'Seawoods',
    },
    {
      id: 'geo-seawoods-2',
      name: 'Seawoods Station Complex',
      formatted_address: 'Station Road, Seawoods West, Navi Mumbai',
      latitude: 19.022,
      longitude: 73.018,
      source: 'geoapify',
      category: 'transit.railway',
      locality: 'Seawoods',
    },
  ],
  source: 'geoapify',
  cached: false,
}

describe('PlaceSearchInput Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  // 1. Initial rendering and accessible labeling
  it('renders initial origin state with accessible labels, badge, and default placeholder', () => {
    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const region = screen.getByRole('region', { name: 'Origin place selection' })
    expect(region).toBeTruthy()

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    expect(input).toBeTruthy()
    expect(input.getAttribute('placeholder')).toBe('Search place, address or click map...')
    expect(input.getAttribute('value')).toBe('')

    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('Origin')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pick on Map' })).toBeTruthy()
    expect(screen.getByText('Type to search or click "Pick on Map"')).toBeTruthy()
  })

  it('renders destination state with custom placeholder and active target button', () => {
    const handleActivateTarget = vi.fn()
    render(
      <PlaceSearchInput
        id="destination-input"
        endpointType="destination"
        label="Destination"
        tagLetter="B"
        placeholder="Enter destination..."
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={true}
        onActivateTarget={handleActivateTarget}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Destination search input' })
    expect(input.getAttribute('placeholder')).toBe('Enter destination...')

    const mapBtn = screen.getByRole('button', { name: 'Map Target Active' })
    expect(mapBtn.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('🎯 Click map to pin location')).toBeTruthy()

    fireEvent.click(mapBtn)
    expect(handleActivateTarget).toHaveBeenCalledTimes(1)
  })

  it('renders selected value coordinates and source badge', () => {
    const geoapifyLocation: SelectedLocation = {
      label: 'Inorbit Mall',
      coordinates: [19.066, 72.999],
      placeId: 'geo-inorbit-1',
      formattedAddress: 'Inorbit Mall, Vashi',
      source: 'geoapify',
    }

    const { rerender } = render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={geoapifyLocation}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    expect((input as HTMLInputElement).value).toBe('Inorbit Mall')
    expect(screen.getByText('19.0660° N, 72.9990° E')).toBeTruthy()
    expect(screen.getByText('Geoapify Place')).toBeTruthy()

    // Test curated landmark badge
    const curatedLocation: SelectedLocation = {
      label: 'Vashi Railway Station',
      coordinates: [19.0645, 72.9983],
      landmarkId: 'vashi-stn',
      source: 'curated',
    }
    rerender(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={curatedLocation}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )
    expect(screen.getByText('Curated Landmark')).toBeTruthy()

    // Test pinned coordinate badge
    const pinnedLocation: SelectedLocation = {
      label: 'Pinned Location',
      coordinates: [19.05, 73.01],
      source: 'map',
    }
    rerender(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={pinnedLocation}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )
    expect(screen.getByText('Pinned Map Coordinate')).toBeTruthy()
  })

  // 2. Debounced search behavior & avoidance of premature/redundant calls
  it('does not trigger searchPlaces for empty or single-character query', async () => {
    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: ' ' } })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(mockSearchPlaces).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'S' } })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(mockSearchPlaces).not.toHaveBeenCalled()
  })

  it('does not trigger searchPlaces when query equals selected value label', async () => {
    const existing: SelectedLocation = {
      label: 'Seawoods Grand Central',
      coordinates: [19.0215, 73.0177],
      source: 'geoapify',
    }

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={existing}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods Grand Central' } })
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(mockSearchPlaces).not.toHaveBeenCalled()
  })

  it('debounces query for 350ms before calling searchPlaces and ignores rapid intermediate inputs', async () => {
    mockSearchPlaces.mockResolvedValue(mockGeoapifyResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })

    // Type 'Se'
    fireEvent.change(input, { target: { value: 'Se' } })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(mockSearchPlaces).not.toHaveBeenCalled()

    // Type 'Sea' at 200ms (resets timer)
    fireEvent.change(input, { target: { value: 'Sea' } })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(mockSearchPlaces).not.toHaveBeenCalled()

    // Type 'Seawoods' at 400ms total
    fireEvent.change(input, { target: { value: 'Seawoods' } })
    await act(async () => {
      vi.advanceTimersByTime(340)
    })
    expect(mockSearchPlaces).not.toHaveBeenCalled()

    // Advance remaining 10ms to reach 350ms debounce threshold
    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    expect(mockSearchPlaces).toHaveBeenCalledTimes(1)
    expect(mockSearchPlaces).toHaveBeenCalledWith(
      'Seawoods',
      expect.objectContaining({ limit: 5 })
    )
  })

  // 3. Loading feedback
  it('displays loading spinner and searching status while request is in flight', async () => {
    let resolvePromise: (value: PlaceSearchResponse) => void = () => {}
    mockSearchPlaces.mockReturnValue(
      new Promise((res) => {
        resolvePromise = res
      })
    )

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Seawoods' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    // Spinner and dropdown notice should be visible
    expect(screen.getByLabelText('Loading search results')).toBeTruthy()
    expect(screen.getByText('Searching places via Geoapify...')).toBeTruthy()

    // Complete the promise
    await act(async () => {
      resolvePromise(mockGeoapifyResponse)
    })

    expect(screen.queryByLabelText('Loading search results')).toBeNull()
    expect(screen.queryByText('Searching places via Geoapify...')).toBeNull()
  })

  // 4. Rendering Geoapify search results
  it('renders Geoapify search results with section header and option items', async () => {
    mockSearchPlaces.mockResolvedValue(mockGeoapifyResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(screen.getByText('Search Results (Geoapify)')).toBeTruthy()

    const options = screen.getAllByRole('option')
    expect(options.length).toBe(2)

    expect(screen.getByText('Seawoods Grand Central')).toBeTruthy()
    expect(
      screen.getByText('Seawoods Grand Central Mall, Sector 40, Seawoods, Navi Mumbai')
    ).toBeTruthy()
    expect(screen.getByText('Seawoods Station Complex')).toBeTruthy()

    const badges = screen.getAllByText('Geoapify')
    // Badge in dropdown items and attribution
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  // 5. Geoapify attribution
  it('displays required Geoapify and OpenStreetMap attribution links', async () => {
    mockSearchPlaces.mockResolvedValue(mockGeoapifyResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    const geoapifyLink = screen.getByRole('link', { name: 'Geoapify' })
    expect(geoapifyLink.getAttribute('href')).toBe('https://www.geoapify.com/')
    expect(geoapifyLink.getAttribute('target')).toBe('_blank')

    const osmLink = screen.getByRole('link', { name: 'OpenStreetMap' })
    expect(osmLink.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
    expect(osmLink.getAttribute('target')).toBe('_blank')
  })

  // 6. Empty-result behavior
  it('renders empty result message when search returns no matches', async () => {
    mockSearchPlaces.mockResolvedValue({
      query: 'NonExistentPlace999',
      total: 0,
      results: [],
      source: 'geoapify',
      cached: false,
    })

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'NonExistentPlace999' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(screen.getByText(/No places matching/)).toBeTruthy()
    expect(
      screen.getByText(
        'Provider returned no matching results. Click anywhere on the map to pin coordinates directly.'
      )
    ).toBeTruthy()
  })

  // 7. Error handling and recovery
  it('falls back to local curated landmarks when remote search fails and matches exist', async () => {
    mockSearchPlaces.mockRejectedValue(new Error('Backend service unreachable (HTTP 502)'))

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    // 'Vashi' exists in curated NAVI_MUMBAI_LANDMARKS
    fireEvent.change(input, { target: { value: 'Vashi' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(screen.getByText('Curated Local Landmarks (Fallback)')).toBeTruthy()
    expect(screen.getByText('Vashi Railway Station')).toBeTruthy()

    const fallbackBadges = screen.getAllByText('Curated Fallback')
    expect(fallbackBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders remote search unavailable error state when remote fails and no curated match exists', async () => {
    mockSearchPlaces.mockRejectedValue(new Error('Rate limit exceeded (HTTP 429)'))

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'UnknownPlaceXYZ' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(screen.getByText('⚠️ Remote Search Unavailable')).toBeTruthy()
    expect(screen.getByText('Rate limit exceeded (HTTP 429)')).toBeTruthy()
    expect(
      screen.getByText(
        'No matching curated landmarks found. Click anywhere on the map to pin coordinates directly.'
      )
    ).toBeTruthy()
  })

  // 8. Curated fallback suggestions and triggering conditions
  it('shows popular transit hubs when input is focused with empty query and no value', () => {
    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.focus(input)

    expect(screen.getByText('Popular Navi Mumbai Transit Hubs')).toBeTruthy()
    expect(screen.getByText('Vashi Railway Station')).toBeTruthy()
    expect(screen.getByText('CBD Belapur Railway Station')).toBeTruthy()
    expect(screen.getByText('Kharghar Railway Station')).toBeTruthy()
    expect(screen.getByText('Airoli Railway Station')).toBeTruthy()
  })

  // 9. Selecting a result invokes the correct callback with expected place data
  it('invokes onSelect with normalized SelectedLocation when clicking Geoapify result', async () => {
    const handleSelect = vi.fn()
    mockSearchPlaces.mockResolvedValue(mockGeoapifyResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={handleSelect}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    const option = screen.getByText('Seawoods Grand Central')
    // Selection is bound to onMouseDown to prevent blur
    fireEvent.mouseDown(option)

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect).toHaveBeenCalledWith({
      label: 'Seawoods Grand Central',
      coordinates: [19.0215, 73.0177],
      placeId: 'geo-seawoods-1',
      formattedAddress: 'Seawoods Grand Central Mall, Sector 40, Seawoods, Navi Mumbai',
      source: 'geoapify',
      category: 'commercial.shopping_mall',
      locality: 'Seawoods',
      landmarkId: undefined,
    })

    // Dropdown should close after selection
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('invokes onSelect with curated source and landmarkId when selecting curated fallback', async () => {
    const handleSelect = vi.fn()
    mockSearchPlaces.mockRejectedValue(new Error('Network error'))

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={handleSelect}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Vashi' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    const option = screen.getByText('Vashi Railway Station')
    fireEvent.mouseDown(option)

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Vashi Railway Station',
        coordinates: [19.0645, 72.9983],
        source: 'curated',
        landmarkId: 'vashi-stn',
      })
    )
  })

  // 10. Keyboard navigation, focus, and selection
  it('supports ArrowDown and ArrowUp navigation through suggestions', async () => {
    mockSearchPlaces.mockResolvedValue(mockGeoapifyResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    const options = screen.getAllByRole('option')
    expect(options[0].getAttribute('aria-selected')).toBe('false')
    expect(options[1].getAttribute('aria-selected')).toBe('false')

    // ArrowDown highlights first option
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    expect(options[1].getAttribute('aria-selected')).toBe('false')

    // ArrowDown highlights second option
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[0].getAttribute('aria-selected')).toBe('false')
    expect(options[1].getAttribute('aria-selected')).toBe('true')

    // ArrowDown wraps back to first option
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options[0].getAttribute('aria-selected')).toBe('true')

    // ArrowUp wraps to last option
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(options[1].getAttribute('aria-selected')).toBe('true')
  })

  it('selects highlighted option on Enter key', async () => {
    const handleSelect = vi.fn()
    mockSearchPlaces.mockResolvedValue(mockGeoapifyResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={handleSelect}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    // Navigate to second option and press Enter
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Seawoods Station Complex',
        placeId: 'geo-seawoods-2',
      })
    )
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('selects single suggestion on Enter even when no option is explicitly highlighted', async () => {
    const handleSelect = vi.fn()
    const singleResultResponse: PlaceSearchResponse = {
      query: 'Seawoods Grand Central',
      total: 1,
      results: [mockGeoapifyResponse.results[0]],
      source: 'geoapify',
      cached: false,
    }
    mockSearchPlaces.mockResolvedValue(singleResultResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={handleSelect}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods Grand Central' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Seawoods Grand Central',
      })
    )
  })

  it('closes suggestion dropdown on Escape key', async () => {
    mockSearchPlaces.mockResolvedValue(mockGeoapifyResponse)

    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Seawoods' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  // 11. Clearing and replacing query
  it('clears query and invokes onClear when clear button is clicked', () => {
    const handleClear = vi.fn()
    render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={handleClear}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    fireEvent.change(input, { target: { value: 'Vashi' } })

    const clearBtn = screen.getByRole('button', { name: 'Clear origin location' })
    expect(clearBtn).toBeTruthy()

    fireEvent.click(clearBtn)
    expect(handleClear).toHaveBeenCalledTimes(1)
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('synchronizes query when value prop changes externally', () => {
    const { rerender } = render(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Origin search input' })
    expect((input as HTMLInputElement).value).toBe('')

    const newLoc: SelectedLocation = {
      label: 'Airoli Railway Station',
      coordinates: [19.1578, 72.9975],
      source: 'curated',
      landmarkId: 'airoli-stn',
    }

    rerender(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={newLoc}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    expect((input as HTMLInputElement).value).toBe('Airoli Railway Station')

    // Resetting value to null clears input
    rerender(
      <PlaceSearchInput
        id="origin-input"
        endpointType="origin"
        label="Origin"
        tagLetter="A"
        value={null}
        onSelect={() => {}}
        onClear={() => {}}
        isActiveTarget={false}
        onActivateTarget={() => {}}
      />
    )

    expect((input as HTMLInputElement).value).toBe('')
  })
})
