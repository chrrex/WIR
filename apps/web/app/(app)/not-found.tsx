import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card narrow stack">
      <h1>Diese Seite gibt es nicht</h1>
      <p className="muted">Vielleicht ist die Adresse falsch oder der Bereich ist für dich nicht freigeschaltet.</p>
      <Link className="btn" href="/">Zur Startseite</Link>
    </div>
  );
}
