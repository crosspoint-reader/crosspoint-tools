import { useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import ReportIssue from './home/ReportIssue.jsx'

export default function ReportIssuePage() {
  useEffect(() => {
    document.title = 'Report an Issue - CrossPoint Reader'
  }, [])

  return (
    <Layout>
      <ReportIssue />
    </Layout>
  )
}
