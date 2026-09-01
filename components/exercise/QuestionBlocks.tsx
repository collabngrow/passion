import type { ContentBlock, InlineSegment } from "@/lib/exercise/types";

/**
 * Renders parsed question prose.
 *
 * The blocks were structured at build time (scripts/build-exercise.mjs), so
 * there is no Markdown parser in the client bundle and no dangerouslySetInnerHTML
 * anywhere near exercise content (§91).
 */

function Inline({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-semibold text-ink">
            {segment.text}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function QuestionBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="leading-relaxed text-ink-soft">
            <Inline segments={block.segments} />
          </p>
        ) : (
          <ul key={index} className="space-y-2 pl-1">
            {block.items.map((item, itemIndex) => (
              <li
                key={itemIndex}
                className="flex gap-3 leading-relaxed text-ink-soft"
              >
                <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                <span>
                  <Inline segments={item} />
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
