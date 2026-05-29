import { useState } from 'react';

export type NotePriority = 'high' | 'medium' | 'low';
export type NoteStatus   = 'active' | 'done' | 'nope';

export interface Note {
  id: string;
  title: string;
  description: string;
  priority: NotePriority;
  createdAt: string;
  status: NoteStatus;
}

const STORAGE_KEY = 'omg_notes';

function load(): Note[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function save(notes: Note[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export const PRIORITY_ORDER: Record<NotePriority, number> = { high: 0, medium: 1, low: 2 };
export const PRIORITY_LABEL: Record<NotePriority, string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
export const PRIORITY_COLOR: Record<NotePriority, string> = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--blue)' };
export const PRIORITY_BG:    Record<NotePriority, string> = { high: 'var(--red-bg)', medium: 'var(--amber-bg)', low: 'var(--blue-bg)' };

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(load);

  function addNote(title: string, description: string, priority: NotePriority): void {
    const note: Note = { id: `n_${Date.now()}`, title, description, priority, createdAt: new Date().toISOString(), status: 'active' };
    const updated = [...notes, note];
    save(updated);
    setNotes(updated);
  }

  function archive(id: string, status: 'done' | 'nope'): void {
    const updated = notes.map(n => n.id === id ? { ...n, status } : n);
    save(updated);
    setNotes(updated);
  }

  function deleteNote(id: string): void {
    const updated = notes.filter(n => n.id !== id);
    save(updated);
    setNotes(updated);
  }

  return { notes, addNote, archive, deleteNote };
}
