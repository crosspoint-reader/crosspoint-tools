import Layout from '../components/Layout.jsx'
import Hero from './home/Hero.jsx'
import PressQuotes from './home/PressQuotes.jsx'
import Features from './home/Features.jsx'
import EveryLanguage from './home/EveryLanguage.jsx'
import Rhythm from './home/Rhythm.jsx'
import FlashTools from './home/FlashTools.jsx'
import Community from './home/Community.jsx'
import GetInTouch from './home/GetInTouch.jsx'

export default function HomePage() {
  return (
    <Layout>
      <Hero />
      <PressQuotes />
      <Features />
      <EveryLanguage />
      <Rhythm />
      <FlashTools />
      <Community />
      <GetInTouch />
    </Layout>
  )
}
