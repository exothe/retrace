/** All user-facing UI strings (German), SPEC section 10.1. */
export const strings = {
  appTitle: "Retrace",
  loading: "Wird geladen …",
  retry: "Erneut versuchen",

  tripListTitle: "Reisen",
  noTrips: "Noch keine Reisen vorhanden.",
  indexLoadError: "Die Liste der Reisen konnte nicht geladen werden.",
  tripLoadError: "Diese Reise konnte nicht geladen werden.",
  tripNotFound: "Diese Reise gibt es nicht.",
  dayNotFound: "Diesen Tag gibt es in dieser Reise nicht.",
  pageNotFound: "Diese Seite gibt es nicht.",
  loadErrorDetail: (status: string) => `Fehler: ${status}`,
  networkError: "Keine Verbindung zum Server.",
  unsupportedData: "Die Daten sind in einem unbekannten Format. Bitte den Viewer aktualisieren.",

  backToTrips: "Alle Reisen",
  backToDays: "Alle Tage",
  previousDay: "Vorheriger Tag",
  nextDay: "Nächster Tag",

  days: (n: number) => (n === 1 ? "1 Tag" : `${n} Tage`),
  photos: (n: number) => (n === 1 ? "1 Foto" : `${n} Fotos`),
  videos: (n: number) => (n === 1 ? "1 Video" : `${n} Videos`),
  tracks: (n: number) => (n === 1 ? "1 Strecke" : `${n} Strecken`),
  hasTrack: "Mit GPS-Strecke",

  mediaOnlyBadge: "Nur Fotos",
  mediaOnlyNote: "Für diesen Tag gibt es keine Notizen.",
  beforeFirstEntry: "Vor dem ersten Eintrag",
  noMediaYet: "Keine Fotos oder Videos",

  photoAlt: (time: string) => `Foto um ${time} Uhr`,
  videoAlt: (time: string, duration: string) => `Video um ${time} Uhr, ${duration}`,
  openMedia: (alt: string) => `${alt} öffnen`,
  timeSuffix: "Uhr",
} as const;
