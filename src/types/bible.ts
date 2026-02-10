export interface Book {
  abbrev: string;
  name: string;
}

export interface Verse {
  verse: number;
  text: string;
}

export interface Chapter {
  book: string;
  chapter: number;
  verses: Verse[];
}

export interface Version {
  version: string;
  verses: number;
} 