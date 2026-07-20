import { useState } from 'react'
import Layout from '../components/Layout.jsx'
import BuyModal from '../components/BuyModal.jsx'
import Hero from './home/Hero.jsx'
import PressQuotes from './home/PressQuotes.jsx'
import Features from './home/Features.jsx'
import EveryLanguage from './home/EveryLanguage.jsx'
import Rhythm from './home/Rhythm.jsx'
import FlashTools from './home/FlashTools.jsx'
import Community from './home/Community.jsx'
import UnlockSection from './home/UnlockSection.jsx'
import GetInTouch from './home/GetInTouch.jsx'

export default function HomePage() {
  const [buyOpen, setBuyOpen] = useState(false)

  return (
    <Layout>
      <Hero onOpenBuy={() => setBuyOpen(true)} />
      <PressQuotes />
      <Features />
      <EveryLanguage />
      <Rhythm />
      <FlashTools />
      <Community />
      <UnlockSection />
      <GetInTouch />
      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </Layout>
  )
}
