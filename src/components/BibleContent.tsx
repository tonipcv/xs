'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { Book, Chapter } from '@/types/bible';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { BIBLE_API_BASE_URL, DEFAULT_VERSION } from '@/config/bible';

const BOOKS = [
  { abbrev: 'genesis', name: 'Gênesis' },
  { abbrev: 'exodus', name: 'Êxodo' },
  { abbrev: 'leviticus', name: 'Levítico' },
  { abbrev: 'numbers', name: 'Números' },
  { abbrev: 'deuteronomy', name: 'Deuteronômio' },
  { abbrev: 'joshua', name: 'Josué' },
  { abbrev: 'judges', name: 'Juízes' },
  { abbrev: 'ruth', name: 'Rute' },
  { abbrev: '1samuel', name: '1 Samuel' },
  { abbrev: '2samuel', name: '2 Samuel' },
  { abbrev: '1kings', name: '1 Reis' },
  { abbrev: '2kings', name: '2 Reis' },
  { abbrev: '1chronicles', name: '1 Crônicas' },
  { abbrev: '2chronicles', name: '2 Crônicas' },
  { abbrev: 'ezra', name: 'Esdras' },
  { abbrev: 'nehemiah', name: 'Neemias' },
  { abbrev: 'esther', name: 'Ester' },
  { abbrev: 'job', name: 'Jó' },
  { abbrev: 'psalms', name: 'Salmos' },
  { abbrev: 'proverbs', name: 'Provérbios' },
  { abbrev: 'ecclesiastes', name: 'Eclesiastes' },
  { abbrev: 'songofsolomon', name: 'Cânticos' },
  { abbrev: 'isaiah', name: 'Isaías' },
  { abbrev: 'jeremiah', name: 'Jeremias' },
  { abbrev: 'lamentations', name: 'Lamentações' },
  { abbrev: 'ezekiel', name: 'Ezequiel' },
  { abbrev: 'daniel', name: 'Daniel' },
  { abbrev: 'hosea', name: 'Oséias' },
  { abbrev: 'joel', name: 'Joel' },
  { abbrev: 'amos', name: 'Amós' },
  { abbrev: 'obadiah', name: 'Obadias' },
  { abbrev: 'jonah', name: 'Jonas' },
  { abbrev: 'micah', name: 'Miquéias' },
  { abbrev: 'nahum', name: 'Naum' },
  { abbrev: 'habakkuk', name: 'Habacuque' },
  { abbrev: 'zephaniah', name: 'Sofonias' },
  { abbrev: 'haggai', name: 'Ageu' },
  { abbrev: 'zechariah', name: 'Zacarias' },
  { abbrev: 'malachi', name: 'Malaquias' },
  { abbrev: 'matthew', name: 'Mateus' },
  { abbrev: 'mark', name: 'Marcos' },
  { abbrev: 'luke', name: 'Lucas' },
  { abbrev: 'john', name: 'João' },
  { abbrev: 'acts', name: 'Atos' },
  { abbrev: 'romans', name: 'Romanos' },
  { abbrev: '1corinthians', name: '1 Coríntios' },
  { abbrev: '2corinthians', name: '2 Coríntios' },
  { abbrev: 'galatians', name: 'Gálatas' },
  { abbrev: 'ephesians', name: 'Efésios' },
  { abbrev: 'philippians', name: 'Filipenses' },
  { abbrev: 'colossians', name: 'Colossenses' },
  { abbrev: '1thessalonians', name: '1 Tessalonicenses' },
  { abbrev: '2thessalonians', name: '2 Tessalonicenses' },
  { abbrev: '1timothy', name: '1 Timóteo' },
  { abbrev: '2timothy', name: '2 Timóteo' },
  { abbrev: 'titus', name: 'Tito' },
  { abbrev: 'philemon', name: 'Filemom' },
  { abbrev: 'hebrews', name: 'Hebreus' },
  { abbrev: 'james', name: 'Tiago' },
  { abbrev: '1peter', name: '1 Pedro' },
  { abbrev: '2peter', name: '2 Pedro' },
  { abbrev: '1john', name: '1 João' },
  { abbrev: '2john', name: '2 João' },
  { abbrev: '3john', name: '3 João' },
  { abbrev: 'jude', name: 'Judas' },
  { abbrev: 'revelation', name: 'Apocalipse' },
];

interface BibleVerse {
  [key: string]: string;
}

export function BibleContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [chapter, setChapter] = useState<string>('1');
  const [verses, setVerses] = useState<BibleVerse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
  }, [status, router]);

  const fetchChapter = async () => {
    if (!selectedBook || !chapter) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${BIBLE_API_BASE_URL}/${DEFAULT_VERSION}/books/${selectedBook}/chapters/${chapter}.json`
      );
      
      if (!response.ok) {
        throw new Error('Erro ao carregar o capítulo');
      }
      
      const data = await response.json();
      setVerses(data);
    } catch (err) {
      setError('Erro ao carregar o capítulo. Por favor, tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBookChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedBook(e.target.value);
  };

  const handleChapterChange = (e: ChangeEvent<HTMLInputElement>) => {
    setChapter(e.target.value);
  };

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-300"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6 bg-[#111] min-h-screen text-white pb-20">
      <Card className="bg-[#111]/90 backdrop-blur-sm border border-gray-800">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-white">Bíblia Online</CardTitle>
          <CardDescription className="text-gray-400">
            Leia a Bíblia em português (King James Version)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <select
              className="flex h-10 w-full rounded-md border border-gray-800 bg-[#111] px-3 py-2 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-[#111]"
              value={selectedBook}
              onChange={handleBookChange}
            >
              <option value="">Selecione um livro</option>
              {BOOKS.map((book) => (
                <option key={book.abbrev} value={book.abbrev}>
                  {book.name}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min="1"
              value={chapter}
              onChange={handleChapterChange}
              placeholder="Capítulo"
              className="w-full md:w-32 bg-[#111] border-gray-800 text-white placeholder:text-gray-400 focus:ring-rose-500"
            />
            <Button 
              onClick={fetchChapter}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              Buscar
            </Button>
          </div>

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-full bg-gray-800" />
              ))}
            </div>
          )}

          {error && (
            <div className="text-rose-500 text-center p-4 border border-rose-500/20 rounded-md bg-rose-500/10">
              {error}
            </div>
          )}

          {verses && !loading && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">
                {BOOKS.find(b => b.abbrev === selectedBook)?.name} - Capítulo {chapter}
              </h2>
              <div className="space-y-2">
                {Object.entries(verses).map(([verseNumber, text]) => (
                  <p key={verseNumber} className="text-lg text-gray-300">
                    <span className="font-bold text-rose-500">{verseNumber}</span>{' '}
                    {text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 