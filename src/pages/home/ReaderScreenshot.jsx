export default function ReaderScreenshot({ src, alt, eager = false }) {
  return <img className="reader-screenshot" src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} />
}
