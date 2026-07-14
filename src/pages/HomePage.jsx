import { useState } from 'react'
import Layout from '../components/Layout.jsx'
import BuyModal from '../components/BuyModal.jsx'
import Hero from './home/Hero.jsx'
import Features from './home/Features.jsx'
import FlashTools from './home/FlashTools.jsx'
import Community from './home/Community.jsx'
import UnlockSection from './home/UnlockSection.jsx'
import GetInTouch from './home/GetInTouch.jsx'

export default function HomePage() {
  const [buyOpen, setBuyOpen] = useState(false)

  return (
    <Layout>
      <Hero onOpenBuy={() => setBuyOpen(true)} />
      <Features />
      <FlashTools />
      <Community />
      <UnlockSection />
      <GetInTouch />
      <BuyModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </Layout>
  )
}
