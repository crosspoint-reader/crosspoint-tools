import { useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import GetInTouch from './home/GetInTouch.jsx'

export default function ContactPage() {
  useEffect(() => {
    document.title = 'Get in Touch - CrossPoint Reader'
  }, [])

  return (
    <Layout>
      <GetInTouch />
    </Layout>
  )
}
