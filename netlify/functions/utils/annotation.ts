export type AnnotationPlace = {
  name: string
  placeType: string
}

type BuildMessageOptions = {
  novelMeters: number
  measurementPref?: string | null
  places?: AnnotationPlace[]
}

export const buildAnnotationMessage = ({
  novelMeters,
  measurementPref,
  places = [],
}: BuildMessageOptions): string => {
  const pref = measurementPref?.toLowerCase()
  const distanceText =
    pref === 'meters'
      ? `${(novelMeters / 1000).toFixed(1)} new kilometers`
      : `${(novelMeters / 1609.34).toFixed(1)} new miles`

  let message = `🗺️ Explored ${distanceText} in Lorg`
  if (places.length) {
    const maxNames = 3
    const names = places.map((place) => place.name)
    const headline = names.slice(0, maxNames).join(', ')
    const extras = names.length > maxNames ? `, +${names.length - maxNames} more` : ''
    message += `. 📍 New places: ${headline}${extras}`
  }
  return message
}

const isLorgAnnotationParagraph = (paragraph: string): boolean => {
  const normalized = paragraph.trimStart()
  return normalized.startsWith('🗺️ Unlocked ') || normalized.startsWith('🗺️ Explored ')
}

export const stripLorgAnnotation = (description: string): string => {
  const paragraphs = description.split(/\n{2,}/).map((p) => p.trim())
  const kept = paragraphs.filter((para) => para && !isLorgAnnotationParagraph(para))
  return kept.join('\n\n').trim()
}

export const mergeAnnotationDescription = (
  existingDescription: string,
  annotation: string,
): { description: string; unchanged: boolean } => {
  const base = stripLorgAnnotation(existingDescription).trim()
  const finalDescription = base ? `${base}\n\n${annotation}` : annotation
  const unchanged = existingDescription.trim() === finalDescription.trim()
  return { description: finalDescription, unchanged }
}
