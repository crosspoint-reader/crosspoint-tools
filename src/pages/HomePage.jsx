import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Button } from '../components/ui.jsx'
import Hero from './home/Hero.jsx'
import Features from './home/Features.jsx'
import PressQuotes from './home/PressQuotes.jsx'
import CommunityStats from './home/CommunityStats.jsx'
import './home/home.css'

export default function HomePage() {
  return (
    <Layout>
      <div className="hardware-home">
        <Hero />
        <Features />

        <section className="home-remote" id="page-turners">
          <div className="home-wrap home-remote-grid">
            <div className="home-remote-copy">
              <h2>Bluetooth page turners</h2>
              <p>Pair a compatible Bluetooth remote to turn pages without touching your reader. Assign short and long presses to page turns, chapter navigation, the reader menu, or clipping selection.</p>
              <p className="home-remote-detail">Pair your remote in Settings → Connectivity → Bluetooth Page Turner, then choose what each button does.</p>
              <Button href="https://link.amazon/B0apXLA2b" target="_blank" rel="noopener noreferrer" variant="outline">Buy on Amazon <span aria-hidden="true">↗</span></Button>
              <Link className="home-text-link" to="/docs#364-system?doc=user_guide">Set up a Bluetooth page turner →</Link>
            </div>
            <figure className="home-remote-photo">
              <a href="https://link.amazon/B0apXLA2b" target="_blank" rel="noopener noreferrer" aria-label="Shop the Bluetooth page turner on Amazon">
                <img src="/accessories/page-turner-reading.webp" alt="An orange two-button page turner beside a silver e-reader showing “Just one more chapter,” with a stack of Hardy Boys books" width="806" height="605" loading="lazy" />
              </a>
            </figure>
          </div>
        </section>

        <section className="home-community home-wrap">
          <div className="home-community-photo"><img src="/community/contributors.webp" alt="Avatars of CrossPoint Reader’s GitHub contributors" width="2400" height="1600" loading="lazy" /></div>
          <div><h2>Made by people<br />who <span className="home-underline">actually use it.</span></h2><p>CrossPoint grows through bug reports, translations, code, and conversations about what would make reading better. There’s room for you here.</p><Button href="https://github.com/crosspoint-reader/crosspoint-reader" variant="primary">See the project on GitHub ↗</Button><img className="home-community-badge" src="/community/octoverse-2026.webp" alt="GitHub Octoverse 2026 recognition: CrossPoint Reader was a top open source project on GitHub" width="1280" height="720" loading="lazy" /></div>
        </section>

        <section className="home-wrap" aria-label="CrossPoint community statistics">
          <CommunityStats />
        </section>

        <section className="home-hero home-wrap">
          <div className="home-hero-heading">
            <div>
              <h2>Find the reader<br />that <span className="home-underline">fits your pocket</span>.</h2>
            </div>
            <div className="home-hero-intro">
              <p>Find an e-reader you’ll want to take everywhere. Make it yours with CrossPoint, our free, open source reading software.</p>
              <Button as={Link} to="/devices" variant="primary">Find your reader <span aria-hidden="true">↗</span></Button>
              <Link className="home-text-link" to="/install">Already have one? Install CrossPoint →</Link>
            </div>
          </div>
          <figure className="home-lineup">
            <img src="/device-comparison/hero.webp" alt="Seven compact e-readers laid out among stacks of books" width="1600" height="739" loading="lazy" />
            <Link className="home-lineup-link home-text-link home-hand" to="/device-comparison">Compare devices <svg aria-hidden="true" className="inline-block align-middle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg></Link>
          </figure>
        </section>

        <PressQuotes />

        <section className="home-sync home-wrap" id="crosspoint-sync">
          <h2>CrossPoint Sync</h2>
          <div className="home-sync-layout">
            <div className="home-sync-screens">
              <img className="reader-screenshot home-sync-library" src="/sync/library.webp" alt="CrossPoint Sync web library showing current books and reading progress" width="1600" height="1000" loading="lazy" />
              <img className="reader-screenshot home-sync-clippings" src="/sync/clippings.webp" alt="CrossPoint Sync mobile clippings view with search, Markdown export, and sharing" width="780" height="1688" loading="lazy" />
            </div>
            <div className="home-sync-copy">
              <div className="home-sync-details">
                <div><h3>Reading progress across devices</h3><p>Keep your place across CrossPoint and KOReader devices. View your current books, finished reads, and reading stats in the app.</p></div>
                <div><h3>Search and share highlights</h3><p>Find saved passages across your books, copy clippings as Markdown, or share a passage as an image.</p></div>
                <div><h3>Connect your reading services</h3><p>Update your shelves and progress on Hardcover, send highlights to Readwise, or sync your place with BookFusion and Audiobookshelf.</p></div>
              </div>
              <div className="home-sync-actions">
                <Button href="https://sync.crosspointreader.com/" variant="primary">Explore CrossPoint Sync <span aria-hidden="true">↗</span></Button>
                <Link className="home-text-link home-hand" to="/docs#367-koreader-sync-quick-setup?doc=user_guide">Set up your reader →</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="home-start home-wrap"><div><h2>Your next read starts here.</h2></div><div><Button as={Link} to="/devices" variant="primary">Shop readers ↗</Button><Button as={Link} to="/install">Install CrossPoint →</Button></div></section>
      </div>
    </Layout>
  )
}
