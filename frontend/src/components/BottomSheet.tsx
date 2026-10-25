import { useEffect, useRef } from 'react'
import type { FC, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import './BottomSheet.css'

export type SheetSnapState = 'peek' | 'half' | 'full'

export interface BottomSheetProps {
  snapState: SheetSnapState
  onSnapChange: (state: SheetSnapState) => void
  children: ReactNode
  className?: string
  id?: string
  'aria-label'?: string
}

export const BottomSheet: FC<BottomSheetProps> = ({
  snapState,
  onSnapChange,
  children,
  className = '',
  id = 'varsha-bottom-sheet',
  'aria-label': ariaLabel = 'Route Planner',
}) => {
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const currentDeltaYRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Escape key collapses sheet to peek on mobile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && snapState !== 'peek') {
        onSnapChange('peek')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [snapState, onSnapChange])

  // Handle on-screen keyboard via window.visualViewport to keep focused input and CTA visible
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return

    const vv = window.visualViewport

    const handleViewportChange = () => {
      if (!sheetRef.current) return
      // When visual viewport height is noticeably smaller than innerHeight, on-screen keyboard is open
      const isKeyboardOpen = window.innerHeight - vv.height > 120
      if (isKeyboardOpen) {
        sheetRef.current.style.maxHeight = `${vv.height}px`
        const activeEl = document.activeElement
        if (
          activeEl &&
          sheetRef.current.contains(activeEl) &&
          (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)
        ) {
          if (snapState !== 'full') {
            onSnapChange('full')
          }
          setTimeout(() => {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 60)
        }
      } else {
        sheetRef.current.style.removeProperty('max-height')
      }
    }

    vv.addEventListener('resize', handleViewportChange)
    vv.addEventListener('scroll', handleViewportChange)
    return () => {
      vv.removeEventListener('resize', handleViewportChange)
      vv.removeEventListener('scroll', handleViewportChange)
    }
  }, [snapState, onSnapChange])

  // Tap or keyboard on handle toggles state
  const handleHandleClick = () => {
    if (snapState === 'peek') {
      onSnapChange('half')
    } else if (snapState === 'half') {
      onSnapChange('full')
    } else {
      onSnapChange('peek')
    }
  }

  const handleHandleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleHandleClick()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onSnapChange('peek')
    }
  }

  // Pointer drag events on the handle
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only primary button
    if (e.button !== 0) return
    isDraggingRef.current = true
    startYRef.current = e.clientY
    currentDeltaYRef.current = 0
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    currentDeltaYRef.current = e.clientY - startYRef.current
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Ignore if not supported or not captured
    }

    const deltaY = currentDeltaYRef.current
    // Tap detection: less than 6px movement
    if (Math.abs(deltaY) < 6) {
      handleHandleClick()
      return
    }

    // Drag gestures: negative deltaY = drag UP; positive deltaY = drag DOWN
    if (snapState === 'peek') {
      if (deltaY < -120) {
        onSnapChange('full')
      } else if (deltaY < -25) {
        onSnapChange('half')
      }
    } else if (snapState === 'half') {
      if (deltaY < -30) {
        onSnapChange('full')
      } else if (deltaY > 30) {
        onSnapChange('peek')
      }
    } else if (snapState === 'full') {
      if (deltaY > 120) {
        onSnapChange('peek')
      } else if (deltaY > 30) {
        onSnapChange('half')
      }
    }
  }

  // Focusing an input inside the sheet expands to full on mobile
  const handleFocusCapture = (e: React.FocusEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      if (snapState !== 'full') {
        onSnapChange('full')
      }
    }
  }

  return (
    <div
      ref={sheetRef}
      id={id}
      className={`bottom-sheet snap-${snapState} ${className}`}
      role="region"
      aria-label={ariaLabel}
      onFocusCapture={handleFocusCapture}
    >
      <div
        className="bottom-sheet-handle-area"
        role="button"
        tabIndex={0}
        aria-label="Toggle route planner sheet"
        aria-expanded={snapState !== 'peek'}
        onClick={handleHandleClick}
        onKeyDown={handleHandleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span className="bottom-sheet-handle-bar" aria-hidden="true" />
      </div>

      <div className="bottom-sheet-content">
        {children}
      </div>
    </div>
  )
}

export default BottomSheet
