import ShopGridPage from './shop/ShopGridPage.jsx'
import ShopSupportNote from '../components/ShopSupportNote.jsx'

export default function AccessoriesPage() {
  return (
    <ShopGridPage
      category="accessory"
      title="Accessories"
      intro="Every item listed here has been used by the CrossPoint team."
      emptyText="No accessories listed yet. Check back soon."
      sections={[
        {
          type: 'ready-made',
          title: 'Accessories',
          ctaLabel: 'Buy accessory',
          footer: (
            <ShopSupportNote className="mt-5 max-w-sm flex-col [&>svg]:ml-8">
              Planning a big purchase on AliExpress or Amazon? Click one of our links just before checkout. It’s a great way to support CrossPoint development.
            </ShopSupportNote>
          ),
        },
        { type: '3d-print', title: '3D prints', description: 'Design files for cases, docks, and other accessories. Requires a 3D printer or printing service.', ctaLabel: 'View print files' },
      ]}
    />
  )
}
