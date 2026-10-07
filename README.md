# MnemoMind

Knowledge about the mind, in your memory.

> The name is provisional: a trademark search is still to be done.

MnemoMind is a cartridge for [Mnemosyne OS](https://github.com/Mnemosyne-OS).
You pick a topic, MnemoMind downloads reference texts about it from open
sources and writes them into a vault of your memory. Then you ask the chat in
your own words: "why do I remember the first and last items of a list?",
"what is the difference between bipolar disorder and depression?". Every
memory ends with a line that says where its text comes from, how recent it
is, and under which licence.

MnemoMind puts reference texts in memory. It gives no medical advice.

## What is in it

Five topics. Each one shows only the sources that really fill it.

| Topic | Wikipedia category read (en · fr · es) | OpenStax chapters | NIMH |
|---|---|---|---|
| Cognitive biases | Cognitive biases · Biais cognitif · Sesgos cognitivos | Thinking and Intelligence | |
| Mental disorders | Mental, behavioural or neurodevelopmental disorders · Pathologie en psychiatrie par groupe diagnostique · Trastornos mentales (one level of sub-categories, people left out) | Psychological Disorders, Therapy and Treatment, Stress, Lifestyle, and Health | 25 health topics |
| Schools of psychology | Psychological schools (one level) · Branche de la psychologie · Ramas de la psicología | Introduction, Research, Personality, Social Psychology, Lifespan Development, Emotion and Motivation, Industrial-Organizational | |
| Neuroscience | Neuroscience · Neurosciences · Neurociencia | Biopsychology, States of Consciousness, Sensation and Perception | |
| Memory and learning | Memory · Mémoire · Memoria | Learning, Memory | |

French and Spanish Wikipedia have no category for schools of psychology. The
nearest one, "branches of psychology", is read instead, and the screen names
the category it reads. Every chapter of the textbook is offered by one topic;
only its Preface is left out.

## Sources

| Source | How it is read | Unit | Date in each memory | Licence, as the source states it |
|---|---|---|---|---|
| Wikipedia, by category | MediaWiki API, straight from the cartridge (CORS `*`) | one page; a long page becomes several memories, cut at its sections | the revision read and its timestamp; the address points to that revision | Creative Commons Attribution-Share Alike 4.0 |
| [OpenStax, *Psychology 2e*](https://openstax.org/details/books/psychology-2e) | its repository `openstax/osbooks-psychology` on raw.githubusercontent.com (CORS `*`) | one module (a section of the book), with its chapter | the last commit that touched the module, read from GitHub's commit feed through Mnemosyne OS | read live from the book's `md:license`: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International |
| [NIMH](https://www.nimh.nih.gov/health/topics) health topics | through Mnemosyne OS (`social.fetch`): the site sends no CORS header | one topic: the topic page's definition, then the text of its publication | the topic page's "Last Reviewed" (a month, as written) and the publication's "Revised" year | The information on our website and in our materials is in the public domain and may be reused or copied without permission |

A date the source does not give is left out of the memory. It is never
replaced by the date of the download.

An NIMH topic page is mostly links. Its full text (types, symptoms,
treatment) is in a publication. Six topics have one at the same address
under `/health/publications/` (bipolar disorder, borderline personality
disorder, depression, eating disorders, PTSD, schizophrenia). For the others,
the memory keeps the topic page's own text without its link sections, and its
source line says that no publication was found.

A formula in a Wikipedia page is kept as its LaTeX between `$…$`.

Not wired:

- the Noba Project (CORS not tested, NC licence);
- the ICD-11 of the WHO (it needs an OAuth token);
- Wikidata. Doc 135 planned it to list and link entries across languages.
  The categories are read language by language instead.

## How a text enters memory

1. You open a source's list and pick an entry, or press "add everything not
   yet in memory". Nothing downloads before that.
2. The text is read at its source and cut into memories of at most 18 000
   characters, at its section headings. Each memory is titled with the source
   and the entry: `Wikipedia (fr) · Biais cognitif`,
   `OpenStax Psychology 2e · 8. Memory · How Memory Functions`.
3. The source line closes every memory.
4. Each topic is its own memory pack. A copy of each entry is written as JSON
   in your knowledge folder (the one you choose once in the Hub, under Memory
   Packs), filed by topic and source, next to an `ATTRIBUTION.md`.

"Add everything" resumes where it stopped: it skips what is already in memory.
The chat reads a topic when you tick it under Knowledge in the chat's scope.

## Install

Once the cartridge is published, open MnemoHub in Mnemosyne OS, choose to add
an external cartridge, and paste the repository's address. No repository
exists yet.

## Develop

This folder is outside the pnpm workspace. Install it with npm, in this folder:

```bash
npm install
npx vite          # serves the cartridge on port 5226
npx vite build    # writes dist/
npx vitest run
npx tsc --noEmit -p tsconfig.eslint.json
```

Two measuring scripts need the network:

```bash
npx vite-node scripts/live-check.ts   # lists every Wikipedia category, with its size
npx vite-node scripts/live-read.ts    # reads one real entry of each source
node scripts/build-openstax-titles.mjs  # rebuilds the shipped module titles
```

The tests read recorded answers in `src/fixtures/`, taken from the real
sources on 2026-10-04.

## Licence

The cartridge's code is under the MIT licence. The texts keep the terms of
their sources, listed above.
