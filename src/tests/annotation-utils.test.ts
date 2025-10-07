import { describe, expect, it } from 'vitest'
import {
  buildAnnotationMessage,
  mergeAnnotationDescription,
  stripLorgAnnotation,
} from '../../netlify/functions/utils/annotation'

describe('buildAnnotationMessage', () => {
  it('formats miles by default', () => {
    const message = buildAnnotationMessage({ novelMeters: 482.803, measurementPref: 'imperial' })
    expect(message).toBe('🗺️ Explored 0.3 new miles\n-- via Lorg')
  })

  it('formats kilometers for metric preference', () => {
    const message = buildAnnotationMessage({ novelMeters: 1234.5, measurementPref: 'meters' })
    expect(message).toBe('🗺️ Explored 1.2 new kilometers\n-- via Lorg')
  })

  it('appends new places when provided', () => {
    const message = buildAnnotationMessage({
      novelMeters: 3000,
      measurementPref: 'imperial',
      places: [
        { name: 'Glasgow', placeType: 'city' },
        { name: 'Falkirk', placeType: 'city' },
        { name: 'Edinburgh', placeType: 'city' },
        { name: 'Aberdeen', placeType: 'city' },
      ],
    })
    expect(message).toBe(
      '🗺️ Explored 1.9 new miles\n📍 New Places: Glasgow, Falkirk, Edinburgh, +1 more\n-- via Lorg',
    )
  })

  it('returns empty string when no distance and no places', () => {
    const message = buildAnnotationMessage({
      novelMeters: 0,
      measurementPref: 'imperial',
      places: [],
    })
    expect(message).toBe('')
  })

  it('includes places even without new distance', () => {
    const message = buildAnnotationMessage({
      novelMeters: 0,
      measurementPref: 'imperial',
      places: [{ name: 'Loch Ness', placeType: 'lake' }],
    })
    expect(message).toBe('📍 New Places: Loch Ness\n-- via Lorg')
  })
})

describe('mergeAnnotationDescription', () => {
  it('appends annotation when none exists', () => {
    const { description, unchanged } = mergeAnnotationDescription(
      '',
      '🗺️ Explored 0.5 new miles\n-- via Lorg',
    )
    expect(description).toBe('🗺️ Explored 0.5 new miles\n-- via Lorg')
    expect(unchanged).toBe(false)
  })

  it('replaces existing Lorg annotation', () => {
    const base = 'Today was fun.\n\n🗺️ Explored 0.2 new miles\n-- via Lorg'
    const next = mergeAnnotationDescription(base, '🗺️ Explored 0.7 new miles\n-- via Lorg')
    expect(next.description).toBe('Today was fun.\n\n🗺️ Explored 0.7 new miles\n-- via Lorg')
    expect(next.unchanged).toBe(false)
  })

  it('handles legacy unlocked annotation', () => {
    const base = '🗺️ Unlocked 0.3 new miles in Lorg\n\nGreat ride!'
    const next = mergeAnnotationDescription(base, '🗺️ Explored 0.8 new miles\n-- via Lorg')
    expect(next.description).toBe('Great ride!\n\n🗺️ Explored 0.8 new miles\n-- via Lorg')
  })

  it('marks unchanged when annotation identical', () => {
    const annotation = '🗺️ Explored 0.5 new miles\n-- via Lorg'
    const base = `Intro paragraph\n\n${annotation}`
    const next = mergeAnnotationDescription(base, annotation)
    expect(next.description).toBe(base)
    expect(next.unchanged).toBe(true)
  })
})

describe('stripLorgAnnotation', () => {
  it('removes both unlocked and explored paragraphs', () => {
    const input =
      '🗺️ Unlocked 0.2 new miles in Lorg\n\nNotes\n\n🗺️ Explored 0.4 new miles\n-- via Lorg'
    expect(stripLorgAnnotation(input)).toBe('Notes')
  })
})
