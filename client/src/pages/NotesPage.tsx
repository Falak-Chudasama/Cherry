import React, { useState, useEffect } from "react";
import { Plus, Trash2, Tag, BookOpen } from "lucide-react";
import { api } from "../lib/api";
import { playEnter, playNotification, playFailed, playBack } from "../lib/sound";
import { useToast } from "../components/ui/ToastProvider";
import { PageShell } from "../components/layout/PageShell";
import { PersonalNote } from "../types";

export const NotesPage: React.FC = () => {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const data = await api.getNotes();
      setNotes(data);
    } catch (err) {
      console.debug("Failed to load notes", err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || loading) return;

    playEnter();
    setLoading(true);
    try {
      const tags = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await api.createNote({
        title: title.trim(),
        content: content.trim(),
        tags,
      });

      setTitle("");
      setContent("");
      setTagInput("");
      playNotification();
      push("success", "Note saved.");
      loadNotes();
    } catch {
      playFailed();
      push("error", "Failed to save note.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    playBack();
    try {
      await api.deleteNote(noteId);
      push("info", "Note removed.");
      loadNotes();
    } catch {
      playFailed();
      push("error", "Failed to delete note.");
    }
  };

  return (
    <PageShell
      title="Notes"
      description="Personal context retrieved during planning and conversations."
      icon={<BookOpen className="h-4 w-4" />}
      action={
        <span className="text-xs font-mono text-stone-400 font-semibold px-2.5 py-1 rounded-full glass-card">
          {notes.length} saved
        </span>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Simple Note Form */}
        <div className="glass-panel rounded-2xl p-4 sm:p-5 shadow-soft space-y-3 h-fit">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">
            Add Note
          </span>
          <form onSubmit={handleCreate} className="space-y-2.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title..."
              className="w-full px-3 py-1.5 rounded-xl glass-card text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Details or constraints..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl glass-card text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none resize-none"
            />
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Tags (comma separated)..."
              className="w-full px-3 py-1.5 rounded-xl glass-card text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!title.trim() || !content.trim() || loading}
              className="btn-glass-primary w-full text-xs font-semibold !py-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Save Note</span>
            </button>
          </form>
        </div>

        {/* Notes Grid */}
        <div className="md:col-span-2">
          {notes.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-xs glass-card rounded-2xl p-6">
              No notes saved.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {notes.map((note) => (
                <div
                  key={note.note_id}
                  className="glass-panel rounded-2xl p-4 border border-black/5 dark:border-white/10 flex flex-col justify-between space-y-2 shadow-soft"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-xs text-stone-900 dark:text-stone-100">{note.title}</h3>
                      <button
                        onClick={() => handleDelete(note.note_id)}
                        className="text-stone-400 hover:text-rose-500 transition p-0.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-300 mt-1 leading-relaxed">
                      {note.content}
                    </p>
                  </div>

                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1.5 border-t border-black/5 dark:border-white/5">
                      {note.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-cherry-500/10 text-cherry-700 dark:text-cherry-300 font-semibold"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
};
