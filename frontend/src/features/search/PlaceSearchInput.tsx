import { useEffect, useId, useRef, useState } from 'react'
import type { FC, KeyboardEvent } from 'react'
import type { PlaceSuggestion, RouteEndpointType, SelectedLocation } from '../../types'
import { POPULAR_LANDMARKS, searchLandmarks } from './landmarks'
import type { Landmark } from './landmarks'
import { searchPlaces } from './placesService'
import { IconSearch, IconClose, IconTarget, IconPin } from '../../components/Icons'
import './PlaceSearchInput.css'

export interface PlaceSearchInputProps {
  id: string
  endpointType: RouteEndpointType
  label: string
  tagLetter: 'A' | 'B'
  placeholder?: string
  value: SelectedLocation | null
  onSelect: (location: SelectedLocation) => void
  onClear: () => void
  isActiveTarget: boolean
  onActivateTarget: () => void
}

function landmarkToSuggestion(landmark: Landmark): PlaceSuggestion {
  return {
    id: landmark.id,
    name: landmark.name,
    formatted_address: `${landmark.locality} • ${landmark.category}`,
    latitude: landmark.coordinates[0],
    longitude: landmark.coordinates[1],
    source: 'curated',
    category: landmark.category,
    locality: landmark.locality,
  }
}

export const PlaceSearchInput: FC<PlaceSearchInputProps> = ({
  id,
  endpointType,
  label,
  tagLetter,
  placeholder = 'Search place, address or click map...',
  value,
  onSelect,
  onClear,
  isActiveTarget,
  onActivateTarget,
}) => {
  const [query, setQuery] = useState(value ? value.label : '')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [isFocused, setIsFocused] = useState(false)

  // Remote Geoapify search state
  const [isLoading, setIsLoading] = useState(false)
  const [remoteResults, setRemoteResults] = useState<PlaceSuggestion[]>([])
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [fallbackResults, setFallbackResults] = useState<PlaceSuggestion[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeAbortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const listboxId = useId()

  // Sync displayed query text when external value changes (e.g. map click, swap, clear)
  useEffect(() => {
    setQuery(value ? value.label : '')
    setRemoteResults([])
    setRemoteError(null)
    setFallbackResults([])
  }, [value])

  // Cleanup in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort()
      }
    }
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [])

  const trimmedQuery = query.trim()
  const isSearchActive = trimmedQuery.length >= 2 && (!value || value.label !== query)

  // Debounced place search against backend Geoapify proxy
  useEffect(() => {
    if (!isSearchActive) {
      setIsLoading(false)
      setRemoteResults([])
      setRemoteError(null)
      setFallbackResults([])
      if (activeAbortRef.current) {
        activeAbortRef.current.abort()
        activeAbortRef.current = null
      }
      return
    }

    // Cancel prior in-flight request
    if (activeAbortRef.current) {
      activeAbortRef.current.abort()
    }

    const currentRequestId = ++requestIdRef.current
    const controller = new AbortController()
    activeAbortRef.current = controller

    setIsLoading(true)
    setRemoteError(null)
    setFallbackResults([])

    const timer = setTimeout(async () => {
      try {
        const response = await searchPlaces(trimmedQuery, {
          limit: 5,
          signal: controller.signal,
        })

        // Guard against stale responses overwriting newer search results
        if (requestIdRef.current === currentRequestId) {
          setRemoteResults(response.results)
          setRemoteError(null)
          setFallbackResults([])
          setIsLoading(false)
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return
        }

        if (requestIdRef.current === currentRequestId) {
          const errMsg = err instanceof Error ? err.message : 'Remote place search unavailable.'
          setRemoteError(errMsg)
          setRemoteResults([])

          // Fallback to locally curated landmarks when remote service fails
          const matchingLandmarks = searchLandmarks(trimmedQuery, 4)
          setFallbackResults(matchingLandmarks.map(landmarkToSuggestion))
          setIsLoading(false)
        }
      }
    }, 350)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmedQuery, isSearchActive])

  // Determine active suggestions to display
  let displayedSuggestions: PlaceSuggestion[] = []
  let isCuratedFallback = false

  if (isSearchActive) {
    if (remoteResults.length > 0) {
      displayedSuggestions = remoteResults
    } else if (remoteError && fallbackResults.length > 0) {
      displayedSuggestions = fallbackResults
      isCuratedFallback = true
    }
  } else if (isFocused && !value && trimmedQuery.length === 0) {
    displayedSuggestions = POPULAR_LANDMARKS.map(landmarkToSuggestion)
    isCuratedFallback = true
  }

  const showDropdown =
    isOpen &&
    (isLoading ||
      displayedSuggestions.length > 0 ||
      (isSearchActive && !isLoading && remoteResults.length === 0))

  const handleSelectPlace = (place: PlaceSuggestion) => {
    onSelect({
      label: place.name,
      coordinates: [place.latitude, place.longitude],
      placeId: place.id,
      formattedAddress: place.formatted_address,
      source: place.source === 'curated' ? 'curated' : 'geoapify',
      category: place.category || undefined,
      locality: place.locality || undefined,
      landmarkId: place.source === 'curated' ? place.id : undefined,
    })
    setQuery(place.name)
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  const handleInputChange = (text: string) => {
    setQuery(text)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  const handleClear = () => {
    setQuery('')
    onClear()
    setIsOpen(false)
    setHighlightedIndex(-1)
    setRemoteResults([])
    setRemoteError(null)
    setFallbackResults([])
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < displayedSuggestions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : displayedSuggestions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && displayedSuggestions[highlightedIndex]) {
          handleSelectPlace(displayedSuggestions[highlightedIndex])
        } else if (displayedSuggestions.length === 1) {
          handleSelectPlace(displayedSuggestions[0])
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
      default:
        break
    }
  }

  const formatCoords = (coords: [number, number]): string => {
    return `${coords[0].toFixed(4)}° N, ${coords[1].toFixed(4)}° E`
  }

  return (
    <div
      ref={containerRef}
      className={`place-search-card ${isActiveTarget ? 'place-search-card-active' : ''}`}
      role="region"
      aria-label={`${label} place selection`}
    >
      <div className="search-card-header">
        <div className={`endpoint-badge endpoint-badge-${endpointType}`}>
          <span className="badge-letter">{tagLetter}</span>
          <span className="badge-name">{label}</span>
        </div>

        <button
          type="button"
          className={`btn-map-pin-toggle ${isActiveTarget ? 'btn-map-pin-active' : ''}`}
          onClick={onActivateTarget}
          title={isActiveTarget ? 'Map click will update this pin' : 'Click to select this location on map'}
          aria-pressed={isActiveTarget}
        >
          <span className="pin-toggle-icon" aria-hidden="true">
            <IconTarget size={16} />
          </span>
          <span>{isActiveTarget ? 'Map Target Active' : 'Pick on Map'}</span>
        </button>
      </div>

      <div className="search-input-container">
        <div className="search-input-wrapper">
          <span className="search-icon" aria-hidden="true">
            <IconSearch size={16} />
          </span>
          <input
            ref={inputRef}
            id={id}
            type="text"
            className="place-search-input"
            value={query}
            placeholder={placeholder}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              setIsOpen(true)
            }}
            onBlur={() => {
              setIsFocused(false)
            }}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-controls={showDropdown ? listboxId : undefined}
            aria-expanded={showDropdown}
            aria-label={`${label} search input`}
            autoComplete="off"
            spellCheck="false"
          />

          {isLoading && (
            <span className="search-loading-spinner" aria-label="Loading search results" />
          )}

          {(value || query) && (
            <button
              type="button"
              className="btn-search-clear"
              onClick={handleClear}
              title={`Clear ${label.toLowerCase()}`}
              aria-label={`Clear ${label.toLowerCase()} location`}
            >
              <IconClose size={14} />
            </button>
          )}
        </div>

        {/* Suggestion Dropdown */}
        {showDropdown && (
          <div id={listboxId} className="search-suggestions-dropdown" role="listbox">
            {isLoading ? (
              <div className="suggestion-status-notice">
                <span className="status-spinner-small" aria-hidden="true" />
                <span>Searching places via Geoapify...</span>
              </div>
            ) : displayedSuggestions.length > 0 ? (
              <>
                {/* Section headers distinguishing sources */}
                {!isSearchActive && (
                  <div className="dropdown-section-label">Popular Navi Mumbai Transit Hubs</div>
                )}
                {isSearchActive && isCuratedFallback && (
                  <div className="dropdown-section-label label-fallback">
                    Curated Local Landmarks (Fallback)
                  </div>
                )}
                {isSearchActive && !isCuratedFallback && (
                  <div className="dropdown-section-label label-provider">
                    Search Results (Geoapify)
                  </div>
                )}

                {displayedSuggestions.map((place, index) => {
                  const isHighlighted = index === highlightedIndex
                  return (
                    <div
                      key={place.id || `${place.latitude}-${place.longitude}-${index}`}
                      className={`suggestion-item ${isHighlighted ? 'suggestion-highlighted' : ''}`}
                      role="option"
                      aria-selected={isHighlighted}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelectPlace(place)
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <div className="suggestion-icon" aria-hidden="true">
                        <IconPin size={16} />
                      </div>
                      <div className="suggestion-info">
                        <div className="suggestion-title-row">
                          <span className="suggestion-name">{place.name}</span>
                          <span
                            className={`suggestion-source-badge ${
                              place.source === 'curated' ? 'badge-curated' : 'badge-geoapify'
                            }`}
                          >
                            {place.source === 'curated' ? 'Curated Fallback' : 'Geoapify'}
                          </span>
                        </div>
                        <span className="suggestion-meta">
                          {place.formatted_address || place.locality || ''}
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* Attribution link required by Geoapify */}
                <div className="dropdown-attribution">
                  <span>Search powered by </span>
                  <a
                    href="https://www.geoapify.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="attribution-link"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    Geoapify
                  </a>
                  <span> | © </span>
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="attribution-link"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    OpenStreetMap
                  </a>
                  <span> contributors</span>
                </div>
              </>
            ) : remoteError ? (
              <div className="suggestion-empty-state state-error">
                <span className="empty-state-title">⚠️ Remote Search Unavailable</span>
                <span className="empty-state-desc">{remoteError}</span>
                <span className="empty-state-hint">
                  No matching curated landmarks found. Click anywhere on the map to pin coordinates directly.
                </span>
              </div>
            ) : (
              <div className="suggestion-empty-state">
                <span className="empty-state-title">
                  No places matching &ldquo;{trimmedQuery}&rdquo;
                </span>
                <span className="empty-state-hint">
                  Provider returned no matching results. Click anywhere on the map to pin coordinates directly.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected location coordinates caption */}
      <div className="search-card-footer">
        {value ? (
          <div className="selected-meta">
            <span className="meta-coords">{formatCoords(value.coordinates)}</span>
            {value.source === 'geoapify' ? (
              <span className="meta-tag meta-tag-geoapify">Geoapify Place</span>
            ) : value.source === 'curated' || value.landmarkId ? (
              <span className="meta-tag meta-tag-curated">Curated Landmark</span>
            ) : (
              <span className="meta-tag meta-tag-map">Pinned Map Coordinate</span>
            )}
          </div>
        ) : (
          <span className="search-hint-text">
            {isActiveTarget ? '🎯 Click map to pin location' : 'Type to search or click "Pick on Map"'}
          </span>
        )}
      </div>
    </div>
  )
}

export default PlaceSearchInput
