import test from 'node:test'
import assert from 'node:assert/strict'
import { DfuTimer } from './dfu-timer.js'
const nativeTimeout = globalThis.setTimeout
class WorkerTimer {
  postMessage({ id, ms }) { nativeTimeout(() => this.onmessage?.({ data: id }), ms) }
  terminate() { this.stopped = true }
}
test('worker wakes waits when page timers are delayed, without polling early', async () => {
  const worker = new WorkerTimer()
  const timer = new DfuTimer(() => worker)
  globalThis.setTimeout = (fn, ms) => nativeTimeout(fn, Math.max(300, ms))
  try {
    const start = performance.now()
    for (let i = 0; i < 5; i++) {
      const before = performance.now()
      await timer.wait(10)
      assert(performance.now() - before >= 10)
    }
    assert(performance.now() - start < 1000, 'five page timers alone would take at least 1500 ms')
  } finally {
    globalThis.setTimeout = nativeTimeout
    timer.close()
  }
  assert(worker.stopped)
})
test('blocked worker falls back to a page timer', async () => {
  const timer = new DfuTimer(() => { throw new Error('blocked') })
  const start = performance.now()
  await timer.wait(10)
  assert(performance.now() - start >= 10)
  timer.close()
})
test('worker load failure preserves the pending full wait', async () => {
  const worker = new WorkerTimer()
  worker.postMessage = () => nativeTimeout(() => worker.onerror({ preventDefault() {} }), 1)
  const timer = new DfuTimer(() => worker)
  const start = performance.now()
  await timer.wait(15)
  assert(performance.now() - start >= 15)
  assert(worker.stopped)
  assert.equal(timer.worker, null)
  timer.close()
})
test('early and stale worker messages cannot shorten an advertised wait', async () => {
  const worker = new WorkerTimer()
  worker.postMessage = ({ id }) => {
    worker.onmessage({ data: id - 1 })
    worker.onmessage({ data: id })
  }
  const timer = new DfuTimer(() => worker)
  const start = performance.now()
  await timer.wait(15)
  assert(performance.now() - start >= 15)
  timer.close()
})
