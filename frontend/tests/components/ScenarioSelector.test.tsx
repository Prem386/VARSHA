import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ScenarioSelector } from '../../src/features/scenarios/ScenarioSelector.tsx'
import {
  DEFAULT_SCENARIO_ID,
  ALL_CLEAR_EXPLANATION,
  SYNTHETIC_SCENARIO_NOTICE,
  type DemoScenarioId,
} from '../../src/features/scenarios/scenarios.ts'

// Ensure clean DOM between tests
afterEach(() => {
  cleanup()
})

// Helper component for testing interactive state transitions
function InteractiveScenarioSelector({
  initialScenarioId = DEFAULT_SCENARIO_ID,
  onSelect,
}: {
  initialScenarioId?: DemoScenarioId
  onSelect?: (id: DemoScenarioId) => void
}) {
  const [selectedId, setSelectedId] = useState<DemoScenarioId>(initialScenarioId)

  const handleSelect = (id: DemoScenarioId) => {
    setSelectedId(id)
    onSelect?.(id)
  }

  return (
    <ScenarioSelector
      selectedScenarioId={selectedId}
      onSelectScenario={handleSelect}
    />
  )
}

describe('ScenarioSelector Component', () => {
  it('renders with baseline selected by default in standard usage contract', () => {
    render(
      <ScenarioSelector
        selectedScenarioId={DEFAULT_SCENARIO_ID}
        onSelectScenario={() => {}}
      />
    )

    const baselineRadio = screen.getByRole('radio', { name: 'Baseline' })
    expect(baselineRadio.getAttribute('aria-checked')).toBe('true')

    const radiogroup = screen.getByRole('radiogroup', {
      name: 'Select demo risk scenario',
    })
    expect(radiogroup).toBeTruthy()

    // Warning notice must not be visible on baseline
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders all four scenario options with accessible radio roles and labels', () => {
    render(
      <ScenarioSelector
        selectedScenarioId="baseline"
        onSelectScenario={() => {}}
      />
    )

    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(4)

    const expectedLabels = [
      'Baseline',
      'Flood on Highway',
      'Flood on West Bypass',
      'All Clear',
    ]

    expectedLabels.forEach((label) => {
      const option = screen.getByRole('radio', { name: label })
      expect(option).toBeTruthy()
    })
  })

  it('exposes correct accessible roles and checked states for active selection', () => {
    render(
      <ScenarioSelector
        selectedScenarioId="flood-highway"
        onSelectScenario={() => {}}
      />
    )

    const baselineRadio = screen.getByRole('radio', { name: 'Baseline' })
    const highwayRadio = screen.getByRole('radio', { name: 'Flood on Highway' })
    const westBypassRadio = screen.getByRole('radio', { name: 'Flood on West Bypass' })
    const allClearRadio = screen.getByRole('radio', { name: 'All Clear' })

    expect(baselineRadio.getAttribute('aria-checked')).toBe('false')
    expect(highwayRadio.getAttribute('aria-checked')).toBe('true')
    expect(westBypassRadio.getAttribute('aria-checked')).toBe('false')
    expect(allClearRadio.getAttribute('aria-checked')).toBe('false')
  })

  it('invokes callback with flood-highway when Flood on Highway is clicked', () => {
    const handleSelect = vi.fn()
    render(
      <ScenarioSelector
        selectedScenarioId="baseline"
        onSelectScenario={handleSelect}
      />
    )

    const highwayBtn = screen.getByRole('radio', { name: 'Flood on Highway' })
    fireEvent.click(highwayBtn)

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect).toHaveBeenCalledWith('flood-highway')
  })

  it('invokes callback with flood-west-bypass when Flood on West Bypass is clicked', () => {
    const handleSelect = vi.fn()
    render(
      <ScenarioSelector
        selectedScenarioId="baseline"
        onSelectScenario={handleSelect}
      />
    )

    const bypassBtn = screen.getByRole('radio', { name: 'Flood on West Bypass' })
    fireEvent.click(bypassBtn)

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect).toHaveBeenCalledWith('flood-west-bypass')
  })

  it('invokes callback with all-clear when All Clear is clicked', () => {
    const handleSelect = vi.fn()
    render(
      <ScenarioSelector
        selectedScenarioId="baseline"
        onSelectScenario={handleSelect}
      />
    )

    const allClearBtn = screen.getByRole('radio', { name: 'All Clear' })
    fireEvent.click(allClearBtn)

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect).toHaveBeenCalledWith('all-clear')
  })

  it('displays empty-dataset safety disclaimer when All Clear scenario is active', () => {
    render(
      <ScenarioSelector
        selectedScenarioId="all-clear"
        onSelectScenario={() => {}}
      />
    )

    // Hazard count badge must indicate 0 simulated hazards
    expect(screen.getByText('0 simulated hazards')).toBeTruthy()

    // Safety disclaimer explanation must be present in the notice
    const disclaimer = screen.getByText((content) =>
      content.includes(ALL_CLEAR_EXPLANATION)
    )
    expect(disclaimer).toBeTruthy()
  })

  it('displays synthetic-demo warning notice for non-baseline scenarios', () => {
    const { rerender } = render(
      <ScenarioSelector
        selectedScenarioId="flood-highway"
        onSelectScenario={() => {}}
      />
    )

    let notice = screen.getByRole('status')
    expect(notice).toBeTruthy()
    expect(screen.getByText(SYNTHETIC_SCENARIO_NOTICE)).toBeTruthy()

    rerender(
      <ScenarioSelector
        selectedScenarioId="flood-west-bypass"
        onSelectScenario={() => {}}
      />
    )

    notice = screen.getByRole('status')
    expect(notice).toBeTruthy()
    expect(screen.getByText(SYNTHETIC_SCENARIO_NOTICE)).toBeTruthy()
  })

  it('removes synthetic-demo warning notice when returning to baseline', () => {
    const { rerender } = render(
      <ScenarioSelector
        selectedScenarioId="flood-highway"
        onSelectScenario={() => {}}
      />
    )

    expect(screen.getByRole('status')).toBeTruthy()

    // Switch back to baseline
    rerender(
      <ScenarioSelector
        selectedScenarioId="baseline"
        onSelectScenario={() => {}}
      />
    )

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('manages full interactive cycle from default baseline to non-baseline and back', () => {
    render(<InteractiveScenarioSelector />)

    // Initially Baseline
    expect(
      screen.getByRole('radio', { name: 'Baseline' }).getAttribute('aria-checked')
    ).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()

    // Click Flood on Highway
    fireEvent.click(screen.getByRole('radio', { name: 'Flood on Highway' }))

    expect(
      screen.getByRole('radio', { name: 'Flood on Highway' }).getAttribute('aria-checked')
    ).toBe('true')
    expect(
      screen.getByRole('radio', { name: 'Baseline' }).getAttribute('aria-checked')
    ).toBe('false')
    expect(screen.getByRole('status')).toBeTruthy()

    // Click All Clear
    fireEvent.click(screen.getByRole('radio', { name: 'All Clear' }))
    expect(
      screen.getByRole('radio', { name: 'All Clear' }).getAttribute('aria-checked')
    ).toBe('true')
    expect(screen.getByText('0 simulated hazards')).toBeTruthy()
    expect(screen.getByText((c) => c.includes(ALL_CLEAR_EXPLANATION))).toBeTruthy()

    // Return to Baseline
    fireEvent.click(screen.getByRole('radio', { name: 'Baseline' }))
    expect(
      screen.getByRole('radio', { name: 'Baseline' }).getAttribute('aria-checked')
    ).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
