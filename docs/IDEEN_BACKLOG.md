# Ideensammlung – mögliche weitere Funktionen

Stand: 05.10.2026 · Keine Zusage, keine Priorisierung. Jede Idee wird vor Umsetzung gegen §19 der Spec geprüft (bestehende Module wiederverwenden) und – wo Mitarbeiterdaten betroffen sind – mit Datenschutz und Betriebsrat abgestimmt.
Legende: **Basis vorhanden** = baut auf bestehendem Modul auf · **Anbindung** = über Open API / Adapter (ADR-035) · **BR** = mitbestimmungsrelevant

## Lernen & Entwicklung
| Idee | Baut auf | Hinweis |
|---|---|---|
| Anbindung digitales Berichtsheft für Azubis (Erinnerung, Status, Freigabe durch Ausbilder:in) | Anbindung, Aufgaben | Berichtsheft-System bleibt führend |
| Individueller Schulungsplan je Person/Rolle (Pflicht- und Wunschschulungen) | Checklisten-Vorlagen, Lifecycle | BR |
| Schulungskalender mit Anmeldung und Warteliste | Kalender (neu), Umfragen | – |
| Onlineschulungen / E-Learning mit Teilnahmenachweis (eigene Kurse oder Anbindung einer Lernplattform) | Wissen, Kenntnisnahme, Anbindung | BR |
| Pflichtunterweisungen (Hygiene, Arbeitsschutz, Brandschutz) mit Fälligkeit und Erinnerung | Kenntnisnahme, Erinnerungen | Nachweis für Audits |
| Entwicklungsgespräche-Planer (Termin, Leitfaden, vereinbarte Ziele – Inhalte nur für Beteiligte) | Aufgaben, Dokumente (sensibel) | BR, keine Personalakte |
| Patenprogramm / Buddy für neue Kolleg:innen | Onboarding | – |
| Interne Stellenbörse und Hospitationen in anderen Häusern der Stiftung | News, Ausbaustufe 2 | – |

## Kalender & Organisation
| Idee | Baut auf | Hinweis |
|---|---|---|
| Kalenderfunktion (Team-, Schulungs- und Hauskalender) mit Outlook-Synchronisation | Kalender (neu), Microsoft 365 | Prüfauftrag ADR-035 |
| Benachrichtigungen und Übergaben zusätzlich in Microsoft Teams | Benachrichtigungen, Microsoft 365 | Prüfauftrag |
| Anmeldung mit dem Microsoft-Konto (Single Sign-on) für Mitarbeitende mit M365-Zugang | Auth, Entra ID | Prüfauftrag |
| Raum- und Ressourcenbuchung intern (Besprechungsräume, Dienstfahrzeuge, Technik) | Kalender (neu) | – |
| Schichttausch-Börse | Gastromatic | bewusst nicht MVP (§11), Gastromatic führend |
| Urlaubs- und Abwesenheitsübersicht fürs Team | Abwesenheiten, Gastromatic | BR, ohne Gründe |

## Betrieb & Qualität
| Idee | Baut auf | Hinweis |
|---|---|---|
| Störungsmeldung mit Foto direkt an Flexkeeping übergeben | Anbindung | Flexkeeping bleibt führend |
| Gästebeschwerde-Workflow (Priorität, Maßnahme, Kompensation) | eigenes Modul | §15.7, später |
| QR-/NFC-Codes an Geräten und Räumen | Wissen, QR-Links | bereits vorbereitet |
| Fundsachen-Verwaltung mit Foto und Status | Aufgaben, Dokumente | – |
| Bestellwünsche / Material- und Inventuranfragen | Aufgaben, Checklisten | – |
| Allergen- und Tagesinfos für den Service | Wissen, Dashboard | – |
| Temperatur- und Reinigungsprotokolle als Auswertung für Audits | Checklisten | – |

## Team & Kultur
| Idee | Baut auf | Hinweis |
|---|---|---|
| Danke-Karten / Kudos unter Kolleg:innen | Social | freiwillig, keine Rankings |
| Speiseplan der Mitarbeiterverpflegung mit Feedback | News, Umfragen | – |
| Benefits-Übersicht (z. B. Jobrad, Vergünstigungen) | Wissen | – |
| Mitfahrbörse für Pendler:innen | Social (Biete & Suche) | – |
| Kurze Stimmungsumfragen (Pulse) | Umfragen (anonym) | BR, Mindestgruppengröße |
| Nachhaltigkeits-Aktionen und Challenges | Social, Umfragen | – |

## KI & Assistenz
| Idee | Baut auf | Hinweis |
|---|---|---|
| Übergaben diktieren statt tippen (Sprache → Text) | Spracheingabe | – |
| Zusammenfassung langer Diskussionen und News | KI-Assistent | nur berechtigte Inhalte |
| SOP-Entwürfe aus Stichpunkten erstellen lassen | Wissen, KI | Freigabe durch Verantwortliche |
| Automatische Übersetzung weiterer Sprachen (z. B. Indonesisch) | Übersetzung | – |
| Digitale Bestätigung von Belehrungen | Kenntnisnahme | rechtliche Anforderungen prüfen |
