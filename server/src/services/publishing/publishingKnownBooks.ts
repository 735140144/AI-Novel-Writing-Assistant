import { mapPublishingKnownBookOption } from "./publishingMappers";
import { buildPublishingBookOptions } from "./publishingBookOptions";

interface KnownBookBindingRow {
  bookId: string;
  bookTitle: string;
  updatedAt: Date;
  credential: {
    id: string;
    label: string;
  };
  novel: {
    id: string;
    title: string;
  };
}

interface KnownBookJobRow {
  credentialId: string;
  bookId: string;
  bookTitle: string;
  submittedAt: Date | null;
}

export function buildKnownBookOptionsFromWorkspace(input: {
  bindings: KnownBookBindingRow[];
  jobs: KnownBookJobRow[];
}) {
  const bindingOptions = input.bindings.map((row) =>
    mapPublishingKnownBookOption({
      credentialId: row.credential.id,
      credentialLabel: row.credential.label,
      bookId: row.bookId,
      bookTitle: row.bookTitle,
      sourceNovelId: row.novel.id,
      sourceNovelTitle: row.novel.title,
      lastUsedAt: row.updatedAt,
    }));

  return buildPublishingBookOptions({
    bindings: bindingOptions.map((item) => ({
      credentialId: item.credentialId,
      platform: "fanqie",
      bookId: item.bookId,
      bookTitle: item.bookTitle,
      updatedAt: item.lastUsedAt ?? null,
      credentialLabel: item.credentialLabel,
      sourceNovelId: item.sourceNovelId,
      sourceNovelTitle: item.sourceNovelTitle,
    })),
    jobs: input.jobs.map((row) => ({
      credentialId: row.credentialId,
      bookId: row.bookId,
      bookTitle: row.bookTitle,
      submittedAt: row.submittedAt?.toISOString() ?? null,
    })),
  }).map(({ id: _id, ...option }) => option);
}
