/**
 * Curated Navi Mumbai landmark directory for client-side search.
 * Verified coordinates snapped to navigable road network for OSRM route compatibility.
 */
// ponytail: local static directory; 0 external API calls, 0 network latency, 100% testable
export interface Landmark {
  id: string
  name: string
  locality: string
  category: string
  coordinates: [number, number] // [lat, lng]
  aliases?: string[]
}

export const NAVI_MUMBAI_LANDMARKS: readonly Landmark[] = [
  {
    id: 'vashi-stn',
    name: 'Vashi Railway Station',
    locality: 'Vashi',
    category: 'Transit Hub',
    coordinates: [19.0645, 72.9983],
    aliases: ['Vashi Station', 'Vashi Stn', 'Vashi Local'],
  },
  {
    id: 'vashi-sec17',
    name: 'Vashi Sector 17',
    locality: 'Vashi',
    category: 'Commercial',
    coordinates: [19.0760, 72.9985],
    aliases: ['Sector 17 Vashi', 'Vashi Plaza', 'Sector 17', 'Sec 17', 'Vashi Sec 17'],
  },
  {
    id: 'apmc-market',
    name: 'APMC Market',
    locality: 'Vashi',
    category: 'Commercial',
    coordinates: [19.0754, 73.0076],
    aliases: ['Vashi APMC', 'Dana Bandar Navi Mumbai', 'Grain Market'],
  },
  {
    id: 'sanpada-stn',
    name: 'Sanpada Railway Station',
    locality: 'Sanpada',
    category: 'Transit Hub',
    coordinates: [19.0655, 73.0108],
    aliases: ['Sanpada Station'],
  },
  {
    id: 'palm-beach-moraj',
    name: 'Palm Beach Road (Moraj Circle)',
    locality: 'Sanpada',
    category: 'Arterial Corridor',
    coordinates: [19.0635, 73.0062],
    aliases: ['Moraj Circle', 'Palm Beach Road Entry'],
  },
  {
    id: 'turbhe-naka',
    name: 'Turbhe Naka',
    locality: 'Turbhe',
    category: 'Junction',
    coordinates: [19.0620, 73.0180],
    aliases: ['Turbhe Circle', 'Turbhe Naka Junction'],
  },
  {
    id: 'turbhe-stn',
    name: 'Turbhe Railway Station',
    locality: 'Turbhe',
    category: 'Transit Hub',
    coordinates: [19.0736, 73.0125],
    aliases: ['Turbhe Station', 'Turbhe MIDC'],
  },
  {
    id: 'juinagar-stn',
    name: 'Juinagar Railway Station',
    locality: 'Juinagar',
    category: 'Transit Hub',
    coordinates: [19.0556, 73.0182],
    aliases: ['Juinagar Station'],
  },
  {
    id: 'nerul-stn',
    name: 'Nerul Railway Station',
    locality: 'Nerul',
    category: 'Transit Hub',
    coordinates: [19.0336, 73.0163],
    aliases: ['Nerul Station', 'Nerul LP'],
  },
  {
    id: 'dy-patil-stadium',
    name: 'DY Patil Stadium',
    locality: 'Nerul',
    category: 'Landmark',
    coordinates: [19.0435, 73.0255],
    aliases: ['DY Patil Sports Stadium', 'Nerul Stadium'],
  },
  {
    id: 'seawoods-stn',
    name: 'Seawoods–Darave Railway Station',
    locality: 'Seawoods',
    category: 'Transit Hub',
    coordinates: [19.0215, 73.0177],
    aliases: ['Seawoods Grand Central', 'Seawoods Station', 'Darave'],
  },
  {
    id: 'belapur-stn',
    name: 'CBD Belapur Railway Station',
    locality: 'CBD Belapur',
    category: 'Transit Hub',
    coordinates: [19.0185, 73.0385],
    aliases: ['Belapur Station', 'CBD Belapur Stn', 'Belapur Local'],
  },
  {
    id: 'belapur-cbd',
    name: 'Belapur CBD (Konkan Bhavan)',
    locality: 'CBD Belapur',
    category: 'Civic & Commercial',
    coordinates: [19.0178, 73.0416],
    aliases: ['Konkan Bhavan', 'Belapur Sector 11', 'CIDCO Bhavan'],
  },
  {
    id: 'kharghar-stn',
    name: 'Kharghar Railway Station',
    locality: 'Kharghar',
    category: 'Transit Hub',
    coordinates: [19.0256, 73.0645],
    aliases: ['Kharghar Station', 'Hiranandani Kharghar Link'],
  },
  {
    id: 'kharghar-utsav',
    name: 'Kharghar Utsav Chowk',
    locality: 'Kharghar',
    category: 'Landmark',
    coordinates: [19.0375, 73.0682],
    aliases: ['Utsav Chowk', 'Kharghar Circle', 'Shilp Chowk Vicinity'],
  },
  {
    id: 'kopar-khairane-stn',
    name: 'Kopar Khairane Railway Station',
    locality: 'Kopar Khairane',
    category: 'Transit Hub',
    coordinates: [19.0968, 73.0094],
    aliases: ['Kopar Khairane Stn', 'Koparkhairane'],
  },
  {
    id: 'ghansoli-stn',
    name: 'Ghansoli Railway Station',
    locality: 'Ghansoli',
    category: 'Transit Hub',
    coordinates: [19.1245, 73.0042],
    aliases: ['Ghansoli Station', 'Reliance Corporate Park Area'],
  },
  {
    id: 'rabale-stn',
    name: 'Rabale Railway Station',
    locality: 'Rabale',
    category: 'Transit Hub',
    coordinates: [19.1386, 73.0028],
    aliases: ['Rabale Station', 'Rabale MIDC'],
  },
  {
    id: 'airoli-stn',
    name: 'Airoli Railway Station',
    locality: 'Airoli',
    category: 'Transit Hub',
    coordinates: [19.1578, 72.9975],
    aliases: ['Airoli Station'],
  },
  {
    id: 'airoli-toll',
    name: 'Airoli Bridge / Mulund Link',
    locality: 'Airoli',
    category: 'Highway Connection',
    coordinates: [19.1550, 72.9920],
    aliases: ['Airoli Toll', 'Airoli Creek Bridge', 'Mulund Airoli Link'],
  },
]

/**
 * Searches curated landmarks by case-insensitive partial substring matching.
 * Matches name, locality, category, and aliases.
 * Prioritizes prefix matches over general substring matches.
 */
export function searchLandmarks(query: string, limit = 6): Landmark[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return []
  }

  const tokens = q.split(/\s+/).filter(Boolean)
  const prefixMatches: Landmark[] = []
  const otherMatches: Landmark[] = []

  for (const landmark of NAVI_MUMBAI_LANDMARKS) {
    const nameLower = landmark.name.toLowerCase()
    const localityLower = landmark.locality.toLowerCase()
    const categoryLower = landmark.category.toLowerCase()
    const allSearchable = [
      nameLower,
      localityLower,
      categoryLower,
      ...(landmark.aliases?.map((alias) => alias.toLowerCase()) ?? []),
    ].join(' ')

    if (nameLower.startsWith(q) || localityLower.startsWith(q)) {
      prefixMatches.push(landmark)
    } else if (
      allSearchable.includes(q) ||
      (tokens.length > 1 && tokens.every((token) => allSearchable.includes(token)))
    ) {
      otherMatches.push(landmark)
    }
  }

  return [...prefixMatches, ...otherMatches].slice(0, limit)
}

/**
 * Look up landmark by unique ID.
 */
export function getLandmarkById(id: string): Landmark | undefined {
  return NAVI_MUMBAI_LANDMARKS.find((l) => l.id === id)
}

/**
 * Common popular transit nodes suggested when search input is focused with empty query.
 */
export const POPULAR_LANDMARKS: readonly Landmark[] = [
  NAVI_MUMBAI_LANDMARKS[0], // Vashi Stn
  NAVI_MUMBAI_LANDMARKS[11], // CBD Belapur Stn
  NAVI_MUMBAI_LANDMARKS[13], // Kharghar Stn
  NAVI_MUMBAI_LANDMARKS[18], // Airoli Stn
]
