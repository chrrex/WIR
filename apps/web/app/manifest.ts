import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WIR · Das Mitarbeiterportal',
    short_name: 'WIR',
    description: 'News, Übergaben, Wissen und Chat – für das ganze Team.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F3F4EF',
    theme_color: '#6B7A3E',
    lang: 'de',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
