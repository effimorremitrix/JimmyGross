/** A part of a page's guide: ordered `steps`, or unordered `items`. */
export interface GuideSection {
  heading: string;
  /** What has to be prepared, exported or set up before the page can be used. */
  kind?: "install";
  steps?: string[];
  items?: string[];
}

export interface Guide {
  title: string;
  intro?: string;
  sections: GuideSection[];
}

/** One guide per cabinet page, plus the patient's journey (no page of its own). */
export type GuideId = "agenda" | "import" | "nouveau" | "modeles" | "demande" | "patient";

export type Guides = Record<GuideId, Guide>;

export type GuideLang = "fr" | "en";
