import assert from 'node:assert/strict'
import test from 'node:test'
import { getAccessoryType, isAccessoryType } from './accessories.ts'

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
