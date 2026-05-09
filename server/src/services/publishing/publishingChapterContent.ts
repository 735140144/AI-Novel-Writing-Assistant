type ChapterContentLike = {
  content?: string | null;
};

export function hasPublishingChapterContent(content: string | null | undefined): boolean {
  return typeof content === "string" && content.trim().length > 0;
}

export function countPublishingReadyChapters<T extends ChapterContentLike>(chapters: T[]): number {
  return chapters.filter((chapter) => hasPublishingChapterContent(chapter.content)).length;
}
