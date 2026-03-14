type PreviousBlock = {
  episode_id: string;
  title: string;
  text_cn: string;
};

export type StorySummaryOutput = {
  recap?: {
    text_cn?: string;
    key_story_elements?: string[];
  };
  micro_goal?: {
    title?: string;
    text_cn?: string;
    rationale?: string;
  };
  continuity_hooks?: {
    carry_over_elements?: string[];
    open_threads?: string[];
    next_episode_seed?: string;
  };
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractBookText(content: string): string {
  try {
    const parsed = JSON.parse(content) as {
      pages?: Array<{ text?: unknown }>;
      book_meta?: { summary?: unknown };
    };
    const pageTexts = Array.isArray(parsed.pages)
      ? parsed.pages
        .map((p) => normalizeString(p?.text))
        .filter((t) => t.length > 0)
      : [];
    if (pageTexts.length > 0) return pageTexts.join("\n");
    const summary = normalizeString(parsed.book_meta?.summary);
    if (summary) return summary;
  } catch {
    // ignore malformed content
  }
  return normalizeString(content);
}

export function buildPreviousBlocks(
  books: Array<{ bookID: string; title: string; content: string }>,
): PreviousBlock[] {
  return books
    .slice(0, 3)
    .map((book) => ({
      episode_id: book.bookID,
      title: normalizeString(book.title) || "unspecified",
      text_cn: extractBookText(book.content),
    }))
    .filter((b) => b.text_cn.length > 0);
}
