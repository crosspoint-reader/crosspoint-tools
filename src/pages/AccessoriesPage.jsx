import ShopGridPage from './shop/ShopGridPage.jsx'

export default function AccessoriesPage() {
  return (
    <ShopGridPage
      category="accessory"
      eyebrow="Gear we actually use"
      title="Accessories"
      intro="Recommended products for your device — cases, cables, storage, and other gear that pairs well with CrossPoint readers."
      emptyText="No accessories listed yet. Check back soon."
      ctaLabel="Get It Here"
    />
  )
}
