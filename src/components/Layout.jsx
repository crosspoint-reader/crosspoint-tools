import Header from './Header.jsx'
import Footer from './Footer.jsx'
import SiteBanner from './SiteBanner.jsx'

export default function Layout({ children }) {
  return (
    <>
      <Header />
      <SiteBanner />
      <main>{children}</main>
      <Footer />
    </>
  )
}
