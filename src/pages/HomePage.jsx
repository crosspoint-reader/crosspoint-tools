import Layout from '../components/Layout.jsx'
import Hero from './home/Hero.jsx'
import Partners from './home/Partners.jsx'
import PressQuotes from './home/PressQuotes.jsx'
import Features from './home/Features.jsx'
import Rhythm from './home/Rhythm.jsx'
import Community from './home/Community.jsx'

export default function HomePage() {
  return (
    <Layout>
      <Hero />
      <Partners />
      <PressQuotes />
      <Features />
      <Rhythm />
      <Community />
    </Layout>
  )
}
