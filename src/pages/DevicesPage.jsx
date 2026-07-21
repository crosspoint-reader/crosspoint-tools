import ShopGridPage from './shop/ShopGridPage.jsx'

export default function DevicesPage() {
  return (
    <ShopGridPage
      category="device"
      eyebrow="Runs CrossPoint out of the box"
      title="Devices"
      intro="E-readers that run CrossPoint. Pick one up, flash the latest firmware from your browser, and start reading."
      emptyText="No devices listed yet. Check back soon."
      showSearch={false}
    />
  )
}
