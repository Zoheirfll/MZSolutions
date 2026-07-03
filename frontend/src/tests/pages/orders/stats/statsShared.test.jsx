import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePeriod } from '../../../../pages/orders/stats/statsShared'

describe('usePeriod', () => {
  it('defaults to "week" and produces the matching query string', () => {
    const { result } = renderHook(() => usePeriod())
    expect(result.current.period).toBe('week')
    expect(result.current.queryString()).toBe('period=week')
    expect(result.current.ready).toBe(true)
  })

  it('produces the expected query string for day/month', () => {
    const { result } = renderHook(() => usePeriod())

    act(() => result.current.setPeriod('day'))
    expect(result.current.queryString()).toBe('period=day')

    act(() => result.current.setPeriod('month'))
    expect(result.current.queryString()).toBe('period=month')
  })

  it('is not "ready" for custom period until both dates are set, then includes date_from/date_to', () => {
    const { result } = renderHook(() => usePeriod())

    act(() => result.current.setPeriod('custom'))
    expect(result.current.ready).toBeFalsy()
    // no dates yet: date_from/date_to must not leak into the query string
    expect(result.current.queryString()).toBe('period=custom')

    act(() => result.current.setDateFrom('2026-01-01'))
    expect(result.current.ready).toBeFalsy()
    expect(result.current.queryString()).toBe('period=custom')

    act(() => result.current.setDateTo('2026-01-31'))
    expect(result.current.ready).toBeTruthy()
    expect(result.current.queryString()).toBe('period=custom&date_from=2026-01-01&date_to=2026-01-31')
  })

  // Regression test for the documented Epic 8.1 bug: queryString used to be
  // recreated on every render with a new function identity, which broke the
  // useCallback dependency array of the pages calling it and caused an
  // infinite fetch loop. queryString is now memoized with useCallback on
  // (period, dateFrom, dateTo) — its reference must stay stable across
  // re-renders that don't change those three values.
  it('keeps a stable queryString function reference across unrelated re-renders', () => {
    const { result, rerender } = renderHook(() => usePeriod())
    const firstRef = result.current.queryString

    rerender()
    expect(result.current.queryString).toBe(firstRef)

    rerender()
    expect(result.current.queryString).toBe(firstRef)
  })

  it('changes the queryString reference only when period/dateFrom/dateTo actually change', () => {
    const { result } = renderHook(() => usePeriod())
    const weekRef = result.current.queryString

    act(() => result.current.setPeriod('day'))
    const dayRef = result.current.queryString
    expect(dayRef).not.toBe(weekRef)

    // setting the same value again should not produce yet another reference
    act(() => result.current.setPeriod('day'))
    expect(result.current.queryString).toBe(dayRef)
  })
})
