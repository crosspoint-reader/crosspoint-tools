import { Link } from 'react-router-dom'
import { Button } from '../../components/ui.jsx'
import ReaderScreenshot from './ReaderScreenshot.jsx'
import Partners from './Partners.jsx'

export default function Hero() {
  return (
    <section className="home-opening home-wrap">
      <div className="home-opening-copy">
        <h1>Read without<br />limits.</h1>
        <p>Your books, on a reader you can make your own. CrossPoint is free software for compact e-readers, built by the people who read on them.</p>
        <div className="home-opening-actions">
          <Button as={Link} to="/install" variant="primary">Install CrossPoint <span aria-hidden="true">→</span></Button>
          <Button as={Link} to="/devices" variant="outline">Shop devices <span aria-hidden="true">↗</span></Button>
        </div>
        <p className="home-opening-note">Buying through our shop links helps fund development.</p>
      </div>
      <div className="home-opening-screens">
        <figure><ReaderScreenshot src="/screenshots/hero-reader.png" alt="A book open in CrossPoint’s reading view" eager /></figure>
        <figure><ReaderScreenshot src="/screenshots/hero-home.png" alt="CrossPoint home screen with recent books" eager /></figure>
      </div>
      <Partners />
    </section>
  )
}
