import React, { useState } from 'react';
import { PageTopbar, BtnPrimary, BtnSecondary, BtnDanger, Modal, FormRow, Input, ModalFooter } from '../components/UI';
import { useNotes, PRIORITY_ORDER, PRIORITY_LABEL, PRIORITY_COLOR, PRIORITY_BG, type NotePriority, type NoteStatus } from '../utils/notes';

const PRIORITIES: NotePriority[] = ['high', 'medium', 'low'];

export default function Notes() {
  const { notes, addNote, archive, deleteNote } = useNotes();

  const [showModal, setShowModal]     = useState(false);
  const [formTitle, setFormTitle]     = useState('');
  const [formDesc, setFormDesc]       = useState('');
  const [formPrio, setFormPrio]       = useState<NotePriority>('medium');
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTab, setArchiveTab]   = useState<'done' | 'nope'>('done');

  const activeNotes = notes
    .filter(n => n.status === 'active')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const archivedNotes = notes
    .filter(n => n.status === archiveTab)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAdd() {
    if (!formTitle.trim()) return;
    addNote(formTitle.trim(), formDesc.trim(), formPrio);
    setFormTitle(''); setFormDesc(''); setFormPrio('medium');
    setShowModal(false);
  }

  function NoteCard({ note, showActions, onDelete }: { note: typeof activeNotes[0]; showActions: boolean; onDelete?: () => void }) {
    const isExpanded = expanded.has(note.id);
    return (
      <div style={{
        border: `1.5px solid ${PRIORITY_COLOR[note.priority]}`,
        borderRadius: 10,
        marginBottom: 10,
        background: 'var(--bg-primary)',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {/* Заголовок */}
        <div
          onClick={() => note.description ? toggleExpand(note.id) : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px',
            cursor: note.description ? 'pointer' : 'default',
            background: PRIORITY_BG[note.priority],
          }}
        >
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: PRIORITY_COLOR[note.priority], color: '#fff',
            flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{PRIORITY_LABEL[note.priority]}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{note.title}</span>
          {note.description && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
              {isExpanded ? '▲' : '▼'}
            </span>
          )}
        </div>

        {/* Описание (раскрывается) */}
        {isExpanded && note.description && (
          <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)', borderTop: `0.5px solid ${PRIORITY_COLOR[note.priority]}`, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {note.description}
          </div>
        )}

        {/* Кнопки действий */}
        {(showActions || onDelete) && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '0.5px solid var(--border-light)' }}>
            {showActions && <>
              <button
                onClick={() => archive(note.id, 'done')}
                style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1.5px solid var(--success)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--success)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--success-bg)'; e.currentTarget.style.color = 'var(--success)'; }}
              >✓ Сделано</button>
              <button
                onClick={() => archive(note.id, 'nope')}
                style={{ flex: 1, padding: '7px 12px', borderRadius: 6, border: '1.5px solid var(--red)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--red-bg)'; e.currentTarget.style.color = 'var(--red)'; }}
              >✕ Нахер</button>
            </>}
            {onDelete && (
              <button
                onClick={onDelete}
                style={{ padding: '7px 14px', borderRadius: 6, border: '1.5px solid var(--border-mid)', background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', fontSize: 13, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              >🗑 Удалить</button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <PageTopbar title="Заметки">
        <BtnPrimary onClick={() => setShowModal(true)}>+ Добавить заметку</BtnPrimary>
      </PageTopbar>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{ maxWidth: 640 }}>

          {/* Активные заметки */}
          {activeNotes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: 14 }}>
              Нет активных заметок
            </div>
          )}
          {activeNotes.map(note => (
            <NoteCard key={note.id} note={note} showActions={true}/>
          ))}

          {/* Архив */}
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setShowArchive(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600 }}
            >
              <span>{showArchive ? '▼' : '▶'}</span>
              <span>Архив ({notes.filter(n => n.status !== 'active').length})</span>
            </button>

            {showArchive && (
              <div style={{ marginTop: 12 }}>
                {/* Табы */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['done', 'nope'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setArchiveTab(tab)}
                      style={{
                        padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: archiveTab === tab ? 600 : 400,
                        border: `1.5px solid ${archiveTab === tab ? (tab === 'done' ? 'var(--success)' : 'var(--red)') : 'var(--border-mid)'}`,
                        background: archiveTab === tab ? (tab === 'done' ? 'var(--success-bg)' : 'var(--red-bg)') : 'var(--bg-secondary)',
                        color: archiveTab === tab ? (tab === 'done' ? 'var(--success)' : 'var(--red)') : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {tab === 'done' ? '✓ Сделано' : '✕ Нахер'} ({notes.filter(n => n.status === tab).length})
                    </button>
                  ))}
                </div>

                {archivedNotes.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>Пусто</div>
                )}
                {archivedNotes.map(note => (
                  <NoteCard key={note.id} note={note} showActions={false} onDelete={() => deleteNote(note.id)}/>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модалка добавления */}
      {showModal && (
        <Modal title="Новая заметка" onClose={() => setShowModal(false)} width={460}>
          <FormRow label="Заголовок">
            <Input
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="Введите заголовок"
            />
          </FormRow>
          <FormRow label="Описание">
            <textarea
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder="Необязательно..."
              rows={4}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: '1.5px solid var(--border-mid)', background: 'var(--bg-secondary)',
                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-mid)')}
            />
          </FormRow>
          <FormRow label="Приоритет">
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  onClick={() => setFormPrio(p)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 13, fontWeight: formPrio === p ? 700 : 400,
                    border: `1.5px solid ${formPrio === p ? PRIORITY_COLOR[p] : 'var(--border-mid)'}`,
                    background: formPrio === p ? PRIORITY_BG[p] : 'var(--bg-secondary)',
                    color: formPrio === p ? PRIORITY_COLOR[p] : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >{PRIORITY_LABEL[p]}</button>
              ))}
            </div>
          </FormRow>
          <ModalFooter onCancel={() => setShowModal(false)} onSave={handleAdd} saveLabel="Добавить"/>
        </Modal>
      )}
    </div>
  );
}
