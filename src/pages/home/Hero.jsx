import { Link } from 'react-router-dom'
import { Button } from '../../components/ui.jsx'
import ReaderScreenshot from './ReaderScreenshot.jsx'
import Partners from './Partners.jsx'
import ShopSupportNote from '../../components/ShopSupportNote.jsx'

export default function Hero() {
  return (
    <section className="home-opening home-wrap">
      <h1>Read <span className="home-underline">without limits.</span></h1>
      <div className="home-opening-copy">
        <p>Your books, on a reader you can make your own. CrossPoint is free software for compact e-readers, built by the people who read on them.</p>
        <div className="home-opening-shop">
          <div className="home-opening-actions">
            <Button as={Link} to="/install" variant="primary">Install CrossPoint <span aria-hidden="true">→</span></Button>
            <Button as={Link} to="/devices" variant="outline">Shop devices <span aria-hidden="true">↗</span></Button>
          </div>
          <ShopSupportNote className="home-opening-note">Buying through our shop links helps fund development.</ShopSupportNote>
        </div>
        <Partners />
      </div>
      <div className="home-opening-screens">
        <figure><ReaderScreenshot src="/screenshots/hero-reader.webp" alt="A book open in CrossPoint’s reading view" eager /></figure>
        <figure><ReaderScreenshot src="/screenshots/hero-home.webp" alt="CrossPoint home screen with recent books" eager /></figure>
      </div>
    </section>
  )
}
