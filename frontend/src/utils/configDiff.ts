export type CmpRow = { label: string; values: (string | null)[]; differs: boolean }

export function sectionLabel(key: string) {
  return key.replace(/^_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function findIdentityKey(items: any[]): string | null {
  if (!items.length || typeof items[0] !== 'object') return null
  for (const k of ['_Name', '_name', 'name', '_No_', '_no', 'no', 'id', '_id', '_Index', '_index']) {
    if (k in items[0]) return k
  }
  return null
}

export function buildRows(section: string, columnIds: string[], configs: Record<string, any>): CmpRow[] {
  const rows: CmpRow[] = []
  const perDevice = columnIds.map(id => configs[id] ?? null)
  const first = perDevice.find(d => d !== null && d !== undefined)
  if (first === null || first === undefined) return rows

  if (Array.isArray(first)) {
    const identityKey = findIdentityKey(first)

    if (identityKey) {
      const allIds: string[] = []
      const seen = new Set<string>()
      perDevice.forEach(d => {
        if (!Array.isArray(d)) return
        d.forEach(item => {
          const v = String(item[identityKey] ?? '—')
          if (!seen.has(v)) { seen.add(v); allIds.push(v) }
        })
      })

      for (const idVal of allIds) {
        const itemsPerDevice = perDevice.map(d =>
          Array.isArray(d) ? (d.find(item => String(item[identityKey] ?? '—') === idVal) ?? null) : null
        )

        if (itemsPerDevice.some(item => item === null)) {
          rows.push({
            label: `${idVal}  ·  (exists)`,
            values: itemsPerDevice.map(item => item === null ? null : '✓'),
            differs: true,
          })
        }

        const fieldNames: string[] = []
        const fieldSeen = new Set<string>()
        itemsPerDevice.forEach(item => {
          if (!item) return
          Object.entries(item).forEach(([k, v]) => {
            if (k === identityKey || fieldSeen.has(k)) return
            if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return
            fieldSeen.add(k); fieldNames.push(k)
          })
        })

        for (const field of fieldNames) {
          const values = itemsPerDevice.map(item =>
            item === null ? null : (item[field] == null ? '—' : String(item[field]))
          )
          const differs = new Set(values.map(v => v ?? '(missing)')).size > 1
          rows.push({ label: `${idVal}  ·  ${sectionLabel(field)}`, values, differs })
        }
      }
    } else {
      const maxLen = Math.max(...perDevice.map(d => Array.isArray(d) ? d.length : 0))
      for (let i = 0; i < maxLen; i++) {
        const values = perDevice.map(d =>
          Array.isArray(d) && d[i] != null
            ? (typeof d[i] === 'object' ? JSON.stringify(d[i]) : String(d[i]))
            : null
        )
        const differs = new Set(values.map(v => v ?? '(missing)')).size > 1
        rows.push({ label: `[${i}]`, values, differs })
      }
    }
  } else if (typeof first === 'object' && first !== null) {
    const allKeys: string[] = []
    const keySeen = new Set<string>()
    perDevice.forEach(d => {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return
      Object.entries(d).forEach(([k, v]) => {
        if (keySeen.has(k)) return
        if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return
        keySeen.add(k); allKeys.push(k)
      })
    })
    for (const key of allKeys) {
      const values = perDevice.map(d => d == null ? null : (d[key] == null ? '—' : String(d[key])))
      const differs = new Set(values.map(v => v ?? '(missing)')).size > 1
      rows.push({ label: sectionLabel(key), values, differs })
    }
  } else {
    const values = perDevice.map(d => d == null ? null : String(d))
    const differs = new Set(values.map(v => v ?? '(missing)')).size > 1
    rows.push({ label: sectionLabel(section), values, differs })
  }

  return rows
}
