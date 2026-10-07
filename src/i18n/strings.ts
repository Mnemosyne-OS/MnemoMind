/**
 * strings.ts — everything MnemoMind says, in the languages it says it in.
 *
 * Same contract as MnemoLaw: the host broadcasts its language, a key missing
 * from a locale falls back to English key by key, and an unknown placeholder
 * stays visible. en / fr / es are written (the product's three core
 * languages); de / pt / ru / zh read English until written.
 *
 * The texts themselves are never translated: a page is put in memory in the
 * language it was written in, and a licence is quoted as its source states it.
 */

/** The languages the host may broadcast; en/fr/es are written, the others read English. */
export const LANGS = ['en', 'fr', 'es', 'de', 'pt', 'ru', 'zh'] as const;
/** One of the languages the host may broadcast. */
export type Lang = (typeof LANGS)[number];

const en = {
  'app.subtitle': 'Knowledge about the mind, in your memory',
  'app.advice': 'MnemoMind puts reference texts in memory. It gives no medical advice.',
  'nav.back': '← All topics',

  'home.lead': 'Pick a topic. Each source inside says what it holds and under which licence; nothing downloads before you press a button.',
  'home.sub.biases': 'Cognitive biases',
  'home.sub.disorders': 'Mental disorders',
  'home.sub.schools': 'Schools of psychology',
  'home.sub.neuro': 'Neuroscience',
  'home.sub.memory': 'Memory and learning',
  'home.nothingYet': 'Nothing in memory yet',
  'home.reading': 'Reading what is in memory…',
  'home.unreadable': 'What is in memory could not be read',
  'lib.unreadable': 'MnemoMind could not read what it already put in memory ({why}). Nothing can be added until it can: adding now would overwrite that record.',
  'lib.retry': 'Read it again',
  'list.retry': 'Try again',
  'lang.en': 'English',
  'lang.fr': 'French',
  'lang.es': 'Spanish',
  'home.inMemory': '{n} entries in memory · last on {date}',
  'home.sources': 'Sources: {list}',

  'source.wikipedia': 'Wikipedia',
  'source.openstax': 'OpenStax · Psychology 2e',
  'source.nimh': 'NIMH · Health topics',
  'source.licence': 'Licence, as the source states it: {licence}',
  'source.lang': 'Language: {lang}',
  'source.langPick': 'Language of the pages',
  'source.category': 'Category read: {category}',
  'source.subcats': 'and its {n} sub-categories, one level down',
  'source.chapters': 'Chapters: {list}',
  'source.sizePages': '{n} pages listed on {date}',
  'source.sizeModules': '{n} modules in the book on {date}, {mine} of them in these chapters',
  'source.sizeTopics': '{n} topics listed on {date}',
  'source.sizeLive': '{n} entries in the list now',
  'source.viaHost': 'This site does not let a cartridge read it directly: MnemoMind asks Mnemosyne OS to fetch it (permission “read your memory”).',
  'source.inMemory': '{n} in memory',
  'source.open': 'Open the list',
  'source.close': 'Close the list',
  'source.loading': 'Reading the list… {n} entries, {s} s',
  'source.failed': 'The list could not be read: {why}',
  'source.capped': 'The list stopped at {n} entries.',

  'list.filter': 'Find an entry',
  'list.count': '{shown} of {n} entries',
  'list.none': 'No entry matches “{q}”.',
  'list.add': 'Add to memory',
  'list.again': 'Add again',
  'list.inMemory': 'in memory',
  'list.failed': 'some parts refused',
  'list.refused': 'nothing usable at the source',
  'list.more': '{n} more: refine the search to see them.',

  'all.button': 'Add everything not yet in memory ({n})',
  'all.none': 'Everything in this list is in memory.',
  'all.finished': 'Done: {added} added, {failed} with parts refused by the vault, {refused} with nothing usable at the source.',
  'all.stopped': 'Stopped after {added} entries. The next press starts at the first entry not yet in memory.',

  'job.reading': 'Reading “{title}”… {s} s',
  'job.all': 'Adding to memory… {done} / {todo} · {elapsed}',
  'job.eta': 'about {left} left',
  'job.stop': 'Stop',

  'import.done': '“{title}” is in memory ({parts} parts).',
  'import.partial': '“{title}”: {inVault} of {parts} parts reached memory.',
  'import.noDate': 'The source gave no date for “{title}”: its memory says so by giving none.',
  'import.stopped': 'Stopped.',
  'import.failed': 'It did not work: {why}',
  'import.noKnowledgeRoot': 'Choose where knowledge goes in the Hub that just opened, then try again.',

  'footer.folder': 'Copies are kept in {folder}',
  'footer.noFolder': 'Copies are kept in your knowledge folder from the first addition.',
  'footer.open': 'Open the folder',

  'chat.hint': 'To ask a question in your own words, open the chat and tick the topic under Knowledge in its scope. Every memory ends with the line that says where its text comes from.',
};

/** A string the cartridge says (every key exists in English). */
export type Key = keyof typeof en;
type Dict = Partial<Record<Key, string>>;

const fr: Dict = {
  'app.subtitle': 'Les connaissances sur l’esprit, dans ta mémoire',
  'app.advice': 'MnemoMind range des textes de référence en mémoire. Il ne donne pas de conseil médical.',
  'nav.back': '← Tous les sujets',

  'home.lead': 'Choisis un sujet. Chaque source à l’intérieur dit ce qu’elle contient et sous quelle licence ; rien ne se télécharge avant que tu appuies sur un bouton.',
  'home.sub.biases': 'Biais cognitifs',
  'home.sub.disorders': 'Troubles mentaux',
  'home.sub.schools': 'Grands courants de la psychologie',
  'home.sub.neuro': 'Neurosciences',
  'home.sub.memory': 'Mémoire et apprentissage',
  'home.nothingYet': 'Rien en mémoire pour l’instant',
  'home.reading': 'Lecture de ce qui est en mémoire…',
  'home.unreadable': 'Ce qui est en mémoire n’a pas pu être lu',
  'lib.unreadable': 'MnemoMind n’a pas pu lire ce qu’il a déjà versé en mémoire ({why}). Rien ne peut être versé tant qu’il ne le peut pas : verser maintenant écraserait ce registre.',
  'lib.retry': 'Relire',
  'list.retry': 'Réessayer',
  'lang.en': 'anglais',
  'lang.fr': 'français',
  'lang.es': 'espagnol',
  'home.inMemory': '{n} entrées en mémoire · dernière le {date}',
  'home.sources': 'Sources : {list}',

  'source.wikipedia': 'Wikipédia',
  'source.openstax': 'OpenStax · Psychology 2e',
  'source.nimh': 'NIMH · Sujets de santé',
  'source.licence': 'Licence, telle que la source l’écrit : {licence}',
  'source.lang': 'Langue : {lang}',
  'source.langPick': 'Langue des pages',
  'source.category': 'Catégorie lue : {category}',
  'source.subcats': 'et ses {n} sous-catégories, un niveau plus bas',
  'source.chapters': 'Chapitres : {list}',
  'source.sizePages': '{n} pages listées le {date}',
  'source.sizeModules': '{n} modules dans le livre le {date}, dont {mine} dans ces chapitres',
  'source.sizeTopics': '{n} sujets listés le {date}',
  'source.sizeLive': '{n} entrées dans la liste maintenant',
  'source.viaHost': 'Ce site ne se laisse pas lire directement par une cartouche : MnemoMind demande à Mnemosyne OS d’aller le chercher (permission « lire ta mémoire »).',
  'source.inMemory': '{n} en mémoire',
  'source.open': 'Ouvrir la liste',
  'source.close': 'Fermer la liste',
  'source.loading': 'Lecture de la liste… {n} entrées, {s} s',
  'source.failed': 'La liste n’a pas pu être lue : {why}',
  'source.capped': 'La liste s’est arrêtée à {n} entrées.',

  'list.filter': 'Chercher une entrée',
  'list.count': '{shown} sur {n} entrées',
  'list.none': 'Aucune entrée ne correspond à « {q} ».',
  'list.add': 'Verser en mémoire',
  'list.again': 'Verser à nouveau',
  'list.inMemory': 'en mémoire',
  'list.failed': 'des parties refusées',
  'list.refused': 'rien d’utilisable à la source',
  'list.more': 'Encore {n} : affine la recherche pour les voir.',

  'all.button': 'Verser tout ce qui n’est pas encore en mémoire ({n})',
  'all.none': 'Tout ce que contient cette liste est en mémoire.',
  'all.finished': 'Fini : {added} versées, {failed} avec des parties refusées par le coffre, {refused} sans rien d’utilisable à la source.',
  'all.stopped': 'Arrêté après {added} entrées. Le prochain appui reprend à la première entrée pas encore en mémoire.',

  'job.reading': 'Lecture de « {title} »… {s} s',
  'job.all': 'Versement en mémoire… {done} / {todo} · {elapsed}',
  'job.eta': 'environ {left} restant',
  'job.stop': 'Arrêter',

  'import.done': '« {title} » est en mémoire ({parts} parties).',
  'import.partial': '« {title} » : {inVault} parties sur {parts} sont arrivées en mémoire.',
  'import.noDate': 'La source n’a donné aucune date pour « {title} » : sa mémoire le dit en n’en donnant aucune.',
  'import.stopped': 'Arrêté.',
  'import.failed': 'Ça n’a pas marché : {why}',
  'import.noKnowledgeRoot': 'Choisis où ranger les connaissances dans le Hub qui vient de s’ouvrir, puis réessaie.',

  'footer.folder': 'Les copies sont gardées dans {folder}',
  'footer.noFolder': 'Les copies sont gardées dans ton dossier des connaissances dès le premier ajout.',
  'footer.open': 'Ouvrir le dossier',

  'chat.hint': 'Pour poser une question avec tes mots, ouvre le chat et coche le sujet sous Connaissances dans sa portée. Chaque mémoire finit par la ligne qui dit d’où vient son texte.',
};

const es: Dict = {
  'app.subtitle': 'El conocimiento sobre la mente, en tu memoria',
  'app.advice': 'MnemoMind guarda textos de referencia en la memoria. No da consejo médico.',
  'nav.back': '← Todos los temas',

  'home.lead': 'Elige un tema. Cada fuente dice lo que contiene y bajo qué licencia; nada se descarga antes de que pulses un botón.',
  'home.sub.biases': 'Sesgos cognitivos',
  'home.sub.disorders': 'Trastornos mentales',
  'home.sub.schools': 'Corrientes de la psicología',
  'home.sub.neuro': 'Neurociencia',
  'home.sub.memory': 'Memoria y aprendizaje',
  'home.nothingYet': 'Nada en la memoria todavía',
  'home.reading': 'Leyendo lo que hay en la memoria…',
  'home.unreadable': 'No se pudo leer lo que hay en la memoria',
  'lib.unreadable': 'MnemoMind no pudo leer lo que ya guardó en la memoria ({why}). No se puede guardar nada hasta que pueda: guardar ahora sobrescribiría ese registro.',
  'lib.retry': 'Leer de nuevo',
  'list.retry': 'Reintentar',
  'lang.en': 'inglés',
  'lang.fr': 'francés',
  'lang.es': 'español',
  'home.inMemory': '{n} entradas en la memoria · la última el {date}',
  'home.sources': 'Fuentes: {list}',

  'source.wikipedia': 'Wikipedia',
  'source.openstax': 'OpenStax · Psychology 2e',
  'source.nimh': 'NIMH · Temas de salud',
  'source.licence': 'Licencia, tal como la fuente la escribe: {licence}',
  'source.lang': 'Idioma: {lang}',
  'source.langPick': 'Idioma de las páginas',
  'source.category': 'Categoría leída: {category}',
  'source.subcats': 'y sus {n} subcategorías, un nivel más abajo',
  'source.chapters': 'Capítulos: {list}',
  'source.sizePages': '{n} páginas listadas el {date}',
  'source.sizeModules': '{n} módulos en el libro el {date}, {mine} de ellos en estos capítulos',
  'source.sizeTopics': '{n} temas listados el {date}',
  'source.sizeLive': '{n} entradas en la lista ahora',
  'source.viaHost': 'Este sitio no se deja leer directamente por un cartucho: MnemoMind pide a Mnemosyne OS que lo traiga (permiso «leer tu memoria»).',
  'source.inMemory': '{n} en la memoria',
  'source.open': 'Abrir la lista',
  'source.close': 'Cerrar la lista',
  'source.loading': 'Leyendo la lista… {n} entradas, {s} s',
  'source.failed': 'No se pudo leer la lista: {why}',
  'source.capped': 'La lista se detuvo en {n} entradas.',

  'list.filter': 'Buscar una entrada',
  'list.count': '{shown} de {n} entradas',
  'list.none': 'Ninguna entrada coincide con «{q}».',
  'list.add': 'Guardar en la memoria',
  'list.again': 'Guardar de nuevo',
  'list.inMemory': 'en la memoria',
  'list.failed': 'partes rechazadas',
  'list.refused': 'nada utilizable en la fuente',
  'list.more': '{n} más: afina la búsqueda para verlas.',

  'all.button': 'Guardar todo lo que aún no está en la memoria ({n})',
  'all.none': 'Todo lo de esta lista está en la memoria.',
  'all.finished': 'Hecho: {added} guardadas, {failed} con partes rechazadas por la bóveda, {refused} sin nada utilizable en la fuente.',
  'all.stopped': 'Detenido tras {added} entradas. La próxima vez empieza en la primera entrada que aún no está en la memoria.',

  'job.reading': 'Leyendo «{title}»… {s} s',
  'job.all': 'Guardando en la memoria… {done} / {todo} · {elapsed}',
  'job.eta': 'quedan unos {left}',
  'job.stop': 'Detener',

  'import.done': '«{title}» está en la memoria ({parts} partes).',
  'import.partial': '«{title}»: {inVault} de {parts} partes llegaron a la memoria.',
  'import.noDate': 'La fuente no dio ninguna fecha para «{title}»: su memoria lo dice sin dar ninguna.',
  'import.stopped': 'Detenido.',
  'import.failed': 'No funcionó: {why}',
  'import.noKnowledgeRoot': 'Elige dónde guardar el conocimiento en el Hub que se acaba de abrir y vuelve a intentarlo.',

  'footer.folder': 'Las copias se guardan en {folder}',
  'footer.noFolder': 'Las copias se guardan en tu carpeta de conocimiento desde la primera vez que guardas algo.',
  'footer.open': 'Abrir la carpeta',

  'chat.hint': 'Para preguntar con tus palabras, abre el chat y marca el tema en Conocimientos, en su alcance. Cada memoria termina con la línea que dice de dónde viene su texto.',
};

/** de / pt / ru / zh are not written yet: those locales read English. */
const DICTS: Record<Lang, Dict> = { en, fr, es, de: {}, pt: {}, ru: {}, zh: {} };

/** True for a language the cartridge knows. */
export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as readonly string[]).includes(x);
}

/** One string, in one language, with `{placeholders}` filled. A missing key reads English. */
export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = DICTS[lang]?.[key] ?? en[key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** For the parity test: every written locale and its dictionary. */
export const WRITTEN: Record<'en' | 'fr' | 'es', Dict> = { en, fr, es };
