import Link from 'next/link'

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', background: '#f4ead8', color: '#2a1f14', fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a85428', fontWeight: 600, marginBottom: '12px' }}>404</p>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'clamp(28px, 6vw, 40px)', color: '#2a3520', marginBottom: '12px' }}>
        This page could not be found
      </h1>
      <p style={{ fontSize: '15px', color: '#5d4f3f', maxWidth: '420px', lineHeight: 1.6, marginBottom: '24px' }}>
        The link may be broken or the page may have moved.
      </p>
      <Link href="/" style={{ background: '#3d4a2a', color: '#f4ead8', padding: '12px 24px', borderRadius: '99px', textDecoration: 'none', fontWeight: 500 }}>
        Go to the iris readings
      </Link>
    </main>
  )
}
