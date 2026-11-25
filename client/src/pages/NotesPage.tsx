import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  BookOpen,
  ToggleLeft,
  ToggleRight,
  Search,
  Check,
  X,
  Eye,
  Loader2,
} from 'lucide-react';
import { api } from '../lib/api';
import { playEnter, playNotification, playFailed, playBack, playScroll } from '../lib/sound';
import { useToast } from '../components/ui/ToastProvider';
import { useEcosystem } from '../context/EcosystemContext';
import { PersonalNote, Command } from '../types';
import { MarkdownRenderer } from '../components/ui/MarkdownRenderer';

export const NotesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'notes' | 'commands'>('notes');
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');

  // Slide-over Note Editor Drawer state
  const [isNoteDrawerOpen, setIsNoteDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerContent, setDrawerContent] = useState('');
  const [drawerTags, setDrawerTags] = useState('');
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Command form
  const [cmdName, setCmdName] = useState('');
  const [cmdContent, setCmdContent] = useState('');
  const [isSavingCmd, setIsSavingCmd] = useState(false);

  const { push: toast } = useToast();
  const { workspaceRevision, bumpWorkspaceRevision } = useEcosystem();

  useEffect(() => {
    loadNotes();
    loadCommands();
  }, [workspaceRevision]);

  const loadNotes = async () => {
    try {
      const data = await api.getNotes();
      setNotes(data || []);
    } catch (err) {
      console.debug('Failed to load notes', err);
    }
  };

  const loadCommands = async () => {
    try {
      const data = await api.listCommands();
      setCommands(data || []);
    } catch (err) {
      console.debug('Failed to load commands', err);
    }
  };

  const handleOpenCreateDrawer = () => {
    playEnter();
    setDrawerMode('create');
    setEditingNoteId(null);
    setDrawerTitle('');
    setDrawerContent('');
    setDrawerTags(selectedTag ? selectedTag : '');
    setShowMarkdownPreview(false);
    setIsNoteDrawerOpen(true);
  };

  const handleOpenEditDrawer = (note: PersonalNote) => {
    playScroll();
    setDrawerMode('edit');
    setEditingNoteId(note.note_id);
    setDrawerTitle(note.title);
    setDrawerContent(note.content);
    setDrawerTags((note.tags || []).join(', '));
    setShowMarkdownPreview(false);
    setIsNoteDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    playBack();
    setIsNoteDrawerOpen(false);
    setEditingNoteId(null);
  };

  const handleSaveNoteDrawer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerTitle.trim() || !drawerContent.trim() || isSavingNote) return;

    setIsSavingNote(true);
    playEnter();
    try {
      const tags = drawerTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (drawerMode === 'edit' && editingNoteId) {
        await api.updateNote(editingNoteId, {
          title: drawerTitle.trim(),
          content: drawerContent.trim(),
          tags,
        });
        toast('success', 'Note updated and synced with Basket.');
      } else {
        await api.createNote({
          title: drawerTitle.trim(),
          content: drawerContent.trim(),
          tags,
        });
        toast('success', 'Note saved and synced with Basket.');
      }

      playNotification();
      bumpWorkspaceRevision();
      setIsNoteDrawerOpen(false);
    } catch {
      playFailed();
      toast('error', 'Failed to save note.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    playBack();
    try {
      await api.deleteNote(noteId);
      toast('info', 'Note removed.');
      if (isNoteDrawerOpen && editingNoteId === noteId) {
        setIsNoteDrawerOpen(false);
      }
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to delete note.');
    }
  };

  const handleCreateCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdName.trim() || !cmdContent.trim() || isSavingCmd) return;

    setIsSavingCmd(true);
    playEnter();
    try {
      await api.createCommand({
        name: cmdName.trim(),
        content: cmdContent.trim(),
        is_active: true,
      });
      setCmdName('');
      setCmdContent('');
      playNotification();
      toast('success', 'Standing command created and synced to Basket!');
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to save command.');
    } finally {
      setIsSavingCmd(false);
    }
  };

  const handleToggleCommand = async (cmd: Command) => {
    playEnter();
    try {
      await api.updateCommand(cmd.command_id, {
        is_active: !cmd.is_active,
      });
      playNotification();
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to toggle command.');
    }
  };

  const handleDeleteCommand = async (commandId: string) => {
    playBack();
    try {
      await api.deleteCommand(commandId);
      toast('info', 'Command deleted from Basket.');
      bumpWorkspaceRevision();
    } catch {
      playFailed();
      toast('error', 'Failed to delete command.');
    }
  };

  // Keyboard navigation for sub-menu [Notes | Commands]
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isNoteDrawerOpen) return;
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isEditingText) return;

      if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        playScroll();
        setActiveTab((prev) => (prev === 'notes' ? 'commands' : 'notes'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNoteDrawerOpen]);

  // Derive unique tags
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags || [])));

  // Filter notes by search query and selected tag
  const filteredNotes = notes.filter((n) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      (n.tags && n.tags.some((t) => t.toLowerCase().includes(q)));
    const matchesTag = !selectedTag || (n.tags && n.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Header and Top Segmented Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/5 dark:border-white/10 pb-4">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
          Notes
        </h1>

        {/* Tab Toggle */}
        <div className="flex items-center p-1 rounded-2xl glass-card border border-black/5 dark:border-white/10 self-start sm:self-center">
          <button
            type="button"
            onClick={() => {
              playScroll();
              setActiveTab('notes');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'notes'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            Notes ({notes.length})
          </button>
          <button
            type="button"
            onClick={() => {
              playScroll();
              setActiveTab('commands');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'commands'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            Commands ({commands.length})
          </button>
        </div>
      </div>

      {/* TAB 1: NOTES (FULL WIDTH) */}
      {activeTab === 'notes' && (
        <div className="space-y-6">
          {/* Search, Filter Pills & + New Note Button Row */}
          <div className="glass-panel p-4 rounded-2xl border border-black/5 dark:border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-soft">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes by keyword or tag..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl glass-card text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {/* Tag Filter Pills */}
              {allTags.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedTag('')}
                    className={`text-2xs px-2.5 py-1 rounded-full font-medium transition ${
                      !selectedTag
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold'
                        : 'glass-card text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    All ({notes.length})
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                      className={`text-2xs px-2.5 py-1 rounded-full font-medium transition ${
                        selectedTag === tag
                          ? 'bg-cherry-flesh text-white font-bold'
                          : 'glass-card text-cherry-700 dark:text-cherry-300'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {/* + New Note Button (Opens Slide-Over Drawer) */}
              <button
                type="button"
                onClick={handleOpenCreateDrawer}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold shadow-xs hover:opacity-90 transition shrink-0 ml-auto sm:ml-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Note</span>
              </button>
            </div>
          </div>

          {/* Full-Width Notes Grid */}
          {filteredNotes.length === 0 ? (
            <div className="text-center py-16 glass-card rounded-2xl p-6 border border-black/5 dark:border-white/10 space-y-2">
              <BookOpen className="h-8 w-8 text-stone-400 mx-auto" />
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {searchQuery || selectedTag
                  ? 'No notes match your active search or tag filter.'
                  : 'No personal notes saved yet. Create your first note!'}
              </p>
              <button
                type="button"
                onClick={handleOpenCreateDrawer}
                className="text-xs font-bold text-cherry-600 dark:text-cherry-300 hover:underline"
              >
                + Create a new note
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotes.map((note) => (
                <div
                  key={note.note_id}
                  onClick={() => handleOpenEditDrawer(note)}
                  className="glass-card rounded-2xl p-4 border border-black/5 dark:border-white/10 hover:border-cherry-500/40 transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-soft group"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 line-clamp-1">
                        {note.title}
                      </h3>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNote(note.note_id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-rose-500 transition rounded-lg"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="text-2xs text-stone-600 dark:text-stone-400 line-clamp-4 leading-relaxed">
                      <MarkdownRenderer content={note.content} variant="bubble" />
                    </div>
                  </div>

                  {/* Tags Footer */}
                  {(note.tags || []).length > 0 && (
                    <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center gap-1 flex-wrap">
                      {(note.tags || []).map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-md text-3xs font-mono bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STANDING COMMANDS */}
      {activeTab === 'commands' && (
        <div className="space-y-6">
          {/* Add Command Form */}
          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-black/5 dark:border-white/10 space-y-3 shadow-soft">
            <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
              New Command
            </h3>
            <form onSubmit={handleCreateCommand} className="space-y-2.5">
              <input
                type="text"
                value={cmdName}
                onChange={(e) => setCmdName(e.target.value)}
                placeholder="Command Name / Identifier (e.g. Markdown Output Format)..."
                className="w-full px-3.5 py-2 rounded-xl glass-card text-xs focus-ring"
              />
              <textarea
                rows={2}
                value={cmdContent}
                onChange={(e) => setCmdContent(e.target.value)}
                placeholder="Instruction for Cherry AI (e.g. Always structure diagnostics responses in markdown tables)..."
                className="w-full px-3.5 py-2 rounded-xl glass-card text-xs focus-ring"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!cmdName.trim() || !cmdContent.trim() || isSavingCmd}
                  className="px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold disabled:opacity-40 transition shadow-xs"
                >
                  {isSavingCmd ? 'Saving...' : 'Add Command'}
                </button>
              </div>
            </form>
          </div>

          {/* Commands List */}
          <div className="space-y-3">
            {commands.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-2xl p-6 text-xs text-stone-400">
                No standing commands configured.
              </div>
            ) : (
              commands.map((cmd) => (
                <div
                  key={cmd.command_id}
                  className="glass-card rounded-2xl p-4 border border-black/5 dark:border-white/10 flex items-start justify-between gap-4 shadow-soft"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                        {cmd.name || 'Standing Instruction'}
                      </span>
                      <span
                        className={`text-micro font-mono font-bold px-2 py-0.5 rounded-full uppercase ${
                          cmd.is_active
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-stone-200 dark:bg-stone-800 text-stone-500'
                        }`}
                      >
                        {cmd.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-400 font-mono">
                      {cmd.content}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleCommand(cmd)}
                      className="p-1 text-stone-500 hover:text-stone-900 dark:hover:text-white transition"
                      title={cmd.is_active ? 'Disable command' : 'Enable command'}
                    >
                      {cmd.is_active ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-stone-400" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCommand(cmd.command_id)}
                      className="p-1 text-stone-400 hover:text-rose-500 transition"
                      title="Delete command"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Slide-Over Note Editor Drawer */}
      {isNoteDrawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={handleCloseDrawer}
          />

          <aside
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[460px] bg-stone-50/95 dark:bg-[#181915]/95 backdrop-blur-xl border-l border-black/10 dark:border-white/10 shadow-2xl flex flex-col justify-between animate-slide-in-from-right"
            role="dialog"
            aria-modal="true"
            aria-label={drawerMode === 'edit' ? 'Edit Note' : 'New Note'}
          >
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-cherry-500/15 text-cherry-600 dark:text-cherry-300">
                {drawerMode === 'edit' ? 'Edit Note' : 'New Note'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMarkdownPreview((prev) => !prev)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-2xs font-semibold border transition ${
                    showMarkdownPreview
                      ? 'bg-cherry-500/15 text-cherry-600 dark:text-cherry-300 border-cherry-500/30'
                      : 'glass-card text-stone-500'
                  }`}
                  title="Toggle Markdown Preview"
                >
                  <Eye className="h-3 w-3" />
                  <span>Preview</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="rounded-full p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Body Form */}
            <form onSubmit={handleSaveNoteDrawer} className="flex-1 flex flex-col p-4 sm:p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  autoFocus
                  value={drawerTitle}
                  onChange={(e) => setDrawerTitle(e.target.value)}
                  placeholder="Note title..."
                  className="w-full px-3.5 py-2.5 rounded-2xl glass-card text-sm font-bold focus-ring"
                />
              </div>

              <div className="flex-1 flex flex-col min-h-[220px]">
                <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Content
                </label>
                {showMarkdownPreview ? (
                  <div className="flex-1 p-3.5 rounded-2xl glass-card overflow-y-auto text-xs leading-relaxed">
                    <MarkdownRenderer content={drawerContent || '_Empty_'} variant="bubble" />
                  </div>
                ) : (
                  <textarea
                    value={drawerContent}
                    onChange={(e) => setDrawerContent(e.target.value)}
                    placeholder="Write in markdown..."
                    className="flex-1 w-full p-3.5 rounded-2xl glass-card text-xs focus-ring resize-none font-sans"
                  />
                )}
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={drawerTags}
                  onChange={(e) => setDrawerTags(e.target.value)}
                  placeholder="architecture, diet, habits"
                  className="w-full px-3.5 py-2 rounded-xl glass-card text-xs focus-ring"
                />
              </div>

              {/* Drawer Footer */}
              <div className="pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
                {drawerMode === 'edit' && editingNoteId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteNote(editingNoteId)}
                    className="p-2 text-stone-400 hover:text-rose-500 rounded-xl hover:bg-rose-500/10 transition"
                    title="Delete Note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseDrawer}
                    className="px-4 py-2 rounded-2xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!drawerTitle.trim() || !drawerContent.trim() || isSavingNote}
                    className="px-5 py-2 rounded-2xl text-xs font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs hover:opacity-90 disabled:opacity-40 transition flex items-center gap-1.5"
                  >
                    {isSavingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>{drawerMode === 'edit' ? 'Update Note' : 'Save Note'}</span>
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </>
      )}
    </div>
  );
};
