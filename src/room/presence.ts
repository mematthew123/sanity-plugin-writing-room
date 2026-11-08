const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Someone'

/** "Sam is here too", "Sam and Alex are here too", "Sam and 2 others are here too". */
export function presenceSentence(names: string[]): string | null {
  const [first, second, ...rest] = names.map(firstName)
  if (!first) return null
  if (!second) return `${first} is here too`
  if (rest.length === 0) return `${first} and ${second} are here too`
  return `${first} and ${rest.length + 1} others are here too`
}
