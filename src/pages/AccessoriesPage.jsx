import ShopGridPage from './shop/ShopGridPage.jsx'

export default function AccessoriesPage() {
  return (
    <ShopGridPage
      category="accessory"
      title="Accessories"
      intro="Every item listed here has been used by the CrossPoint team."
      emptyText="No accessories listed yet. Check back soon."
      sections={[
        { type: 'ready-made', title: 'Accessories', ctaLabel: 'Buy accessory' },
        { type: '3d-print', title: '3D prints', description: 'Design files for cases, docks, and other accessories. Requires a 3D printer or printing service.', ctaLabel: 'View print files' },
      ]}
    />
  )
}
