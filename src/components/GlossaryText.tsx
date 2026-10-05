import { glossaryEntries } from '../data/glossary';
import type { ReactNode } from 'react';

type Match = {
  text: string;
  definition: string;
  start: number;
  end: number;
};

const termLookup = new Map<string, string>(
  glossaryEntries.flatMap((entry) => {
    const terms: [string, string][] = [[entry.term.toLowerCase(), entry.definition]];
    for (const alias of entry.aliases ?? []) {
      terms.push([alias.toLowerCase(), entry.definition]);
    }
    return terms;
  })
);

const escapedTerms = [...termLookup.keys()]
  .sort((left, right) => right.length - left.length)
  .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const termPattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');

function findMatches(text: string) {
  const matches: Match[] = [];
  let match: RegExpExecArray | null;

  termPattern.lastIndex = 0;
  while ((match = termPattern.exec(text))) {
    const term = match[0];
    const definition = termLookup.get(term.toLowerCase());
    if (!definition) continue;

    matches.push({
      text: term,
      definition,
      start: match.index,
      end: match.index + term.length
    });
  }

  return matches;
}

export function GlossaryText({ text }: { text: string }) {
  const matches = findMatches(text);
  if (matches.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }

    parts.push(
      <span className="glossary-term" tabIndex={0} role="button" aria-label={`${match.text}: ${match.definition}`} key={`${match.start}-${match.text}`}>
        {match.text}
        <span className="glossary-popover" role="tooltip">
          {match.definition}
        </span>
      </span>
    );
    cursor = match.end;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}
