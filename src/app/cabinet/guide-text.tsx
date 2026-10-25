import Link from "next/link";
import type { ReactNode } from "react";
import { isSafeHref, MARKS } from "@/guide";

/** One guide line, or one line of an assistant answer, with its marks turned into elements. */
export function guideText(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  let k = 0;
  for (const m of line.matchAll(MARKS)) {
    if (m.index > at) out.push(line.slice(at, m.index));
    if (m[1] !== undefined) out.push(<code key={k++} className="rounded bg-canvas px-1 font-mono text-[0.92em]">{m[1]}</code>);
    else if (m[2] !== undefined) {
      out.push(
        isSafeHref(m[3]!) ? (
          <Link key={k++} href={m[3]!} className="font-medium text-brand underline">
            {m[2]}
          </Link>
        ) : (
          m[2]
        ),
      );
    } else out.push(<strong key={k++}>{m[4]}</strong>);
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push(line.slice(at));
  return out;
}

/**
 * An assistant answer: paragraphs, and numbered or dashed lists, each line through guideText.
 * Nothing else is rendered as markup, whatever the model writes.
 */
export function AnswerText({ text }: { text: string }) {
  const blocks: { kind: "p" | "ol" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const kind = ol ? "ol" : ul ? "ul" : "p";
    const body = ol?.[1] ?? ul?.[1] ?? line;
    const last = blocks[blocks.length - 1];
    if (kind !== "p" && last?.kind === kind) last.lines.push(body);
    else blocks.push({ kind, lines: [body] });
  }
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{guideText(b.lines[0]!)}</p>
        ) : b.kind === "ol" ? (
          <ol key={i} className="list-decimal pl-5">
            {b.lines.map((l, j) => (
              <li key={j}>{guideText(l)}</li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc pl-5">
            {b.lines.map((l, j) => (
              <li key={j}>{guideText(l)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
