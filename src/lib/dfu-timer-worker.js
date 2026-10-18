self.onmessage = ({ data: { id, ms } }) => {
  setTimeout(() => self.postMessage(id), ms)
}
