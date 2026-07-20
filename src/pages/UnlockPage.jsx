import { useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import UnlockSection from './home/UnlockSection.jsx'

export default function UnlockPage() {
  useEffect(() => {
    document.title = 'Have a Locked Device? - CrossPoint Reader'
  }, [])

  return (
    <Layout>
      <UnlockSection />
    </Layout>
  )
}
