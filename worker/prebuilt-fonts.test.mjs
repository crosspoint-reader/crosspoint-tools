import assert from 'node:assert/strict'
import test from 'node:test'

import { getPrebuiltFontAssetUrl } from './prebuilt-fonts.ts'

const manifest = {
  version: 1,
  baseUrl: 'https://github.com/crosspoint-reader/crosspoint-fonts/releases/download/fonts-v1/',
  families: [
    {
      name: 'Literata',
      description: 'Serif',
      files: [{ name: 'Literata_12.cpfont', size: 123, crc32: 456 }],
    },
  ],
}

test('only resolves assets listed by the trusted CrossPoint font manifest', () => {
  assert.equal(
    getPrebuiltFontAssetUrl(manifest, 'Literata_12.cpfont')?.href,
    'https://github.com/crosspoint-reader/crosspoint-fonts/releases/download/fonts-v1/Literata_12.cpfont'
  )
  assert.equal(getPrebuiltFontAssetUrl(manifest, 'Other_12.cpfont'), null)
  assert.equal(
    getPrebuiltFontAssetUrl({ ...manifest, baseUrl: 'https://example.com/' }, 'Literata_12.cpfont'),
    null
  )
})
