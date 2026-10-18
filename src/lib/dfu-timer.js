// A worker can wake protocol waits while page timers are being throttled.
// Keep a page timer as a fallback if workers are unavailable or fail to load.
export class DfuTimer {
  constructor(createWorker = () => new Worker(new URL('./dfu-timer-worker.js', import.meta.url), { type: 'module' })) {
    this.worker = null
    this.pending = null
    this.sequence = 0
    try {
      this.worker = createWorker()
      this.worker.onmessage = ({ data }) => {
        if (this.pending?.id === data) this.pending.finish()
      }
      this.worker.onerror = (event) => {
        event.preventDefault?.()
        this.worker?.terminate()
        this.worker = null
      }
    } catch { /* Page timer remains available. */ }
  }
  wait(ms) {
    if (this.pending) throw new Error('Overlapping DFU waits')
    return new Promise((resolve) => {
      const id = ++this.sequence
      const deadline = performance.now() + ms
      let timer
      const finish = () => {
        // Never poll the reader earlier than its advertised flash interval.
        const remaining = deadline - performance.now()
        clearTimeout(timer)
        if (remaining > 0) {
          timer = setTimeout(finish, remaining)
          return
        }
        this.pending = null
        resolve()
      }
      this.pending = { id, finish }
      timer = setTimeout(finish, ms)
      try { this.worker?.postMessage({ id, ms }) } catch {
        this.worker?.terminate()
        this.worker = null
      }
    })
  }
  close() {
    this.worker?.terminate()
    this.worker = null
  }
}
