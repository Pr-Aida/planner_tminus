import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Trash2, Pencil, Save, X, ChevronLeft,
  Calendar, Clock, TrendingUp, Archive, FolderPlus, BarChart3, BookOpen,
  MoreVertical, Zap, Check, Pause, Archive as ArchiveIcon,
} from 'lucide-react';
import DatePicker from '../components/DatePicker';
import { useTheme } from '../lib/theme';
import { useProgressData } from '../hooks/useProgressData';
import {
  computeProjectStats, attributableContributions, formatDuration, formatProgressDate, statusLabel, statusColor,
  UNIT_OPTIONS, PROJECT_COLORS, getQuickAddButtons, isTimeUnit, formatAmount, formatPair, toStoredAmount, toEditableAmount, parseTimeInput, normalizeDigits,
  projectStatusLabel, projectStatusColorKey, isPlanningActive, PROJECT_STATUS_OPTIONS,
} from '../lib/progress';
import { computeInsights } from '../lib/progressInsights';
import ProgressInsightsPanel from '../components/ProgressInsightsPanel';
import ProjectOverviewCard from '../components/ProjectOverviewCard';
import { dateKey, todayGreg } from '../lib/calendar';
import type { ProgressProject, ProgressResource, ProgressContribution, CalendarMode, ProjectStatus } from '../types';

interface Props {
  userId: string | null;
  calMode: CalendarMode;
}

export default function ProgressView({ userId, calMode }: Props) {
  const { colors } = useTheme();
  const progress = useProgressData(userId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const visibleProjects = useMemo(
    () => progress.projects.filter(p => showArchived ? (p.status === 'archived' || p.archived) : (p.status !== 'archived' && !p.archived)),
    [progress.projects, showArchived]
  );

  const archivedCount = useMemo(
    () => progress.projects.filter(p => p.status === 'archived' || p.archived).length,
    [progress.projects]
  );

  const selectedProject = useMemo(
    () => progress.projects.find(p => p.id === selectedProjectId) || null,
    [progress.projects, selectedProjectId]
  );

  // Safety: if selected project was deleted, go back to list
  useEffect(() => {
    if (selectedProjectId && !selectedProject) {
      setSelectedProjectId(null);
    }
  }, [selectedProjectId, selectedProject]);

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        resources={progress.resources.filter(r => r.project_id === selectedProject.id)}
        contributions={progress.contributions.filter(c => c.project_id === selectedProject.id)}
        onBack={() => setSelectedProjectId(null)}
        onUpdateProject={(patch) => progress.updateProject(selectedProject.id, patch)}
        onDeleteProject={() => { progress.deleteProject(selectedProject.id); setSelectedProjectId(null); }}
        onArchiveProject={(archived) => progress.archiveProject(selectedProject.id, archived)}
        onAddResource={progress.createResource}
        onUpdateResource={progress.updateResource}
        onDeleteResource={progress.deleteResource}
        onLogContribution={progress.logContribution}
        calMode={calMode}
        colors={colors}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pt-6 pb-16">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} color={colors.accent} />
          <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Progress</h1>
        </div>
        <button
          onClick={() => setShowProjectForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}
        >
          <Plus size={14} /> New Project
        </button>
      </div>

      {progress.loading && (
        <p className="text-sm" style={{ color: colors.textTertiary }}>Loading…</p>
      )}

      {!progress.loading && visibleProjects.length === 0 && !showProjectForm && (
        <div className="text-center py-20">
          <FolderPlus size={48} color={colors.textTertiary} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm font-semibold mb-1" style={{ color: colors.textSecondary }}>
            {showArchived ? 'No archived projects' : 'No study projects yet'}
          </p>
          {!showArchived && (
            <>
              <p className="text-xs mb-4" style={{ color: colors.textTertiary }}>
                Create a project to track your study progress, resources, and deadlines.
              </p>
              <button
                onClick={() => setShowProjectForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}
              >
                <Plus size={14} /> Create Project
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {visibleProjects.map(project => {
          const projectResources = progress.resources.filter(r => r.project_id === project.id);
          const projectContributions = attributableContributions(projectResources, progress.contributions.filter(c => c.project_id === project.id));
          const stats = computeProjectStats(projectResources, projectContributions, project.deadline_date, project.target_study_minutes);
          return (
            <ProjectCard
              key={project.id}
              project={project}
              stats={stats}
              resourceCount={projectResources.length}
              onClick={() => setSelectedProjectId(project.id)}
              calMode={calMode}
              colors={colors}
            />
          );
        })}
      </div>

      {archivedCount > 0 && (
        <div className="mt-4 text-center">
          <button onClick={() => setShowArchived(s => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'transparent', color: colors.textTertiary, border: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}>
            <ArchiveIcon size={12} /> {showArchived ? 'Hide Archived' : `Show Archived (${archivedCount})`}
          </button>
        </div>
      )}

      {showProjectForm && (
        <ProjectFormModal
          calMode={calMode}
          onSave={async (data) => { await progress.createProject(data); setShowProjectForm(false); }}
          onCancel={() => setShowProjectForm(false)}
          colors={colors}
        />
      )}
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, stats, resourceCount, onClick, calMode, colors }: {
  project: ProgressProject;
  stats: ReturnType<typeof computeProjectStats>;
  resourceCount: number;
  onClick: () => void;
  calMode: CalendarMode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const accentColor = project.color || colors.accent;
  const mStatusKey = projectStatusColorKey(project.status);
  const mStatusClr = mStatusKey === 'success' ? colors.success : mStatusKey === 'warning' ? colors.warning : mStatusKey === 'error' ? colors.error : mStatusKey === 'accent' ? colors.accent : colors.textTertiary;
  const planningActive = isPlanningActive(project.status);
  const sc = statusColor(stats.status);
  const planClr = sc === 'success' ? colors.success : sc === 'warning' ? colors.warning : colors.error;
  const showProgress = stats.totalUnits > 0;

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-5 transition-all hover:shadow-lg"
      style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 8px ${colors.shadow}`, cursor: 'pointer' }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {accentColor && (
            <span className="flex-shrink-0 rounded-full" style={{ width: 10, height: 10, background: accentColor }} />
          )}
          <h3 className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{project.name}</h3>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ background: `${mStatusClr}22`, color: mStatusClr }}>
            {projectStatusLabel(project.status)}{project.status === 'completed' ? ' \u2713' : ''}
          </span>
          {planningActive && stats.totalUnits > 0 && stats.status !== 'on-track' && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: `${planClr}11`, color: planClr }}>
              {statusLabel(stats.status)}
            </span>
          )}
        </div>
      </div>

      {project.description && (
        <p className="text-xs mb-3 line-clamp-2" style={{ color: colors.textTertiary }}>{project.description}</p>
      )}

      {showProgress && (
        <>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span style={{ color: colors.textSecondary }}>
              {stats.isMixedUnits
                ? `${stats.overallPct}% overall`
                : `${stats.completedUnits} / ${stats.totalUnits} ${stats.dominantUnit || 'units'}`}
            </span>
            <span className="font-bold" style={{ color: accentColor }}>{stats.overallPct}%</span>
          </div>
          <div className="rounded-full h-2 mb-3 overflow-hidden" style={{ background: colors.bgInput }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, stats.overallPct)}%`, background: accentColor }} />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: colors.textTertiary }}>
        <span className="flex items-center gap-1">
          <BookOpen size={11} /> {resourceCount} resource{resourceCount !== 1 ? 's' : ''}
        </span>
        {stats.studiedMinutes > 0 && (
          <span className="flex items-center gap-1">
            <Clock size={11} /> {formatDuration(stats.studiedMinutes)}
          </span>
        )}
        {planningActive && stats.estimatedRemainingMinutes !== null && (
          <span className="flex items-center gap-1">
            <TrendingUp size={11} /> ~{formatDuration(stats.estimatedRemainingMinutes)} left
          </span>
        )}
        {planningActive && stats.daysRemaining !== null && stats.daysRemaining >= 0 && (
          <span className="flex items-center gap-1">
            <Calendar size={11} /> {stats.daysRemaining}d left
          </span>
        )}
        {planningActive && stats.daysRemaining !== null && stats.daysRemaining < 0 && (
          <span className="flex items-center gap-1" style={{ color: colors.error }}>
            <Calendar size={11} /> Overdue
          </span>
        )}
        {project.deadline_date && (
          <span className="flex items-center gap-1">
            <Calendar size={11} /> {formatProgressDate(project.deadline_date, calMode)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Project Detail ───────────────────────────────────────────────────────────

function ProjectDetail({
  project, resources, contributions, onBack, onUpdateProject, onDeleteProject,
  onArchiveProject, onAddResource, onUpdateResource, onDeleteResource, onLogContribution,
  calMode, colors,
}: {
  project: ProgressProject;
  resources: ProgressResource[];
  contributions: ProgressContribution[];
  onBack: () => void;
  onUpdateProject: (patch: Partial<ProgressProject>) => Promise<boolean>;
  onDeleteProject: () => void;
  onArchiveProject: (archived: boolean) => void;
  onAddResource: (data: { project_id: string; name: string; unit: string; total: number; completed?: number; stage?: string | null }) => Promise<unknown>;
  onUpdateResource: (id: string, patch: Partial<ProgressResource>) => Promise<boolean>;
  onDeleteResource: (id: string) => void;
  onLogContribution: (data: { project_id: string; resource_id: string | null; units_added: number; date_key: string; duration_minutes?: number }) => Promise<boolean>;
  calMode: CalendarMode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const accentColor = project.color || colors.accent;
  const stats = computeProjectStats(resources, contributions, project.deadline_date, project.target_study_minutes);
  const planningActive = isPlanningActive(project.status);
  const mStatusKey = projectStatusColorKey(project.status);
  const mStatusClr = mStatusKey === 'success' ? colors.success : mStatusKey === 'warning' ? colors.warning : mStatusKey === 'error' ? colors.error : mStatusKey === 'accent' ? colors.accent : colors.textTertiary;

  const todayKey = dateKey(todayGreg());
  const insights = useMemo(
    () => computeInsights(resources, attributableContributions(resources, contributions), project.deadline_date, todayKey),
    [resources, contributions, project.deadline_date, todayKey]
  );

  useEffect(() => {
    if (!statusMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [statusMenuOpen]);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pt-6 pb-16">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold mb-4 transition-opacity hover:opacity-70"
        style={{ color: colors.textSecondary, background: 'transparent', border: 'none', cursor: 'pointer' }}>
        <ChevronLeft size={16} /> All Projects
      </button>

      {/* Header */}
      <div className="rounded-xl p-6 mb-4" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 12px ${colors.shadow}` }}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {accentColor && <span className="rounded-full" style={{ width: 12, height: 12, background: accentColor }} />}
            <h1 className="text-lg font-bold" style={{ color: colors.textPrimary }}>{project.name}</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowEditProject(true)} className="p-1.5 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
              onMouseEnter={e => e.currentTarget.style.color = colors.textPrimary}
              onMouseLeave={e => e.currentTarget.style.color = colors.textTertiary}
              title="Edit project">
              <Pencil size={14} />
            </button>
            <button onClick={() => onArchiveProject(!project.archived)} className="p-1.5 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
              onMouseEnter={e => e.currentTarget.style.color = colors.textPrimary}
              onMouseLeave={e => e.currentTarget.style.color = colors.textTertiary}
              title={project.archived ? 'Unarchive' : 'Archive'}>
              <Archive size={14} />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
              onMouseEnter={e => e.currentTarget.style.color = colors.error}
              onMouseLeave={e => e.currentTarget.style.color = colors.textTertiary}
              title="Delete project">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {project.description && (
          <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>{project.description}</p>
        )}

        {/* Manual Status selector */}
        <div className="mb-4">
          <div className="relative inline-block" ref={statusMenuRef}>
            <button onClick={() => setStatusMenuOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{ background: `${mStatusClr}18`, color: mStatusClr, border: `1px solid ${mStatusClr}33`, cursor: 'pointer' }}>
              {project.status === 'completed' && <Check size={12} />}
              {project.status === 'on_hold' && <Pause size={12} />}
              {project.status === 'archived' && <ArchiveIcon size={12} />}
              {projectStatusLabel(project.status)}
              <span style={{ fontSize: 9, opacity: 0.6 }}>&#9662;</span>
            </button>
            {statusMenuOpen && (
              <div className="absolute left-0 top-9 z-30 rounded-lg py-1 min-w-[140px]"
                style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 4px 12px ${colors.shadow}` }}>
                {PROJECT_STATUS_OPTIONS.map(s => {
                  const sClr = projectStatusColorKey(s);
                  const c = sClr === 'success' ? colors.success : sClr === 'warning' ? colors.warning : sClr === 'error' ? colors.error : sClr === 'accent' ? colors.accent : colors.textTertiary;
                  return (
                    <button key={s} onClick={() => {
                      const patch: Partial<ProgressProject> = { status: s as ProjectStatus };
                      if (s === 'archived') patch.archived = true;
                      else if (project.status === 'archived') patch.archived = false;
                      onUpdateProject(patch);
                      setStatusMenuOpen(false);
                    }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors"
                      style={{ border: 'none', cursor: 'pointer', background: project.status === s ? `${c}11` : 'transparent', color: project.status === s ? c : colors.textSecondary, fontWeight: project.status === s ? 700 : 400 }}
                      onMouseEnter={e => { if (project.status !== s) e.currentTarget.style.background = colors.bgHover; }}
                      onMouseLeave={e => { if (project.status !== s) e.currentTarget.style.background = 'transparent'; }}>
                      {s === 'completed' && <Check size={11} />}
                      {s === 'on_hold' && <Pause size={11} />}
                      {s === 'archived' && <ArchiveIcon size={11} />}
                      {projectStatusLabel(s)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {!planningActive && project.status === 'on_hold' && (
          <div className="text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style={{ background: `${colors.warning}18`, color: colors.warning }}>
            <Pause size={12} /> On Hold — planning paused
          </div>
        )}

      </div>

      <ProjectOverviewCard project={project} stats={stats} calMode={calMode} accentColor={accentColor} colors={colors} />

      {insights && <ProgressInsightsPanel insights={insights} calMode={calMode} />}

      {/* Resources */}
      <div className="rounded-xl p-6 mb-4" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 12px ${colors.shadow}` }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>Resources</span>
          <button onClick={() => setShowResourceForm(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: colors.accentLight, color: colors.accent, border: 'none', cursor: 'pointer' }}>
            <Plus size={12} /> Add
          </button>
        </div>

        {resources.length === 0 ? (
          <p className="text-xs py-4" style={{ color: colors.textTertiary }}>No resources yet. Add one to start tracking progress.</p>
        ) : (
          <div className="space-y-2">
            {resources.map(r => (
              <ResourceRow
                key={r.id}
                resource={r}
                projectId={project.id}
                accentColor={accentColor}
                onUpdate={onUpdateResource}
                onDelete={onDeleteResource}
                onLog={onLogContribution}
                todayKey={todayKey}
                colors={colors}
              />
            ))}
          </div>
        )}
      </div>

      {showResourceForm && (
        <ResourceFormModal
          onSave={async (data) => { await onAddResource({ ...data, project_id: project.id, completed: 0 }); setShowResourceForm(false); }}
          onCancel={() => setShowResourceForm(false)}
          colors={colors}
        />
      )}

      {showEditProject && (
        <ProjectFormModal
          initial={project}
          calMode={calMode}
          onSave={(data) => { onUpdateProject(data); setShowEditProject(false); }}
          onCancel={() => setShowEditProject(false)}
          colors={colors}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={`Delete "${project.name}"? This will remove all resources and progress data. This cannot be undone.`}
          onConfirm={() => { onDeleteProject(); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
          colors={colors}
        />
      )}
    </div>
  );
}

// ─── Quick-add shortcuts per unit type ────────────────────────────────────────

// ─── Resource Row ─────────────────────────────────────────────────────────────

function ResourceRow({ resource, projectId, accentColor, onUpdate, onDelete, onLog, todayKey, colors }: {
  resource: ProgressResource;
  projectId: string;
  accentColor: string;
  onUpdate: (id: string, patch: Partial<ProgressResource>) => Promise<boolean>;
  onDelete: (id: string) => void;
  onLog: (data: { project_id: string; resource_id: string | null; units_added: number; date_key: string; duration_minutes?: number }) => Promise<boolean>;
  todayKey: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Edit form state
  const [editName, setEditName] = useState(resource.name);
  const [editUnit, setEditUnit] = useState(UNIT_OPTIONS.includes(resource.unit) ? resource.unit : 'custom');
  const [editTotal, setEditTotal] = useState(toEditableAmount(resource.total, resource.unit));
  const [editCompleted, setEditCompleted] = useState(toEditableAmount(resource.completed, resource.unit));
  const [editCustomUnit, setEditCustomUnit] = useState(!UNIT_OPTIONS.includes(resource.unit) ? resource.unit : '');

  const pct = resource.total > 0 ? Math.min(100, Math.max(0, Math.round((resource.completed / resource.total) * 100))) : 0;
  const autoStatus: { label: string; color: string } = resource.total <= 0
    ? { label: 'No target', color: colors.textTertiary }
    : pct === 0 ? { label: 'Not Started', color: colors.textTertiary }
    : pct >= 100 ? { label: 'Completed', color: colors.success }
    : { label: 'In Progress', color: colors.accent };
  const quickButtons = getQuickAddButtons(resource.unit);
  const isHours = isTimeUnit(resource.unit);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  async function saveEdit() {
    if (saving) return;
    const finalUnit = editUnit === 'custom' ? (editCustomUnit.trim() || 'custom') : editUnit;
    const total = isTimeUnit(finalUnit) ? parseTimeInput(editTotal) : toStoredAmount(editTotal, finalUnit);
    if (!isTimeUnit(finalUnit) && total <= 0) {
      setEditError('Total must be greater than 0.');
      return;
    }
    const enteredCompleted = isTimeUnit(finalUnit) ? parseTimeInput(editCompleted) : toStoredAmount(editCompleted, finalUnit);
    const completed = total > 0 ? Math.min(enteredCompleted, total) : enteredCompleted;
    setSaving(true);
    setEditError(null);
    const ok = await onUpdate(resource.id, {
      name: editName.trim() || resource.name,
      unit: finalUnit,
      total,
      completed,
    });
    setSaving(false);
    if (!ok) {
      setEditError('Could not save this resource. Please try again.');
      return;
    }
    setEditing(false);
  }

  async function quickAdd(amount: number) {
    if (saving) return;
    setSaving(true);
    const ok = await onLog({ project_id: projectId, resource_id: resource.id, units_added: amount, date_key: todayKey, duration_minutes: 0 });
    setSaving(false);
    if (ok) {
      showToast(`+${formatAmount(amount, resource.unit)} logged`);
    } else {
      showToast('Failed to save. Please try again.');
    }
  }

  async function customAdd() {
    if (saving) return;
    const n = parseFloat(normalizeDigits(customAmount));
    if (!n || n <= 0) return;
    setSaving(true);
    let ok = false;
    if (isHours) {
      const minutes = Math.round(n);
      ok = await onLog({ project_id: projectId, resource_id: resource.id, units_added: minutes, date_key: todayKey, duration_minutes: 0 });
      setSaving(false);
      if (ok) showToast(`+${formatDuration(minutes)} logged`);
      else showToast('Failed to save.');
    } else {
      ok = await onLog({ project_id: projectId, resource_id: resource.id, units_added: Math.round(n), date_key: todayKey, duration_minutes: 0 });
      setSaving(false);
      if (ok) showToast(`+${Math.round(n)} ${resource.unit} added`);
      else showToast('Failed to save.');
    }
    if (ok) {
      setCustomAmount('');
      setShowLog(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg p-3" style={{ background: colors.bgInput }}>
        <div className="flex flex-wrap gap-2 mb-2">
          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Resource name"
            className="flex-1 min-w-[120px] rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }} />
          <select value={editUnit} onChange={e => setEditUnit(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }}>
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u === 'custom' ? 'Custom unit' : u}</option>)}
          </select>
          {editUnit === 'custom' && (
            <input type="text" value={editCustomUnit} onChange={e => setEditCustomUnit(e.target.value)} placeholder="Enter unit name"
              className="rounded-lg px-3 py-2 text-sm outline-none mt-2 w-full"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }} />
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <label className="text-xs flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
            Total <input type="text" inputMode="decimal" value={editTotal} onChange={e => setEditTotal(e.target.value)} placeholder={isHours ? 'e.g. 1h 30m' : '0'} onKeyDown={e => e.key === 'Enter' && saveEdit()} className="w-28 rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }} />
          </label>
          <label className="text-xs flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
            Completed <input type="text" inputMode="decimal" value={editCompleted} onChange={e => setEditCompleted(e.target.value)} placeholder={isHours ? 'e.g. 1h 30m' : '0'} onKeyDown={e => e.key === 'Enter' && saveEdit()} className="w-28 rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }} />
          </label>
        </div>
        {editError && <p className="text-xs mb-2" style={{ color: colors.error }}>{editError}</p>}
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: colors.heroBg, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            <Save size={12} /> Save
          </button>
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-lg p-3 transition-colors" style={{ background: colors.bgInput }}>
      {/* Top row: name, %, menu */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{resource.name}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: `${autoStatus.color}22`, color: autoStatus.color }}>{autoStatus.label}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {resource.total > 0 && (
            <span className="text-xs font-bold" style={{ color: accentColor }}>{pct}%</span>
          )}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(o => !o)} className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
              title="More options">
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-20 rounded-lg py-1 min-w-[100px]"
                style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 4px 12px ${colors.shadow}` }}>
                <button onClick={() => {
                  setEditName(resource.name);
                  setEditUnit(UNIT_OPTIONS.includes(resource.unit) ? resource.unit : 'custom');
                  setEditTotal(toEditableAmount(resource.total, resource.unit));
                  setEditCompleted(toEditableAmount(resource.completed, resource.unit));
                  setEditCustomUnit(!UNIT_OPTIONS.includes(resource.unit) ? resource.unit : '');
                  setEditError(null);
                  setEditing(true);
                  setMenuOpen(false);
                }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors"
                  style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textSecondary }}
                  onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Pencil size={11} /> Edit
                </button>
                <button onClick={() => { setConfirmDel(true); setMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors"
                  style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.error }}
                  onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {resource.total > 0 && (
        <>
          <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: colors.textTertiary }}>
            <span>{formatPair(resource.completed, resource.total, resource.unit)}</span>
            {resource.total - resource.completed > 0 && (
              <span>{isHours ? formatDuration(resource.total - resource.completed) : `${resource.total - resource.completed} ${resource.unit}`} remaining</span>
            )}
          </div>
          <div className="rounded-full h-2 overflow-hidden mb-2" style={{ background: `${accentColor}22` }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: accentColor }} />
          </div>
        </>
      )}

      {resource.total <= 0 && (
        <p className="text-[11px] mb-2" style={{ color: colors.textTertiary }}>
          {formatAmount(resource.completed, resource.unit)} logged · No target set
        </p>
      )}

      {/* Log Progress button */}
      {!showLog ? (
        <button onClick={() => setShowLog(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
          style={{ border: `1px solid ${colors.borderLight}`, background: 'transparent', color: colors.textSecondary, cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = `${accentColor}11`; e.currentTarget.style.color = accentColor; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.textSecondary; }}>
          <Zap size={12} /> Log Progress
        </button>
      ) : (
        <div className="mt-1">
          {/* Quick-add buttons */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {quickButtons.map(b => (
              <button key={b.label} onClick={() => quickAdd(b.amount)} disabled={saving}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ border: 'none', background: accentColor, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {b.label}
              </button>
            ))}
          </div>
          {/* Custom input */}
          <div className="flex gap-1.5">
            <input type="text" inputMode="decimal" value={customAmount} onChange={e => setCustomAmount(e.target.value)}
              placeholder={`Custom ${isHours ? 'minutes' : resource.unit}`}
              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }}
              disabled={saving}
              onKeyDown={e => e.key === 'Enter' && customAdd()} />
            <button onClick={customAdd} disabled={saving || !customAmount || parseFloat(customAmount) <= 0}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{ background: accentColor, border: 'none', cursor: 'pointer', opacity: (saving || !customAmount || parseFloat(customAmount) <= 0) ? 0.5 : 1 }}>
              Add
            </button>
            <button onClick={() => { setShowLog(false); setCustomAmount(''); }}
              className="px-2 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'transparent', color: colors.textTertiary, border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: `${colors.accent}18`, color: colors.accent }}>
          {toast}
        </div>
      )}

      {confirmDel && (
        <ConfirmModal
          message={`Delete "${resource.name}"?`}
          onConfirm={() => { onDelete(resource.id); setConfirmDel(false); }}
          onCancel={() => setConfirmDel(false)}
          colors={colors}
        />
      )}
    </div>
  );
}

// ─── Project Form Modal ───────────────────────────────────────────────────────

function ProjectFormModal({ initial, calMode, onSave, onCancel, colors }: {
  initial?: ProgressProject;
  calMode: CalendarMode;
  onSave: (data: { name: string; description?: string | null; color?: string | null; deadline_date?: string | null; target_study_minutes?: number | null; status?: ProjectStatus }) => void;
  onCancel: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [color, setColor] = useState(initial?.color || '');
  const [deadlineDate, setDeadlineDate] = useState<string | null>(initial?.deadline_date || null);
  const [targetHours, setTargetHours] = useState(initial?.target_study_minutes ? String(Math.round(initial.target_study_minutes / 60)) : '');
  const [status, setStatus] = useState<ProjectStatus>(initial?.status || 'in_progress');

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      color: color || null,
      deadline_date: deadlineDate || null,
      target_study_minutes: targetHours ? Math.round(parseFloat(targetHours) * 60) : null,
      status,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: colors.overlay }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl p-6" style={{ background: colors.bgCard, boxShadow: `0 12px 40px ${colors.shadow}` }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>
            {initial ? 'Edit Project' : 'New Project'}
          </span>
          <button onClick={onCancel} className="p-1 rounded transition-opacity hover:opacity-70"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}>
            <X size={16} />
          </button>
        </div>

        <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Project name (e.g. Heat Exchanger Design)"
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
          onKeyDown={e => e.key === 'Enter' && handleSave()} />

        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2}
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3 resize-none"
          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }} />

        <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Deadline (optional)</label>
        <div className="mb-4">
          <DatePicker
            value={deadlineDate}
            calMode={calMode}
            onChange={setDeadlineDate}
            onClear={() => setDeadlineDate(null)}
            colors={colors}
          />
        </div>
        <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Color (optional)</label>
        <div className="flex gap-2 mb-3">
          {PROJECT_COLORS.map(c => (
            <button key={c} onClick={() => setColor(color === c ? '' : c)}
              className="rounded-full transition-transform hover:scale-110"
              style={{ width: 24, height: 24, background: c, border: color === c ? `2px solid ${colors.textPrimary}` : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}>
              {PROJECT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{projectStatusLabel(s)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Target hours (optional)</label>
            <input type="number" value={targetHours} onChange={e => setTargetHours(e.target.value)} placeholder="e.g. 20"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }} />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
            style={{ background: colors.heroBg, border: 'none', cursor: !name.trim() ? 'not-allowed' : 'pointer', opacity: !name.trim() ? 0.6 : 1 }}>
            {initial ? 'Save Changes' : 'Create Project'}
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resource Form Modal ──────────────────────────────────────────────────────

function ResourceFormModal({ onSave, onCancel, colors }: {
  onSave: (data: { name: string; unit: string; total: number }) => void;
  onCancel: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pages');
  const [total, setTotal] = useState('');
  const [customUnit, setCustomUnit] = useState('');

  const finalUnit = unit === 'custom' ? (customUnit.trim() || 'custom') : unit;
  const isTime = isTimeUnit(finalUnit);
  const totalNum = toStoredAmount(total, finalUnit);
  const totalRequired = !isTime;
  const canSave = !!name.trim() && (!totalRequired || totalNum > 0);

  function handleSave() {
    if (!canSave) return;
    onSave({ name: name.trim(), unit: finalUnit, total: totalNum });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: colors.overlay }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl p-6" style={{ background: colors.bgCard, boxShadow: `0 12px 40px ${colors.shadow}` }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>Add Resource</span>
          <button onClick={onCancel} className="p-1 rounded transition-opacity hover:opacity-70"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}>
            <X size={16} />
          </button>
        </div>

        <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Resource name (e.g. Chapter 1)"
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
          onKeyDown={e => e.key === 'Enter' && handleSave()} />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Unit</label>
            <select value={unit} onChange={e => setUnit(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}>
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u === 'custom' ? 'Custom unit' : u}</option>)}
            </select>
            {unit === 'custom' && (
              <input type="text" value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder="e.g. drawings"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mt-2"
                style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }} />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>
              {isTime ? 'Target hours (optional)' : 'Total (required)'}
            </label>
            <input type="text" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder={isTime ? 'e.g. 10' : 'e.g. 100'}
              step={isTime ? '0.5' : '1'}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }} />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={!canSave}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
            style={{ background: colors.heroBg, border: 'none', cursor: !canSave ? 'not-allowed' : 'pointer', opacity: !canSave ? 0.6 : 1 }}>
            Add Resource
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel, colors }: {
  message: string; onConfirm: () => void; onCancel: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: colors.overlay }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={ref} className="w-full max-w-sm rounded-xl p-6" style={{ background: colors.bgCard, boxShadow: `0 12px 40px ${colors.shadow}` }}>
        <p className="text-sm mb-4" style={{ color: colors.textPrimary }}>{message}</p>
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white"
            style={{ background: colors.error, border: 'none', cursor: 'pointer' }}>
            Delete
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
            style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
