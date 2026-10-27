export type SearchRecordType = 'party' | 'lead' | 'unit' | 'invoice' | 'project' | 'tenant' | 'request';

/** A record hit for Ctrl+K. Scope filtering happens in the transport, before the UI sees it. */
export interface SearchRecord {
  type: SearchRecordType;
  id: string;
  ref: string;
  /** Primary text as stored (names stay in their original script). */
  title: string;
  /** Secondary context, e.g. phone or project; Latin values are rendered bidi-isolated. */
  subtitle?: string;
  href: string;
}

export interface SearchResponse {
  query: string;
  records: SearchRecord[];
}
