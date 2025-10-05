import { describe, expect, it } from 'vitest'
import {
  buildAnnotationMessage,
  mergeAnnotationDescription,
  stripLorgAnnotation,
} from '../../netlify/functions/utils/annotation'

describe('buildAnnotationMessage', () => {
  it('formats miles by default', () => {
    const message = buildAnnotationMessage({ novelMeters: 482.803, measurementPref: 'imperial' })
    expect(message).toBe('🗺️ Explored 0.3 new miles in Lorg')
  })

  it('formats kilometers for metric preference', () => {
    const message = buildAnnotationMessage({ novelMeters: 1234.5, measurementPref: 'meters' })
    expect(message).toBe('🗺️ Explored 1.2 new kilometers in Lorg')
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
      '🗺️ Explored 1.9 new miles in Lorg. 📍 New places: Glasgow, Falkirk, Edinburgh, +1 more',
    )
  })
})

describe('mergeAnnotationDescription', () => {
  it('appends annotation when none exists', () => {
    const { description, unchanged } = mergeAnnotationDescription(
      '',
      '🗺️ Explored 0.5 new miles in Lorg',
    )
    expect(description).toBe('🗺️ Explored 0.5 new miles in Lorg')
    expect(unchanged).toBe(false)
  })

  it('replaces existing Lorg annotation', () => {
    const base = 'Today was fun.\n\n🗺️ Explored 0.2 new miles in Lorg'
    const next = mergeAnnotationDescription(base, '🗺️ Explored 0.7 new miles in Lorg')
    expect(next.description).toBe('Today was fun.\n\n🗺️ Explored 0.7 new miles in Lorg')
    expect(next.unchanged).toBe(false)
  })

  it('handles legacy unlocked annotation', () => {
    const base = '🗺️ Unlocked 0.3 new miles in Lorg\n\nGreat ride!'
    const next = mergeAnnotationDescription(base, '🗺️ Explored 0.8 new miles in Lorg')
    expect(next.description).toBe('Great ride!\n\n🗺️ Explored 0.8 new miles in Lorg')
  })

  it('marks unchanged when annotation identical', () => {
    const annotation = '🗺️ Explored 0.5 new miles in Lorg'
    const base = `Intro paragraph\n\n${annotation}`
    const next = mergeAnnotationDescription(base, annotation)
    expect(next.description).toBe(base)
    expect(next.unchanged).toBe(true)
  })
})

describe('stripLorgAnnotation', () => {
  it('removes both unlocked and explored paragraphs', () => {
    const input = '🗺️ Unlocked 0.2 new miles in Lorg\n\nNotes\n\n🗺️ Explored 0.4 new miles in Lorg'
    expect(stripLorgAnnotation(input)).toBe('Notes')
  })
})
