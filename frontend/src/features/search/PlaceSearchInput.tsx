import { useEffect, useId, useRef, useState } from 'react'
import type { FC, KeyboardEvent } from 'react'
import type { RouteEndpointType, SelectedLocation } from '../../types'
import { POPULAR_LANDMARKS, searchLandmarks } from './landmarks'
import type { Landmark } from './landmarks'
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

export const PlaceSearchInput: FC<PlaceSearchInputProps> = ({
  id,
  endpointType,
  label,
  tagLetter,
  placeholder = 'Search landmark or click map...',
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

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  // Sync displayed query text when external value changes (e.g. map click, swap, clear)
  useEffect(() => {
    setQuery(value ? value.label : '')
  }, [value])

  // Compute suggestions based on query
  const trimmedQuery = query.trim()
  const isSearchActive = trimmedQuery.length > 0 && (!value || value.label !== query)
  const suggestions = isSearchActive
    ? searchLandmarks(trimmedQuery, 6)
    : isFocused && !value
    ? [...POPULAR_LANDMARKS]
    : []

  const showDropdown = isOpen && (suggestions.length > 0 || (isSearchActive && suggestions.length === 0))

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

  const handleSelectLandmark = (landmark: Landmark) => {
    onSelect({
      label: landmark.name,
      coordinates: landmark.coordinates,
      landmarkId: landmark.id,
    })
    setQuery(landmark.name)
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
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelectLandmark(suggestions[highlightedIndex])
        } else if (suggestions.length === 1) {
          handleSelectLandmark(suggestions[0])
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
          <span className="pin-toggle-icon" aria-hidden="true">🎯</span>
          <span>{isActiveTarget ? 'Map Target Active' : 'Pick on Map'}</span>
        </button>
      </div>

      <div className="search-input-container">
        <div className="search-input-wrapper">
          <span className="search-icon" aria-hidden="true">🔍</span>
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

          {(value || query) && (
            <button
              type="button"
              className="btn-search-clear"
              onClick={handleClear}
              title={`Clear ${label.toLowerCase()}`}
              aria-label={`Clear ${label.toLowerCase()} location`}
            >
              ✕
            </button>
          )}
        </div>

        {/* Suggestion Dropdown */}
        {showDropdown && (
          <div id={listboxId} className="search-suggestions-dropdown" role="listbox">
            {suggestions.length > 0 ? (
              <>
                {!isSearchActive && (
                  <div className="dropdown-section-label">Popular Navi Mumbai Transit Hubs</div>
                )}
                {suggestions.map((landmark, index) => {
                  const isHighlighted = index === highlightedIndex
                  return (
                    <div
                      key={landmark.id}
                      className={`suggestion-item ${isHighlighted ? 'suggestion-highlighted' : ''}`}
                      role="option"
                      aria-selected={isHighlighted}
                      onMouseDown={(e) => {
                        // Prevent input blur before click registers
                        e.preventDefault()
                        handleSelectLandmark(landmark)
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <div className="suggestion-icon" aria-hidden="true">📍</div>
                      <div className="suggestion-info">
                        <span className="suggestion-name">{landmark.name}</span>
                        <span className="suggestion-meta">
                          {landmark.locality} &bull; {landmark.category}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </>
            ) : (
              <div className="suggestion-empty-state">
                <span>No landmarks matching &ldquo;{trimmedQuery}&rdquo;</span>
                <span className="empty-state-hint">Click anywhere on the map to pin coordinates.</span>
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
            {value.landmarkId && <span className="meta-tag">Verified Landmark</span>}
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
