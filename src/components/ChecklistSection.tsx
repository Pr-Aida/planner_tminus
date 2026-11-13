import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Check, Pencil, X } from 'lucide-react';
import { useTheme } from '../lib/theme';
import {
  fetchChecklistItems, createChecklistItem, updateChecklistItem,
  deleteChecklistItem, setSubtasksCompleted,
} from '../lib/progressChecklist';
import type { ChecklistItem } from '../types';

interface Props {
  projectId: string;
  userId: string;
  accentColor: string;
}

export default function ChecklistSection({ projectId, userId, accentColor }: Props) {
  const { colors } = useTheme();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState('');
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskText, setSubtaskText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const data = await fetchChecklistItems(projectId);
    setItems(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const topLevel = items.filter(i => !i.parent_id);
  const subtasksByParent = (parentId: string) => items.filter(i => i.parent_id === parentId);
  const completedCount = topLevel.filter(t => t.completed).length;
  const totalCount = topLevel.length;

  async function handleAddTask() {
    const title = newTask.trim();
    if (!title) return;
    const maxSort = topLevel.reduce((m, t) => Math.max(m, t.sort_order), -1);
    const row = await createChecklistItem(projectId, userId, title, null, maxSort + 1);
    if (row) {
      setItems(prev => [...prev, row]);
    }
    setNewTask('');
  }

  async function handleAddSubtask(parentId: string) {
    const title = subtaskText.trim();
    if (!title) return;
    const siblings = subtasksByParent(parentId);
    const maxSort = siblings.reduce((m, t) => Math.max(m, t.sort_order), -1);
    const row = await createChecklistItem(projectId, userId, title, parentId, maxSort + 1);
    if (row) {
      setItems(prev => [...prev, row]);
      await recalcParentCompletion(parentId);
    }
    setSubtaskText('');
    setAddingSubtaskFor(null);
  }

  async function handleToggle(item: ChecklistItem) {
    if (item.parent_id) {
      // Toggling a subtask
      const newCompleted = !item.completed;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, completed: newCompleted } : i));
      await updateChecklistItem(item.id, { completed: newCompleted });
      await recalcParentCompletion(item.parent_id);
    } else {
      // Toggling a top-level task
      const newCompleted = !item.completed;
      const subs = subtasksByParent(item.id);
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, completed: newCompleted }
        : i.parent_id === item.id ? { ...i, completed: newCompleted }
        : i
      ));
      await updateChecklistItem(item.id, { completed: newCompleted });
      if (subs.length > 0) {
        await setSubtasksCompleted(item.id, newCompleted);
      }
    }
  }

  async function recalcParentCompletion(_parentId: string) {
    // After a subtask toggle, recompute parent state
    const fresh = await fetchChecklistItems(projectId);
    setItems(fresh);
  }

  async function handleDelete(item: ChecklistItem) {
    setItems(prev => prev.filter(i => i.id !== item.id && i.parent_id !== item.id));
    await deleteChecklistItem(item.id);
    if (item.parent_id) {
      await recalcParentCompletion(item.parent_id);
    }
  }

  function startEdit(item: ChecklistItem) {
    setEditingId(item.id);
    setEditText(item.title);
  }

  async function saveEdit(item: ChecklistItem) {
    const title = editText.trim();
    if (!title) { setEditingId(null); return; }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, title } : i));
    await updateChecklistItem(item.id, { title });
    setEditingId(null);
  }

  const inputStyle: React.CSSProperties = {
    border: `1.5px solid ${colors.borderLight}`,
    background: colors.bgInput,
    color: colors.textPrimary,
  };

  return (
    <div className="rounded-xl p-5 mb-4" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>Checklist</span>
        {totalCount > 0 && (
          <span className="text-[11px] font-semibold" style={{ color: colors.textTertiary }}>
            {completedCount} / {totalCount} completed{totalCount > 0 ? ` · ${Math.round((completedCount / totalCount) * 100)}%` : ''}
          </span>
        )}
      </div>

      {/* Add task input */}
      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          type="text"
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={inputStyle}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void handleAddTask(); }
          }}
        />
        <button
          onClick={() => void handleAddTask()}
          disabled={!newTask.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white transition-opacity"
          style={{ background: accentColor, border: 'none', cursor: newTask.trim() ? 'pointer' : 'not-allowed', opacity: newTask.trim() ? 1 : 0.5 }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <p className="text-xs" style={{ color: colors.textTertiary }}>Loading…</p>
      ) : topLevel.length === 0 ? (
        <p className="text-xs py-2" style={{ color: colors.textTertiary }}>No tasks yet.</p>
      ) : (
        <div className="space-y-1">
          {topLevel.map(task => {
            const subs = subtasksByParent(task.id);
            const isEditing = editingId === task.id;
            return (
              <div key={task.id}>
                <div
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.background = colors.bgHover; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <button
                    onClick={() => void handleToggle(task)}
                    className="flex-shrink-0 rounded transition-all"
                    style={{
                      width: 18, height: 18,
                      border: `1.5px solid ${task.completed ? accentColor : colors.borderLight}`,
                      background: task.completed ? accentColor : 'transparent',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {task.completed && <Check size={12} color="#fff" />}
                  </button>
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onBlur={() => void saveEdit(task)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); void saveEdit(task); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 rounded px-2 py-0.5 text-sm outline-none"
                      style={inputStyle}
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm"
                      style={{
                        color: task.completed ? colors.textTertiary : colors.textPrimary,
                        textDecoration: task.completed ? 'line-through' : 'none',
                      }}
                      onDoubleClick={() => startEdit(task)}
                    >
                      {task.title}
                    </span>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setAddingSubtaskFor(task.id); setSubtaskText(''); }}
                      className="p-1 rounded transition-colors"
                      style={{ border: 'none', background: 'transparent', color: colors.textTertiary, cursor: 'pointer' }}
                      title="Add subtask"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => startEdit(task)}
                      className="p-1 rounded transition-colors"
                      style={{ border: 'none', background: 'transparent', color: colors.textTertiary, cursor: 'pointer' }}
                      title="Edit"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => void handleDelete(task)}
                      className="p-1 rounded transition-colors"
                      style={{ border: 'none', background: 'transparent', color: colors.textTertiary, cursor: 'pointer' }}
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Subtasks */}
                {subs.length > 0 && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {subs.map(sub => {
                      const subEditing = editingId === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className="group flex items-center gap-2 rounded-lg px-2 py-1 transition-colors"
                          onMouseEnter={e => { e.currentTarget.style.background = colors.bgHover; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <button
                            onClick={() => void handleToggle(sub)}
                            className="flex-shrink-0 rounded transition-all"
                            style={{
                              width: 16, height: 16,
                              border: `1.5px solid ${sub.completed ? accentColor : colors.borderLight}`,
                              background: sub.completed ? accentColor : 'transparent',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {sub.completed && <Check size={10} color="#fff" />}
                          </button>
                          {subEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onBlur={() => void saveEdit(sub)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); void saveEdit(sub); }
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="flex-1 rounded px-2 py-0.5 text-xs outline-none"
                              style={inputStyle}
                            />
                          ) : (
                            <span
                              className="flex-1 text-xs"
                              style={{
                                color: sub.completed ? colors.textTertiary : colors.textSecondary,
                                textDecoration: sub.completed ? 'line-through' : 'none',
                              }}
                              onDoubleClick={() => startEdit(sub)}
                            >
                              {sub.title}
                            </span>
                          )}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(sub)}
                              className="p-1 rounded transition-colors"
                              style={{ border: 'none', background: 'transparent', color: colors.textTertiary, cursor: 'pointer' }}
                              title="Edit"
                            >
                              <Pencil size={10} />
                            </button>
                            <button
                              onClick={() => void handleDelete(sub)}
                              className="p-1 rounded transition-colors"
                              style={{ border: 'none', background: 'transparent', color: colors.textTertiary, cursor: 'pointer' }}
                              title="Delete"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add subtask input */}
                {addingSubtaskFor === task.id && (
                  <div className="ml-6 mt-1 flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={subtaskText}
                      onChange={e => setSubtaskText(e.target.value)}
                      placeholder="Add subtask…"
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
                      style={inputStyle}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); void handleAddSubtask(task.id); }
                        if (e.key === 'Escape') { setAddingSubtaskFor(null); setSubtaskText(''); }
                      }}
                    />
                    <button
                      onClick={() => void handleAddSubtask(task.id)}
                      disabled={!subtaskText.trim()}
                      className="px-2 py-1.5 rounded-lg text-xs font-bold text-white"
                      style={{ background: accentColor, border: 'none', cursor: subtaskText.trim() ? 'pointer' : 'not-allowed', opacity: subtaskText.trim() ? 1 : 0.5 }}
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => { setAddingSubtaskFor(null); setSubtaskText(''); }}
                      className="px-2 py-1.5 rounded-lg text-xs"
                      style={{ background: 'transparent', border: 'none', color: colors.textTertiary, cursor: 'pointer' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
