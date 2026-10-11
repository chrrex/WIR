/**
 * Testdaten Phase 3+4: Wissen, Dokumente, Aufgaben, Checklisten, Umfragen, Ideen, Kontakte.
 * Alles erfunden. Firmen in Kontakten sind ausdrücklich Beispiele.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { PrismaClient } from '../src/generated/client';
import { indexContent } from '../src/search';

interface Ctx {
  sgl: string; stiftung: string; groups: Map<string, string>; T: (u: string) => string;
  jana: string; maren: string; lena: string; nora: string; sglPeople: string[]; employees: string[]; membersOf: (...g: string[]) => string[];
}

const ago = (h: number) => new Date(Date.now() - h * 3600_000);
const body = (t: string) => ({ type: 'text', paragraphs: t.split(/\n{2,}/) });
/** nächster Termin 06:00 Uhr deutscher Zeit (grob, nur für Demo) */
const nextSix = () => { const d = new Date(); d.setUTCHours(4, 0, 0, 0); if (d < new Date()) d.setUTCDate(d.getUTCDate() + 1); return d; };
const day = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

/** Minimal gültige einseitige PDF-Datei mit einer Textzeile. */
function pdf(text: string) {
  const safe = text.replace(/[()\\]/g, '').replace(/[^\x20-\x7e]/g, '?');
  const stream = `BT /F1 18 Tf 72 760 Td (${safe}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offs = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export async function seedWork(prisma: PrismaClient, c: Ctx) {
  const { sgl, groups, T, jana, maren, lena, nora } = c;
  const G = (n: string) => groups.get(n)!;

  /** Inhalt mit Zielgruppe und materialisierten Empfänger:innen anlegen. */
  async function item(type: 'KNOWLEDGE_ARTICLE' | 'DOCUMENT' | 'TASK' | 'CHECKLIST_RUN' | 'SURVEY' | 'IDEA', author: string, hoursAgo: number,
    audience: Array<{ targetType: 'ALL_USERS' | 'COMPANY' | 'GROUP' | 'USER'; companyId?: string; groupId?: string; userId?: string }>, recipients: string[], extra: Record<string, unknown> = {}) {
    const ci = await prisma.contentItem.create({ data: { type, companyId: sgl, authorId: author, status: 'PUBLISHED', publishedAt: ago(hoursAgo), createdAt: ago(hoursAgo), audiences: { create: audience }, ...extra } });
    await prisma.contentRecipient.createMany({ data: [...new Set([...recipients, author])].map((userId) => ({ contentItemId: ci.id, userId })), skipDuplicates: true });
    return ci.id;
  }
  const house = [{ targetType: 'COMPANY' as const, companyId: sgl }];

  // ---- Wissen & SOPs --------------------------------------------------------
  const cat = async (name: string, slug: string, sortOrder: number) => (await prisma.knowledgeCategory.create({ data: { name, slug, sortOrder } })).id;
  const kKitchen = await cat('Küche & HACCP', 'kueche-haccp', 1);
  const kFront = await cat('Rezeption & Gäste', 'rezeption', 2);
  const kRules = await cat('Richtlinien & Arbeitsschutz', 'richtlinien', 3);
  const kGeneral = await cat('Allgemein', 'allgemein', 4);

  async function article(o: { author: string; category: string; type: 'SOP' | 'HACCP' | 'POLICY' | 'PROCESS' | 'WIKI'; hoursAgo: number; ack?: boolean;
    audience: Parameters<typeof item>[3]; recipients: string[]; versions: Array<{ title: string; text: string; plain?: string; change?: string }>; ackBy?: string[] }) {
    const id = await item('KNOWLEDGE_ARTICLE', o.author, o.hoursAgo, o.audience, o.recipients, { requiresAcknowledgement: !!o.ack, currentVersion: o.versions.length });
    await prisma.knowledgeArticle.create({ data: { id, categoryId: o.category, articleType: o.type, slug: `a-${id.slice(0, 8)}`, ownerId: o.author } });
    for (const [i, v] of o.versions.entries()) {
      const last = i === o.versions.length - 1;
      await prisma.knowledgeVersion.create({ data: { articleId: id, versionNumber: i + 1, status: last ? 'PUBLISHED' : 'SUPERSEDED', title: v.title, body: body(v.text), bodyText: v.text,
        plainLanguageText: v.plain ?? null, changeSummary: v.change ?? (i === 0 ? 'Erste Fassung' : null), authorId: o.author, publishedAt: ago(o.hoursAgo - i * 24) } });
    }
    const cur = o.versions[o.versions.length - 1];
    await indexContent(prisma, id, o.versions.length, cur.title, `${cur.text}\n\n${cur.plain ?? ''}`);
    if (o.ackBy?.length) await prisma.readReceipt.createMany({ data: o.ackBy.map((userId) => ({ contentItemId: id, userId, firstSeenAt: day(), openedAt: day(), acknowledgedAt: day(), acknowledgedVersion: o.versions.length })) });
    return id;
  }

  const kuehlkette = await article({ author: T('sven.r'), category: kKitchen, type: 'HACCP', hoursAgo: 72, ack: true, audience: house, recipients: c.membersOf('Küche', 'Service'), ackBy: [T('tobias.k')],
    versions: [
      { title: 'Kühlkette bei der Warenannahme', text: 'Kühlware wird sofort nach der Anlieferung geprüft und eingeräumt.\n\nStichprobenartig wird die Temperatur gemessen und im Wareneingangsbuch notiert.' },
      { title: 'Kühlkette bei der Warenannahme', change: 'Kerntemperatur jetzt bei jeder TK-Lieferung',
        text: 'Kühlware wird sofort nach der Anlieferung geprüft und innerhalb von 15 Minuten eingeräumt.\n\nBei jeder Tiefkühl-Lieferung messen wir die Kerntemperatur. Grenzwert: -18 °C oder kälter. Kühlware (Fleisch, Fisch, Milchprodukte): höchstens +4 °C.\n\nLiegt ein Wert außerhalb, nimmst du die Ware nicht an, notierst es im Wareneingangsbuch und informierst sofort die Küchenleitung.\n\nDas Thermometer liegt in der Schublade am Wareneingang. Nach jeder Messung desinfizieren.',
        plain: 'Kühle Ware sofort prüfen. Tiefkühlware muss -18 °C oder kälter sein. Ist sie wärmer: Ware nicht annehmen und die Küchenleitung rufen.' },
    ] });
  await article({ author: maren, category: kFront, type: 'PROCESS', hoursAgo: 200, audience: [{ targetType: 'GROUP', groupId: G('Rezeption') }], recipients: c.membersOf('Rezeption'),
    versions: [{ title: 'Check-in am Schloss – Schritt für Schritt', text: 'Begrüße die Gäste mit Namen, sobald du ihn kennst.\n\nPrüfe Reservierung, Anzahl der Nächte und besondere Wünsche wie Allergien oder späte Anreise.\n\nErkläre kurz Frühstückszeiten, WLAN und den Weg zum Zimmer. Bei Tagungsgästen: Raum und Startzeit der Tagung nennen.\n\nSchlüsselkarten immer im Kartenhalter übergeben, nie die Zimmernummer laut sagen.' }] });
  const kleidung = await article({ author: lena, category: kRules, type: 'POLICY', hoursAgo: 400, audience: house, recipients: c.sglPeople,
    versions: [{ title: 'Dienstkleidung und Erscheinungsbild', text: 'Dienstkleidung bekommst du gestellt und gereinigt. Die Ausgabe ist montags und donnerstags von 7 bis 9 Uhr in der Wäscherei.\n\nNamensschild immer gut sichtbar links tragen. Schmuck nur dezent, in der Küche gar nicht.' }] });
  const ersteHilfe = await article({ author: lena, category: kGeneral, type: 'WIKI', hoursAgo: 500, audience: house, recipients: c.sglPeople,
    versions: [{ title: 'Erste Hilfe und Notfälle', text: 'Notruf: 112. Danach immer die Rezeption informieren, sie ist rund um die Uhr besetzt und weist den Rettungsdienst ein.\n\nVerbandkästen hängen in Küche, Rezeption, Wäscherei und Haustechnik. Der Defibrillator (AED) hängt neben der Rezeption.\n\nErsthelfer:innen im Haus findest du am schwarzen Brett im Personalraum.',
      plain: 'Im Notfall: 112 anrufen. Dann der Rezeption Bescheid sagen. Der Defibrillator hängt neben der Rezeption.' }] });
  await article({ author: nora, category: kGeneral, type: 'WIKI', hoursAgo: 600, audience: [{ targetType: 'ALL_USERS' }], recipients: c.employees,
    versions: [{ title: 'Willkommen in der Stiftungsgruppe (Beispieltext)', text: 'Dieser Artikel ist ein Platzhalter für die Inhalte der DKB STIFTUNG. Er zeigt, wie Wissen gruppenweit für alle Gesellschaften geteilt werden kann.' }] });

  // ---- Dokumente ------------------------------------------------------------
  const storage = path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), '../../apps/api/.data/uploads'));
  async function file(name: string, text: string, by: string) {
    const id = randomUUID();
    const data = pdf(text);
    const rel = path.join('seed', `${id}.pdf`);
    await mkdir(path.join(storage, 'seed'), { recursive: true });
    await writeFile(path.join(storage, rel), data);
    await prisma.fileObject.create({ data: { id, storageKey: rel, originalFilename: name, mimeType: 'application/pdf', sizeBytes: BigInt(data.length), checksumSha256: createHash('sha256').update(data).digest('hex'), scanStatus: 'CLEAN', uploadedById: by } });
    return id;
  }
  const dForms = (await prisma.documentCategory.create({ data: { name: 'Vorlagen & Formulare', sortOrder: 1 } })).id;
  const dKitchen = (await prisma.documentCategory.create({ data: { name: 'Küche & HACCP', sortOrder: 2 } })).id;
  const dHr = (await prisma.documentCategory.create({ data: { name: 'Personal (vertraulich)', sortOrder: 3, isSensitive: true } })).id;
  const dLeave = (await prisma.documentCategory.create({ data: { name: 'Urlaub & Abwesenheit', parentId: dForms, sortOrder: 1 } })).id;
  await prisma.documentCategory.create({ data: { name: 'Reinigungspläne', parentId: dKitchen, sortOrder: 1 } });
  await prisma.documentCategory.create({ data: { name: 'Verträge', parentId: dHr, sortOrder: 1 } });
  async function doc(o: { author: string; category: string; title: string; description: string; audience: Parameters<typeof item>[3]; recipients: string[]; sensitive?: boolean; versions: string[] }) {
    const id = await item('DOCUMENT', o.author, 300, o.audience, o.recipients, { commentsEnabled: false, reactionsEnabled: false, currentVersion: o.versions.length });
    await prisma.document.create({ data: { id, categoryId: o.category, title: o.title, description: o.description } });
    for (const [i, note] of o.versions.entries()) {
      await prisma.documentVersion.create({ data: { documentId: id, versionNumber: i + 1, fileObjectId: await file(`${o.title} v${i + 1}.pdf`, `${o.title} - Version ${i + 1} (Beispiel)`, o.author), changeNote: note, uploadedById: o.author, createdAt: ago(300 - i * 48) } });
    }
    if (!o.sensitive) await indexContent(prisma, id, o.versions.length, o.title, o.description);
  }
  await doc({ author: lena, category: dLeave, title: 'Urlaubsantrag', description: 'Formular für Urlaub und Freizeitausgleich. Bitte ausgefüllt bei deiner Leitung abgeben.', audience: house, recipients: c.sglPeople, versions: ['Erste Fassung', 'Neues Feld für Resturlaub'] });
  await doc({ author: T('sven.r'), category: dKitchen, title: 'Temperaturliste Kühlräume', description: 'Vorlage zum Ausdrucken, falls das Tablet ausfällt. Grenzwerte für Kühlraum, Tiefkühlraum und Patisserie.', audience: [{ targetType: 'GROUP', groupId: G('Küche') }], recipients: c.membersOf('Küche'), versions: ['Erste Fassung'] });
  await doc({ author: lena, category: dHr, title: 'Checkliste Personalakte', description: 'Welche Unterlagen bei einer Einstellung in die Personalakte gehören.', audience: [{ targetType: 'GROUP', groupId: G('Personal & Verwaltung') }], recipients: c.membersOf('Personal & Verwaltung'), sensitive: true, versions: ['Erste Fassung'] });

  // ---- Aufgaben -------------------------------------------------------------
  async function task(o: { author: string; title: string; description?: string; userId?: string; groupId?: string; dueInH?: number; priority?: 'NORMAL' | 'HIGH' | 'URGENT'; status?: 'OPEN' | 'IN_PROGRESS' | 'DONE' }) {
    const recipients = o.userId ? [o.userId] : c.membersOf(...[...groups.entries()].filter(([, v]) => v === o.groupId).map(([k]) => k));
    const id = await item('TASK', o.author, 20, [o.userId ? { targetType: 'USER', userId: o.userId } : { targetType: 'GROUP', groupId: o.groupId }], recipients, { reactionsEnabled: false });
    await prisma.task.create({ data: { id, title: o.title, description: o.description ?? null, priority: o.priority ?? 'NORMAL', status: o.status ?? 'OPEN', groupId: o.groupId ?? null,
      dueAt: o.dueInH != null ? new Date(Date.now() + o.dueInH * 3600_000) : null, completedAt: o.status === 'DONE' ? ago(2) : null,
      assignees: { create: { userId: o.userId ?? null, groupId: o.groupId ?? null, isResponsible: true } } } });
  }
  await task({ author: T('sven.r'), userId: jana, title: 'Allergenliste an der Rezeption aushängen', description: 'Die neue Liste liegt im Küchenbüro. Bitte die alte abnehmen.', dueInH: 26, priority: 'HIGH' });
  await task({ author: maren, groupId: G('Service'), title: 'Tischwäsche für die Hochzeit am Samstag zählen', dueInH: 50 });
  await task({ author: maren, userId: T('tobias.k'), title: 'Weinkarte Herbst Korrektur lesen', status: 'IN_PROGRESS', dueInH: 70 });
  await task({ author: jana, userId: jana, title: 'Namensschild neu bestellen', status: 'DONE' });

  // ---- Checklisten ----------------------------------------------------------
  const haccp = await prisma.checklist.create({ data: { companyId: sgl, groupId: G('Küche'), title: 'HACCP Kühlräume morgens', kind: 'HACCP', description: 'Jeden Morgen vor Arbeitsbeginn.',
    recurrenceRule: 'FREQ=DAILY;BYHOUR=6;BYMINUTE=0', nextRunAt: nextSix(),
    items: { create: [
      { title: 'Kühlraum 1', responseType: 'TEMPERATURE', minValue: 0, maxValue: 4, unit: '°C', sortOrder: 1, knowledgeArticleId: kuehlkette },
      { title: 'Tiefkühlraum', responseType: 'TEMPERATURE', minValue: -25, maxValue: -18, unit: '°C', sortOrder: 2 },
      { title: 'Kühlschrank Patisserie', responseType: 'TEMPERATURE', minValue: 0, maxValue: 7, unit: '°C', sortOrder: 3 },
      { title: 'Türdichtungen sauber und dicht', responseType: 'YES_NO', sortOrder: 4 },
      { title: 'Besonderheiten', responseType: 'TEXT', isRequired: false, sortOrder: 5 },
    ] } }, include: { items: true } });
  await prisma.checklist.create({ data: { companyId: sgl, groupId: G('Rezeption'), title: 'Rezeption Frühschicht', kind: 'SHIFT',
    items: { create: [
      { title: 'Kasse gezählt und Anfangsbestand eingetragen', sortOrder: 1 }, { title: 'Anreiseliste gedruckt', sortOrder: 2 },
      { title: 'Schlüsselkarten-Encoder geprüft', sortOrder: 3 }, { title: 'Übergabe der Nacht gelesen', sortOrder: 4 },
      { title: 'Notiz für die Spätschicht', responseType: 'TEXT', isRequired: false, sortOrder: 5 },
    ] } } });
  await prisma.checklist.create({ data: { companyId: sgl, groupId: G('Service'), title: 'Bankett Aufbau Schlosssaal', kind: 'EVENT', requiresApproval: true,
    items: { create: [
      { title: 'Tische nach Plan gestellt', sortOrder: 1 }, { title: 'Eindecken geprüft (Besteck, Gläser)', sortOrder: 2 },
      { title: 'Allergenkarten an den markierten Plätzen', sortOrder: 3 }, { title: 'Notausgänge frei', responseType: 'YES_NO', sortOrder: 4 },
    ] } } });
  const runId = await item('CHECKLIST_RUN', T('sven.r'), 26, [{ targetType: 'GROUP', groupId: G('Küche') }], c.membersOf('Küche'), { reactionsEnabled: false });
  const values: Record<string, { n?: number; t?: string; out?: boolean; note?: string }> = {
    'Kühlraum 1': { n: 3 }, Tiefkühlraum: { n: -16, out: true, note: 'Tür stand offen, geschlossen. Nachmessung 08:15: -19 °C.' }, 'Kühlschrank Patisserie': { n: 5 }, 'Türdichtungen sauber und dicht': { t: 'Ja' },
  };
  await prisma.checklistRun.create({ data: { id: runId, checklistId: haccp.id, checklistVersion: 1, assignedGroupId: G('Küche'), title: 'HACCP Kühlräume morgens · gestern', status: 'COMPLETED', startedAt: ago(26), completedAt: ago(25.5), completedById: T('sven.r'),
    items: { create: haccp.items.sort((a, b) => a.sortOrder - b.sortOrder).map((i) => { const v = values[i.title]; return { checklistItemId: i.id, titleSnapshot: i.title, sortOrder: i.sortOrder,
      isDone: !!v, valueNumber: v?.n ?? null, valueText: v?.t ?? null, isOutOfRange: v ? !!v.out : null, note: v?.note ?? null, completedById: v ? T('sven.r') : null, completedAt: v ? ago(25.6) : null }; }) } } });

  // ---- Umfragen -------------------------------------------------------------
  const surveyId = await item('SURVEY', lena, 48, house, c.sglPeople, { commentsEnabled: false, reactionsEnabled: false });
  await prisma.survey.create({ data: { id: surveyId, title: 'Wie zufrieden bist du mit dem Mitarbeiteressen?', description: 'Anonym. Hilft uns, die Kantine zu verbessern.', isAnonymous: true, purpose: 'Mitarbeitendenverpflegung', closesAt: new Date(Date.now() + 10 * 864e5) } });
  const q1 = await prisma.surveyQuestion.create({ data: { surveyId, prompt: 'Wie schmeckt dir das Essen?', type: 'SCALE', scaleMin: 1, scaleMax: 5, sortOrder: 1 } });
  const q2 = await prisma.surveyQuestion.create({ data: { surveyId, prompt: 'Was wünschst du dir öfter?', type: 'MULTIPLE_CHOICE', sortOrder: 2,
    options: { create: ['Vegetarisch', 'Salat & Bowl', 'Suppe', 'Hausmannskost'].map((label, i) => ({ label, sortOrder: i })) } }, include: { options: true } });
  const q3 = await prisma.surveyQuestion.create({ data: { surveyId, prompt: 'Was sollen wir sonst wissen?', type: 'FREE_TEXT', isRequired: false, sortOrder: 3 } });
  const answers: Array<[string, number, number[], string?]> = [
    ['tobias.k', 4, [0, 1]], ['ana.f', 5, [1]], ['selin.a', 3, [2], 'Für die Nachtschicht bleibt selten etwas übrig.'], ['jonas.w', 4, [0]], ['piotr.n', 2, [3], 'Öfter mal Pierogi :)'], ['marta.w', 4, [1, 2]],
  ];
  for (const [u, scale, opts, text] of answers) {
    await prisma.surveyParticipation.create({ data: { surveyId, userId: T(u), submittedOn: day() } });
    await prisma.surveyResponse.create({ data: { surveyId, respondentId: null, submittedOn: day(), answers: { create: [
      { questionId: q1.id, valueNumber: scale }, ...opts.map((o) => ({ questionId: q2.id, optionId: q2.options[o].id })), ...(text ? [{ questionId: q3.id, valueText: text }] : []),
    ] } } });
  }

  // ---- Ideen ----------------------------------------------------------------
  const iCat = async (name: string, sortOrder: number) => (await prisma.ideaCategory.create({ data: { name, sortOrder, companyId: sgl } })).id;
  const iGuests = await iCat('Gäste', 1); const iTeam = await iCat('Team & Arbeitsplatz', 2); const iGreen = await iCat('Nachhaltigkeit', 3);
  async function idea(o: { author: string; title: string; text: string; category: string; status: 'SUBMITTED' | 'IN_REVIEW' | 'IN_PROGRESS' | 'IMPLEMENTED'; hoursAgo: number; likes: string[]; note?: string }) {
    const id = await item('IDEA', o.author, o.hoursAgo, house, c.sglPeople);
    await prisma.idea.create({ data: { id, title: o.title, description: o.text, categoryId: o.category, status: o.status, statusHistory: { create: [
      { toStatus: 'SUBMITTED', changedById: o.author, createdAt: ago(o.hoursAgo) },
      ...(o.status !== 'SUBMITTED' ? [{ fromStatus: 'SUBMITTED' as const, toStatus: o.status, note: o.note ?? null, changedById: T('sven.r'), createdAt: ago(o.hoursAgo / 2) }] : []),
    ] } } });
    if (o.likes.length) await prisma.reaction.createMany({ data: o.likes.map((userId) => ({ contentItemId: id, userId })) });
  }
  await idea({ author: T('ana.f'), title: 'Kräuterbeet für Küche und Bar', text: 'Hinter der Orangerie ist Platz für ein kleines Kräuterbeet. Küche und Bar könnten Minze, Thymian und Basilikum selbst ernten.', category: iGreen, status: 'IN_PROGRESS', hoursAgo: 300, likes: [jana, T('tobias.k'), T('marta.w'), maren], note: 'Gärtnerei ist informiert, Start im Frühjahr.' });
  await idea({ author: T('selin.a'), title: 'Leselampe in der Nachtrezeption', text: 'Nachts ist das Licht an der Rezeption sehr grell. Eine warme Leselampe würde für Gäste und uns angenehmer sein.', category: iTeam, status: 'IN_REVIEW', hoursAgo: 120, likes: [jana, T('jonas.w')] });
  await idea({ author: jana, title: 'Kleine Karte mit Spazierwegen für Gäste', text: 'Viele Gäste fragen nach Wegen rund ums Schloss. Eine Karte mit drei Runden (30, 60, 90 Minuten) würde uns an der Rezeption viel erklären ersparen.', category: iGuests, status: 'SUBMITTED', hoursAgo: 30, likes: [T('piotr.n')] });

  // ---- Kontakte (Beispielfirmen) -------------------------------------------
  const ccat = async (name: string, sortOrder: number) => (await prisma.contactCategory.create({ data: { name, sortOrder } })).id;
  const cTech = await ccat('Technik & Notdienste', 1); const cFood = await ccat('Lebensmittel & Getränke', 2); const cServ = await ccat('Dienstleister', 3);
  await prisma.contact.createMany({ data: [
    { companyId: sgl, categoryId: cTech, type: 'MAINTENANCE', organizationName: 'Kältetechnik Beispiel GmbH', contactPerson: 'Herr Muster', phone: '03300 000 101', emergencyPhone: '0170 000 0101', isEmergencyContact: true, notes: 'Kühlräume und Tiefkühlraum. Notdienst 24/7.' },
    { companyId: sgl, categoryId: cTech, type: 'MAINTENANCE', organizationName: 'Aufzugsdienst Beispiel', phone: '03300 000 102', emergencyPhone: '0170 000 0102', isEmergencyContact: true, notes: 'Bei eingeschlossenen Personen sofort anrufen.' },
    { companyId: sgl, categoryId: cTech, type: 'SERVICE_PROVIDER', organizationName: 'Elektro Beispiel & Söhne', contactPerson: 'Frau Beispiel', phone: '03300 000 103', email: 'kontakt@elektro.example' },
    { companyId: sgl, categoryId: cFood, type: 'SUPPLIER', organizationName: 'Hofmolkerei Beispiel', contactPerson: 'Bestellannahme', phone: '03300 000 201', customerNumber: 'K-0000', notes: 'Bestellung bis 14 Uhr für den Folgetag.' },
    { companyId: sgl, categoryId: cFood, type: 'SUPPLIER', organizationName: 'Getränkehandel Beispiel', phone: '03300 000 202', email: 'bestellung@getraenke.example' },
    { companyId: sgl, categoryId: cServ, type: 'SERVICE_PROVIDER', organizationName: 'Wäscherei Beispiel', phone: '03300 000 301', notes: 'Abholung Mo, Mi, Fr ab 7 Uhr.' },
  ] });

  // ---- Ein- und Austritt (Vorlagen) ------------------------------------------
  await prisma.lifecycleTemplate.create({ data: { companyId: sgl, kind: 'ONBOARDING', name: 'Einarbeitung Service & Rezeption', steps: { create: [
    { sortOrder: 1, offsetDays: -3, title: 'Arbeitsplatz, Spind und Zugang vorbereiten', responsibleType: 'LINE_MANAGER' },
    { sortOrder: 2, offsetDays: 0, title: 'Begrüßung und Rundgang durchs Haus', responsibleType: 'LINE_MANAGER' },
    { sortOrder: 3, offsetDays: 0, title: 'Dienstkleidung abholen', responsibleType: 'SUBJECT_EMPLOYEE', linkedContentId: kleidung, requiresAcknowledgement: true },
    { sortOrder: 4, offsetDays: 1, title: 'Erste Hilfe und Notfälle lesen', responsibleType: 'SUBJECT_EMPLOYEE', linkedContentId: ersteHilfe, requiresAcknowledgement: true },
    { sortOrder: 5, offsetDays: 2, title: 'Patenschaft: zwei Schichten gemeinsam', responsibleType: 'LINE_MANAGER' },
    { sortOrder: 6, offsetDays: 30, title: 'Feedbackgespräch nach 30 Tagen', responsibleType: 'LINE_MANAGER' },
  ] } } });
  await prisma.lifecycleTemplate.create({ data: { companyId: sgl, kind: 'OFFBOARDING', name: 'Austritt', steps: { create: [
    { sortOrder: 1, offsetDays: -7, title: 'Übergabe für das Team schreiben', responsibleType: 'SUBJECT_EMPLOYEE' },
    { sortOrder: 2, offsetDays: 0, title: 'Schlüssel und Dienstkleidung zurückgeben', responsibleType: 'SUBJECT_EMPLOYEE' },
    { sortOrder: 3, offsetDays: 0, title: 'Abschlussgespräch und Zugang beenden', responsibleType: 'LINE_MANAGER' },
  ] } } });

  // Social: Urlaubsgruß mit (generiertem) Foto – zeigt das Foto-Symbol auf der Startseite
  const ostsee = await prisma.post.findFirst({ where: { title: 'Grüße von der Ostsee' }, include: { contentItem: true } });
  if (ostsee) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc9e8"/><stop offset="1" stop-color="#e9f3f9"/></linearGradient></defs>
      <rect width="1200" height="520" fill="url(#s)"/><circle cx="930" cy="170" r="70" fill="#ffd66b"/><rect y="500" width="1200" height="140" fill="#3f7fa8"/><rect y="630" width="1200" height="170" fill="#e8d6a8"/></svg>`;
    const data = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
    const id = randomUUID();
    const rel = path.join('seed', `${id}.webp`);
    await mkdir(path.join(storage, 'seed'), { recursive: true });
    await writeFile(path.join(storage, rel), data);
    await prisma.fileObject.create({ data: { id, storageKey: rel, originalFilename: 'ostsee.webp', mimeType: 'image/webp', sizeBytes: BigInt(data.length), checksumSha256: createHash('sha256').update(data).digest('hex'), scanStatus: 'CLEAN', uploadedById: ostsee.contentItem.authorId } });
    await prisma.attachment.create({ data: { fileObjectId: id, contentItemId: ostsee.id, kind: 'IMAGE', altText: 'Strand an der Ostsee mit Sonne', sortOrder: 0 } });
  }

  // Bestehende News in den Suchindex
  const news = await prisma.contentItem.findMany({ where: { type: 'POST', post: { kind: 'NEWS' } }, include: { post: true } });
  for (const n of news) await indexContent(prisma, n.id, 1, n.post!.title, n.post!.bodyText);
}
