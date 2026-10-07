/**
 * catalogue — the five sub-domains of MnemoMind and, for each, the sources
 * that really fill it (doc 135 §3quater: one tile per sub-domain, one tile
 * per source inside, and a tile exists ONLY for a wired, tested source).
 *
 * Every Wikipedia category below was checked to exist on 2026-10-04, and its
 * real name is shown on screen: where a wiki has no category for "schools of
 * psychology", the nearest one (fr "Branche de la psychologie") is read and
 * NAMED, never presented as something it is not.
 *
 * `depth: 1` = the root's sub-categories are walked one level (their pages
 * join the root's), minus the sub-categories named in `exclude` (people,
 * works). Never deeper: a category tree drifts fast into everything.
 */
import type { WikiLang } from './sourceInfo';

/** The five topics of the home screen. */
export type Subdomain = 'biases' | 'disorders' | 'schools' | 'neuro' | 'memory';
/** The sources wired into this cartridge (a tile exists only for these). */
export type SourceId = 'wikipedia' | 'openstax' | 'nimh';

/** The topics in the order the home screen shows them. */
export const SUBDOMAINS: readonly Subdomain[] = ['biases', 'disorders', 'schools', 'neuro', 'memory'];

/** English folder names, so the tree on disk does not change with the app's language. */
export const SUBDOMAIN_FOLDER: Record<Subdomain, string> = {
  biases: 'Cognitive biases',
  disorders: 'Mental disorders',
  schools: 'Schools of psychology',
  neuro: 'Neuroscience',
  memory: 'Memory and learning',
};

/** One Wikipedia category read for a topic in one language. */
export interface WikiRoot {
  /** The category title exactly as the wiki spells it. */
  category: string;
  depth: 0 | 1;
  /** Sub-categories never walked at depth 1 (people, works), exact titles. */
  exclude?: readonly string[];
  /** Pages this reader listed on 2026-10-04 (scripts/live-check.ts), redirects dropped, sub-categories included at depth 1. */
  listedPages: number;
}

/** The category read for each topic and language, checked to exist on 2026-10-04. */
export const WIKI_ROOTS: Record<Subdomain, Record<WikiLang, WikiRoot>> = {
  biases: {
    en: { category: 'Category:Cognitive biases', depth: 0, listedPages: 264 },
    fr: { category: 'Catégorie:Biais cognitif', depth: 0, listedPages: 131 },
    es: { category: 'Categoría:Sesgos cognitivos', depth: 0, listedPages: 135 },
  },
  disorders: {
    // The en root `Category:Mental disorders` holds 39 pages, mostly lists and
    // meta pages; the disorders sit one level down. This ICD-shaped category
    // has 17 sub-categories, all of them groups of disorders.
    en: { category: 'Category:Mental, behavioural or neurodevelopmental disorders', depth: 1, listedPages: 253 },
    // fr has no "Trouble mental" category: the interlanguage link of the en
    // `Mental disorders` leads here, 10 sub-categories, one per diagnostic group.
    fr: { category: 'Catégorie:Pathologie en psychiatrie par groupe diagnostique', depth: 1, listedPages: 246 },
    es: { category: 'Categoría:Trastornos mentales', depth: 1, listedPages: 257, exclude: ['Categoría:Personas con trastornos mentales'] },
  },
  schools: {
    en: { category: 'Category:Psychological schools', depth: 1, listedPages: 371, exclude: ['Category:Psychologists by school'] },
    // Neither fr nor es has a "schools" category: these are BRANCHES, named so on screen.
    fr: { category: 'Catégorie:Branche de la psychologie', depth: 0, listedPages: 38 },
    es: { category: 'Categoría:Ramas de la psicología', depth: 0, listedPages: 40 },
  },
  neuro: {
    en: { category: 'Category:Neuroscience', depth: 0, listedPages: 178 },
    fr: { category: 'Catégorie:Neurosciences', depth: 0, listedPages: 159 },
    es: { category: 'Categoría:Neurociencia', depth: 0, listedPages: 177 },
  },
  memory: {
    en: { category: 'Category:Memory', depth: 0, listedPages: 204 },
    fr: { category: 'Catégorie:Mémoire', depth: 0, listedPages: 92 },
    es: { category: 'Categoría:Memoria', depth: 0, listedPages: 63 },
  },
};

/**
 * The OpenStax chapters each sub-domain offers, by their exact title in the
 * collection. The Preface belongs to none and is not offered; a chapter the
 * collection renames disappears from here rather than being guessed.
 */
export const OPENSTAX_CHAPTERS: Record<Subdomain, readonly string[]> = {
  // Section 7.3 (Problem Solving) covers heuristics and biases.
  biases: ['Thinking and Intelligence'],
  disorders: ['Psychological Disorders', 'Therapy and Treatment', 'Stress, Lifestyle, and Health'],
  schools: [
    'Introduction to Psychology', 'Psychological Research', 'Personality', 'Social Psychology',
    'Lifespan Development', 'Emotion and Motivation', 'Industrial-Organizational Psychology',
  ],
  neuro: ['Biopsychology', 'States of Consciousness', 'Sensation and Perception'],
  memory: ['Learning', 'Memory'],
};

/** The sources a sub-domain shows, in tile order. NIMH's topics are mental-health topics only. */
export function sourcesOf(sub: Subdomain): SourceId[] {
  return sub === 'disorders' ? ['wikipedia', 'openstax', 'nimh'] : ['wikipedia', 'openstax'];
}

/** NIMH health topics listed on 2026-10-04 (English pages; the two Spanish pages are not read). */
export const NIMH_MEASURED_TOPICS = 25;
/** Modules in the collection on 2026-10-04 (Preface included). */
export const OPENSTAX_MEASURED_MODULES = 105;

/** Key of one source as it is filed in the library: `<sub>|<source>|<lang>`. */
export function batchKey(sub: Subdomain, source: SourceId, lang: string): string {
  return `${sub}|${source}|${lang}`;
}

/** Modules of each sub-domain's chapters on 2026-10-04 (all 104 chapter modules are offered somewhere). */
export const OPENSTAX_MEASURED_BY_SUB: Record<Subdomain, number> = { biases: 7, disorders: 24, schools: 43, neuro: 20, memory: 10 };

/** The day the sizes above were measured, shown next to them. */
export const MEASURED_ON = '2026-10-04';
