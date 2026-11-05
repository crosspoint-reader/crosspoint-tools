import assert from 'node:assert/strict'
import test from 'node:test'
import { getAccessoryType, isAccessoryType, getProductLinks, readProductLinks } from './accessories.ts'

test('recognizes the existing printable-model links', () => {
  for (const link of [
    'https://makerworld.com/en/models/2657757-xteink-x4-full-body-case',
    'https://www.makeronline.com/en/model/XTEINK%204%20Pro%20Charging%2FSync%20Dock/332010.html?trackModuleType=10',
    'https://www.printables.com/model/1769630-pokedex-foldable-xteink-x4-case',
  ]) {
    assert.equal(getAccessoryType({ link }), '3d-print')
  }
})

test('uses an explicit classification before a legacy link match', () => {
  assert.equal(getAccessoryType({ accessoryType: 'ready-made', link: 'https://makerworld.com/en/models/123' }), 'ready-made')
  assert.equal(getAccessoryType({ accessoryType: '3d-print', link: 'https://example.com/my-design' }), '3d-print')
})

test('keeps physical products and unrelated links out of the print section', () => {
  for (const link of [
    'https://amzn.to/45gbaYz',
    'https://makerworld.com/store/ready-made-case',
    'https://makerworld.com.example.com/en/models/123',
    'https://example.com/model/case',
    'not a URL',
    '',
  ]) {
    assert.equal(getAccessoryType({ link }), 'ready-made')
  }
  assert.equal(getAccessoryType({}), 'ready-made')
})

test('accepts only the supported accessory types', () => {
  assert.equal(isAccessoryType('ready-made'), true)
  assert.equal(isAccessoryType('3d-print'), true)
  for (const value of ['device', 'print', '', null, undefined, {}, new File([], 'type.txt')]) {
    assert.equal(isAccessoryType(value), false)
  }
})

function linksForm(links) {
  const form = new FormData()
  form.set('links', JSON.stringify(links))
  return form
}

test('round-trips multiple labeled stores and trims blank rows', () => {
  const links = readProductLinks(linksForm([
    { label: ' Amazon ', url: ' https://amzn.to/product ' },
    { label: 'AliExpress', url: 'https://aliexpress.com/item/123' },
    { label: ' ', url: '' },
  ]))
  assert.deepEqual(links, [
    { label: 'Amazon', url: 'https://amzn.to/product' },
    { label: 'AliExpress', url: 'https://aliexpress.com/item/123' },
  ])
  assert.deepEqual(getProductLinks({ links, link: links[0].url }), links)
})

test('keeps legacy links, distinguishes omitted links from removing all links', () => {
  assert.deepEqual(getProductLinks({ link: 'https://example.com' }), [{ label: '', url: 'https://example.com' }])
  assert.deepEqual(getProductLinks({}), [])
  assert.deepEqual(getProductLinks({ links: [], link: 'https://example.com' }), [])
  assert.equal(readProductLinks(new FormData()), null)
  assert.deepEqual(readProductLinks(linksForm([])), [])
  const form = new FormData()
  form.set('link', ' https://example.com ')
  assert.deepEqual(readProductLinks(form), [{ label: '', url: 'https://example.com' }])
  form.set('link', '')
  assert.deepEqual(readProductLinks(form), [])
})

test('rejects malformed links and unsafe URLs before saving', () => {
  for (const value of [null, {}, [null], ['https://example.com'], [{ label: 5, url: 'https://example.com' }]]) {
    assert.throws(() => readProductLinks(linksForm(value)))
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'not a URL', '']) {
    assert.throws(() => readProductLinks(linksForm([{ label: 'Amazon', url }])), /http\(s\)/)
  }
  const form = new FormData()
  form.set('links', '{invalid')
  assert.throws(() => readProductLinks(form), /JSON array/)
  form.set('links', new File([], 'links.json'))
  assert.throws(() => readProductLinks(form), /array/)
})

test('classifies print files from any product link', () => {
  assert.equal(getAccessoryType({ links: [
    { label: 'Store', url: 'https://example.com' },
    { label: 'Print files', url: 'https://printables.com/model/123' },
  ] }), '3d-print')
})
