import type { Metadata } from 'next'
import { DoshaQuiz } from '@/components/client/dosha-quiz'

export const metadata: Metadata = {
  title: { absolute: 'Dosha Quiz — Narasimha Solutions' },
  description:
    'A free Ayurvedic dosha quiz. Compare your lifelong constitution (Prakriti) with how you have felt lately (Vikriti). For personal insight and wellness reflection only.',
  alternates: { canonical: '/dosha-quiz' },
  openGraph: {
    title: 'Dosha Quiz — Narasimha Solutions',
    description:
      'A free Ayurvedic dosha quiz. Compare your lifelong constitution (Prakriti) with how you have felt lately (Vikriti).',
    url: '/dosha-quiz',
    siteName: 'Narasimha Solutions',
    type: 'website',
    // Setting openGraph here replaces the root tags, including the share image.
    images: [{ url: '/og.png', width: 1200, height: 630, type: 'image/png', alt: 'Narasimha Solutions' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dosha Quiz — Narasimha Solutions',
    description:
      'A free Ayurvedic dosha quiz. Compare your lifelong constitution (Prakriti) with how you have felt lately (Vikriti).',
    images: ['/og.png'],
  },
}

export default function DoshaQuizPage() {
  return <DoshaQuiz />
}
