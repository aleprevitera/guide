import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

// Whitelist volutamente molto più stretta del default di rehype-sanitize:
// nessun heading, nessuna immagine, nessun attributo di stile/classe,
// nessun tag di layout (div, table, iframe, script...). Questo è il
// vero cancello di sicurezza: anche se un editor riuscisse a scrivere
// "# Titolo" o "<script>" in un campo del CMS, questi vengono rimossi
// qui prima di raggiungere il DOM, indipendentemente dalle restrizioni
// della UI di Decap.
const restrictedSchema = {
  ...defaultSchema,
  tagNames: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
  attributes: {
    a: ['href', 'title'],
  },
  protocols: {
    href: ['http', 'https', 'mailto'],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeSanitize, restrictedSchema)
  .use(rehypeStringify);

export async function renderRestrictedMarkdown(source: string): Promise<string> {
  const file = await processor.process(source);
  return String(file);
}
