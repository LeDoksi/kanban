import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Описания и комментарии пишет агент в Markdown (**Files:**, списки, код) —
// раньше они показывались сырыми звёздочками. HTML после marked всегда
// проходит DOMPurify: текст приходит из базы, куда пишут и MCP-агент, и
// люди. Окно передаётся снаружи, чтобы тест мог подставить jsdom.
export function makeRenderer(win: Window & typeof globalThis): (src: string) => string {
  const purify = DOMPurify(win);
  purify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return src => purify.sanitize(marked.parse(src, { async: false, gfm: true, breaks: true }) as string);
}
