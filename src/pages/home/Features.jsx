import { Link } from 'react-router-dom'
import ReaderScreenshot from './ReaderScreenshot.jsx'

function Story({ title, image, alt, children, to, link }) {
  return (
    <article className="home-feature home-feature-type">
      <div>
        <h3>{title}</h3>
        {children}
        <Link className="home-text-link" to={to}>{link} →</Link>
      </div>
      <ReaderScreenshot src={`/screenshots/${image}.png`} alt={alt} />
    </article>
  )
}

export default function Features() {
  return (
    <section className="home-wrap home-software" id="features">
      <div className="home-section-heading">
        <div><h2>More control over how you read.</h2></div>
        <p>CrossPoint is the software behind the screen. Free to install, with new features built by people who use it every day.</p>
      </div>
      <div className="home-feature-grid">
        <Story title="EPUB formatting and typography" image="feature-reader" alt="Book text rendered with justified paragraphs in CrossPoint" to="/docs#4-reading-mode?doc=user_guide" link="Read the reading guide">
          <p>Read EPUBs with justified text, language-aware hyphenation, and working footnotes. CrossPoint also renders drop caps, small caps, and illustrations.</p>
        </Story>
        <Story title="Custom fonts and page layout" image="feature-settings-font-selection" alt="Font selection settings on a CrossPoint reader" to="/docs#sd-card-fonts" link="Set up custom fonts">
          <p>Choose your typeface, size, margins, and line, word, and letter spacing. Convert a font you own with our font builder, or load TrueType fonts directly on readers with external RAM.</p>
        </Story>
        <Story title="Library search and sorting" image="feature-library" alt="CrossPoint library listing books on the SD card" to="/docs#34-library-screen?doc=user_guide" link="Read the library guide">
          <p>Browse every book on your SD card. Search by title or author, and sort by recent reads, title, or author.</p>
        </Story>
        <Story title="Wi-Fi transfers, Calibre, and OPDS" image="feature-transfer" alt="CrossPoint wireless book transfer screen" to="/docs#35-file-transfer-screen?doc=user_guide" link="Get books onto your reader">
          <p>Drop a book into your browser or send it from Calibre. Browse OPDS and OPDS 2.0 catalogs on the reader. Away from home? Load books through its own Wi-Fi hotspot.</p>
        </Story>
        <Story title="Highlights, bookmarks, and reading sync" image="feature-bookmarks" alt="Saved bookmarks in a book on CrossPoint" to="/docs#53-clippings-and-highlights?doc=user_guide" link="Use highlights and clippings">
          <p>Highlight a passage, save a clipping, or name a bookmark. Quick Resume takes you straight back into your book, and KOReader sync keeps your place across devices.</p>
        </Story>
        <Story title="Offline dictionaries" image="feature-dictionary" alt="An offline dictionary definition displayed on CrossPoint" to="/docs#dictionary" link="Add a dictionary">
          <p>Look up a word or a whole phrase without leaving your book. Add a StarDict dictionary and use it offline, wherever you’re reading.</p>
        </Story>
        <Story title="Multilingual and right-to-left text" image="feature-rtl" alt="Hebrew text laid out right to left on a CrossPoint reader" to="/docs#supported-languages?doc=user_guide" link="Explore language support">
          <p>Community translations, right-to-left text, and hyphenation rules that follow the language of your book. Indic scripts aren’t supported yet.</p>
        </Story>
        <Story title="Focus Reading and page-turn controls" image="feature-focus-reading" alt="CrossPoint Focus Reading view" to="/docs#focus-reading" link="Set up Focus Reading">
          <p>Try Focus Reading for a guided pace. On supported hardware, turn pages with a tilt or set up your own tap and swipe gestures.</p>
        </Story>
      </div>
      <div className="home-extras">
        <article><h3>SD card plugins</h3><p>Load plugins from your SD card to add book catalogs, download sources, and web-interface tools without reflashing the firmware. Manage books with the browser file manager and reduce EPUB file sizes with the optimizer.</p><Link className="home-text-link" to="/docs#364-system?doc=user_guide">Set up SD card plugins →</Link></article>
        <article><h3>Free over-the-air updates</h3><p>Update CrossPoint over Wi-Fi for free on supported devices. BOOX Picco updates use USB. Follow development on the roadmap, suggest changes, or try new features in nightly builds.</p><Link className="home-text-link" to="/docs#firmware-updates?doc=user_guide">Read the update instructions →</Link></article>
      </div>
    </section>
  )
}
