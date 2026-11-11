import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Trash2, Pencil, Save, X, ChevronLeft, Target,
  Calendar, Clock, TrendingUp, Archive, FolderPlus, BarChart3, BookOpen, Link2, Unlink,
  MoreVertical, Zap,
} from 'lucide-react';
import LinkActivityModal from '../components/LinkActivityModal';
import DatePicker from '../components/DatePicker';
import { useTheme } from '../lib/theme';
import { useProgressData } from '../hooks/useProgressData';
import { removeContribution } from '../lib/progressSync';
import {
  computeProjectStats, formatDuration, formatProgressDate, statusLabel, statusColor,
  UNIT_OPTIONS, PROJECT_COLORS,
} from '../lib/progress';
import { dateKey, todayGreg } from '../lib/calendar';
import type { ProgressProject, ProgressResource, ProgressContribution, ProgressStage, CalendarMode } from '../types';

interface Props {
  userId: string | null;
  calMode: CalendarMode;
}

export default function ProgressView({ userId, calMode }: Props) {
  const { colors } = useTheme();
  const progress = useProgressData(userId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectForm, setShowProjectForm] = useState(false);

  const activeProjects = useMemo(
    () => progress.projects.filter(p => !p.archived),
    [progress.projects]
  );

  const selectedProject = useMemo(
    () => progress.projects.find(p => p.id === selectedProjectId) || null,
    [progress.projects, selectedProjectId]
  );

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
        onDeleteContribution={progress.deleteContribution}
        calMode={calMode}
        allContributions={progress.contributions}
        onActivityLinked={progress.loadAll}
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

      {!progress.loading && activeProjects.length === 0 && !showProjectForm && (
        <div className="text-center py-20">
          <FolderPlus size={48} color={colors.textTertiary} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm font-semibold mb-1" style={{ color: colors.textSecondary }}>No study projects yet</p>
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
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {activeProjects.map(project => {
          const projectResources = progress.resources.filter(r => r.project_id === project.id);
          const projectContributions = progress.contributions.filter(c => c.project_id === project.id);
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
  const sc = statusColor(stats.status);
  const statusClr = sc === 'success' ? colors.success : sc === 'warning' ? colors.warning : colors.error;
  const accentColor = project.color || colors.accent;

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
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: `${statusClr}22`, color: statusClr }}>
          {statusLabel(stats.status)}
        </span>
      </div>

      {project.description && (
        <p className="text-xs mb-3 line-clamp-2" style={{ color: colors.textTertiary }}>{project.description}</p>
      )}

      {stats.totalUnits > 0 && (
        <>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span style={{ color: colors.textSecondary }}>
              {stats.completedUnits} / {stats.totalUnits} units
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
        {stats.estimatedRemainingMinutes !== null && (
          <span className="flex items-center gap-1">
            <TrendingUp size={11} /> ~{formatDuration(stats.estimatedRemainingMinutes)} left
          </span>
        )}
        {stats.daysRemaining !== null && stats.daysRemaining >= 0 && (
          <span className="flex items-center gap-1">
            <Calendar size={11} /> {stats.daysRemaining}d left
          </span>
        )}
        {stats.daysRemaining !== null && stats.daysRemaining < 0 && (
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
  onDeleteContribution, calMode, allContributions, onActivityLinked, colors,
}: {
  project: ProgressProject;
  resources: ProgressResource[];
  contributions: ProgressContribution[];
  onBack: () => void;
  onUpdateProject: (patch: Partial<ProgressProject>) => void;
  onDeleteProject: () => void;
  onArchiveProject: (archived: boolean) => void;
  onAddResource: (data: { project_id: string; name: string; unit: string; total: number; completed?: number; stage?: string | null }) => Promise<unknown>;
  onUpdateResource: (id: string, patch: Partial<ProgressResource>) => void;
  onDeleteResource: (id: string) => void;
  onLogContribution: (data: { project_id: string; resource_id: string | null; units_added: number; date_key: string; duration_minutes?: number }) => Promise<unknown>;
  onDeleteContribution: (id: string) => Promise<void>;
  calMode: CalendarMode;
  allContributions: ProgressContribution[];
  onActivityLinked: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [showLinkActivity, setShowLinkActivity] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const accentColor = project.color || colors.accent;
  const stats = computeProjectStats(resources, contributions, project.deadline_date, project.target_study_minutes);
  const sc = statusColor(stats.status);
  const statusClr = sc === 'success' ? colors.success : sc === 'warning' ? colors.warning : colors.error;

  const todayKey = dateKey(todayGreg());

  const recentContributions = [...contributions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);

  // Today's logged progress
  const todayContributions = contributions.filter(c => c.date_key === todayKey);

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
          <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>{project.description}</p>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatBox label="Progress" value={`${stats.overallPct}%`} sub={`${stats.completedUnits}/${stats.totalUnits}`} color={accentColor} colors={colors} />
          <StatBox label="Studied" value={formatDuration(stats.studiedMinutes)} sub={project.target_study_minutes ? `of ${formatDuration(project.target_study_minutes)}` : undefined} color={colors.accent} colors={colors} />
          <StatBox label="Est. Remaining" value={stats.estimatedRemainingMinutes !== null ? `~${formatDuration(stats.estimatedRemainingMinutes)}` : '—'} sub={stats.pacePerHour !== null ? `${stats.pacePerHour.toFixed(1)} u/hr` : undefined} color={colors.warning} colors={colors} />
          <StatBox label="Deadline" value={stats.daysRemaining !== null ? (stats.daysRemaining >= 0 ? `${stats.daysRemaining}d` : 'Overdue') : '—'} sub={project.deadline_date ? formatProgressDate(project.deadline_date, calMode) : undefined} color={stats.daysRemaining !== null && stats.daysRemaining < 0 ? colors.error : colors.textPrimary} colors={colors} />
        </div>

        {/* Status + Daily Target */}
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: `${statusClr}18`, color: statusClr }}>
            <Target size={12} /> {statusLabel(stats.status)}
          </span>
          {stats.dailyTarget !== null && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: colors.bgInput, color: colors.textSecondary }}>
              <TrendingUp size={12} /> Daily target: {stats.dailyTarget} units
            </span>
          )}
          {stats.remainingUnits > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: colors.bgInput, color: colors.textSecondary }}>
              <BookOpen size={12} /> {stats.remainingUnits} units remaining
            </span>
          )}
        </div>

        {/* Remaining breakdown */}
        {stats.remainingByUnit.length > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: colors.textTertiary }}>Remaining</p>
            <div className="flex flex-wrap gap-2">
              {stats.remainingByUnit.map((r, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-lg" style={{ background: colors.bgInput, color: colors.textSecondary }}>
                  {r.remaining} {r.unit}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Today section */}
      {todayContributions.length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 8px ${colors.shadow}` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: colors.accent }}>Today</p>
          <div className="space-y-1.5">
            {todayContributions.map(c => {
              const res = resources.find(r => r.id === c.resource_id);
              return (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span style={{ color: colors.textSecondary }}>
                    {res ? res.name : 'General'}
                  </span>
                  <span className="font-semibold" style={{ color: colors.textPrimary }}>
                    {c.units_added > 0 ? `+${c.units_added} ${res?.unit || ''}` : ''}
                    {c.duration_minutes > 0 ? `${c.units_added > 0 ? ' · ' : ''}${formatDuration(c.duration_minutes)}` : ''}
                  </span>
                </div>
              );
            })}
            {(() => {
              const totalMin = todayContributions.reduce((s, c) => s + c.duration_minutes, 0);
              const totalUnits = todayContributions.reduce((s, c) => s + c.units_added, 0);
              if (totalMin === 0 && totalUnits === 0) return null;
              return (
                <div className="flex items-center justify-between text-xs pt-1.5 mt-1" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
                  <span className="font-bold" style={{ color: colors.textTertiary }}>Total today</span>
                  <span className="font-bold" style={{ color: colors.accent }}>
                    {totalUnits > 0 ? `${totalUnits} units` : ''}
                    {totalMin > 0 ? `${totalUnits > 0 ? ' · ' : ''}${formatDuration(totalMin)}` : ''}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

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

      {/* Recent activities */}
      <div className="rounded-xl p-6" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 12px ${colors.shadow}` }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>Recent Activity</span>
            <button onClick={() => setShowLinkActivity(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: colors.bgInput, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
              <Link2 size={12} /> Link Existing Activity
            </button>
          </div>
          {recentContributions.length === 0 && (
            <p className="text-xs" style={{ color: colors.textTertiary }}>No activities linked yet. Link an existing activity or log progress from a resource to record study time and output here.</p>
          )}
          {recentContributions.map(c => {
            const res = resources.find(r => r.id === c.resource_id);
            const isManual = c.activity_id.startsWith('manual-');
            return (
              <div key={c.id} className="group flex items-center justify-between py-2 text-xs" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                <span style={{ color: colors.textSecondary }}>
                  {formatProgressDate(c.date_key, calMode)}
                  {res ? ` — ${res.name}` : ''}
                </span>
                <div className="flex items-center gap-2">
                  <span style={{ color: colors.textTertiary }}>
                    {c.units_added > 0 ? `+${c.units_added} ` : ''}{formatDuration(c.duration_minutes)}
                  </span>
                  <button
                    onClick={async () => {
                      if (isManual) {
                        await onDeleteContribution(c.id);
                      } else {
                        await removeContribution(c.activity_id);
                        onActivityLinked();
                      }
                    }}
                    className="p-1 rounded transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                    style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
                    onMouseEnter={e => (e.currentTarget.style.color = colors.warning)}
                    onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
                    title="Unlink from Progress">
                    <Unlink size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      {showLinkActivity && (
        <LinkActivityModal
          project={project}
          resources={resources}
          contributions={allContributions}
          calMode={calMode}
          onLinked={onActivityLinked}
          onClose={() => setShowLinkActivity(false)}
          colors={colors}
        />
      )}

      {showResourceForm && (
        <ResourceFormModal
          onSave={async (data) => { await onAddResource({ ...data, project_id: project.id, completed: data.completed || 0 }); setShowResourceForm(false); }}
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

function getQuickAddButtons(unit: string): { label: string; amount: number }[] {
  const u = unit.toLowerCase();
  if (u === 'hours') return [{ label: '+15m', amount: 15 }, { label: '+30m', amount: 30 }, { label: '+1h', amount: 60 }];
  if (['pages', 'slides', 'questions', 'exercises', 'flashcards'].includes(u)) {
    return [{ label: '+1', amount: 1 }, { label: '+5', amount: 5 }, { label: '+10', amount: 10 }];
  }
  // videos, chapters, lectures, past papers, custom
  return [{ label: '+1', amount: 1 }];
}

// ─── Resource Row ─────────────────────────────────────────────────────────────

function ResourceRow({ resource, projectId, accentColor, onUpdate, onDelete, onLog, todayKey, colors }: {
  resource: ProgressResource;
  projectId: string;
  accentColor: string;
  onUpdate: (id: string, patch: Partial<ProgressResource>) => void;
  onDelete: (id: string) => void;
  onLog: (data: { project_id: string; resource_id: string | null; units_added: number; date_key: string; duration_minutes?: number }) => Promise<unknown>;
  todayKey: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Edit form state
  const [editName, setEditName] = useState(resource.name);
  const [editUnit, setEditUnit] = useState(UNIT_OPTIONS.includes(resource.unit) ? resource.unit : 'custom');
  const [editTotal, setEditTotal] = useState(String(resource.total));
  const [editCompleted, setEditCompleted] = useState(String(resource.completed));
  const [editStage, setEditStage] = useState<string>(resource.stage || '');
  const [editCustomUnit, setEditCustomUnit] = useState(!UNIT_OPTIONS.includes(resource.unit) ? resource.unit : '');

  const pct = resource.total > 0 ? Math.min(100, Math.round((resource.completed / resource.total) * 100)) : 0;
  const quickButtons = getQuickAddButtons(resource.unit);
  const isHours = resource.unit.toLowerCase() === 'hours';

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  function saveEdit() {
    const total = parseInt(editTotal) || 0;
    const completed = Math.min(parseInt(editCompleted) || 0, total);
    const finalUnit = editUnit === 'custom' ? (editCustomUnit.trim() || 'custom') : editUnit;
    onUpdate(resource.id, {
      name: editName.trim() || resource.name,
      unit: finalUnit,
      total,
      completed,
      stage: (editStage || null) as ProgressStage | null,
    });
    setEditing(false);
  }

  function quickAdd(amount: number) {
    if (isHours) {
      const hours = Math.round((amount / 60) * 100) / 100;
      onLog({ project_id: projectId, resource_id: resource.id, units_added: hours, date_key: todayKey, duration_minutes: amount });
    } else {
      onLog({ project_id: projectId, resource_id: resource.id, units_added: amount, date_key: todayKey, duration_minutes: 0 });
    }
  }

  function customAdd() {
    const n = parseFloat(customAmount);
    if (!n || n <= 0) return;
    if (isHours) {
      const hours = Math.round((n / 60) * 100) / 100;
      onLog({ project_id: projectId, resource_id: resource.id, units_added: hours, date_key: todayKey, duration_minutes: n });
    } else {
      onLog({ project_id: projectId, resource_id: resource.id, units_added: n, date_key: todayKey, duration_minutes: 0 });
    }
    setCustomAmount('');
    setShowLog(false);
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
            Total <input type="number" value={editTotal} onChange={e => setEditTotal(e.target.value)} className="w-20 rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }} />
          </label>
          <label className="text-xs flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
            Done <input type="number" value={editCompleted} onChange={e => setEditCompleted(e.target.value)} className="w-20 rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }} />
          </label>
          <select value={editStage} onChange={e => setEditStage(e.target.value)}
            className="rounded-lg px-3 py-2 text-xs outline-none"
            style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }}>
            <option value="">No stage</option>
            <option value="learn">Learn</option>
            <option value="practice">Practice</option>
            <option value="review">Review</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}>
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
          {resource.stage && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: `${accentColor}22`, color: accentColor }}>{resource.stage}</span>
          )}
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
                <button onClick={() => { setEditing(true); setMenuOpen(false); }}
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
            <span>{resource.completed} / {resource.total} {resource.unit}</span>
            {resource.total - resource.completed > 0 && (
              <span>{resource.total - resource.completed} remaining</span>
            )}
          </div>
          <div className="rounded-full h-2 overflow-hidden mb-2" style={{ background: `${accentColor}22` }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: accentColor }} />
          </div>
        </>
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
              <button key={b.label} onClick={() => quickAdd(b.amount)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ border: 'none', background: accentColor, color: '#fff', cursor: 'pointer' }}>
                {b.label}
              </button>
            ))}
          </div>
          {/* Custom input */}
          <div className="flex gap-1.5">
            <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)}
              placeholder={`Custom ${isHours ? 'minutes' : resource.unit}`}
              className="flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgCard, color: colors.textPrimary }}
              onKeyDown={e => e.key === 'Enter' && customAdd()} />
            <button onClick={customAdd} disabled={!customAmount || parseFloat(customAmount) <= 0}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{ background: accentColor, border: 'none', cursor: 'pointer', opacity: (!customAmount || parseFloat(customAmount) <= 0) ? 0.5 : 1 }}>
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

// ─── Stat Box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color, colors }: {
  label: string; value: string; sub?: string; color: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: colors.bgInput }}>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: colors.textTertiary }}>{label}</p>
      <p className="text-sm font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ color: colors.textTertiary }}>{sub}</p>}
    </div>
  );
}

// ─── Project Form Modal ───────────────────────────────────────────────────────

function ProjectFormModal({ initial, calMode, onSave, onCancel, colors }: {
  initial?: ProgressProject;
  calMode: CalendarMode;
  onSave: (data: { name: string; description?: string; color?: string | null; deadline_date?: string | null; target_study_minutes?: number | null }) => void;
  onCancel: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [color, setColor] = useState(initial?.color || '');
  const [deadlineDate, setDeadlineDate] = useState<string | null>(initial?.deadline_date || null);
  const [targetHours, setTargetHours] = useState(initial?.target_study_minutes ? String(Math.round(initial.target_study_minutes / 60)) : '');

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      color: color || null,
      deadline_date: deadlineDate || null,
      target_study_minutes: targetHours ? Math.round(parseFloat(targetHours) * 60) : null,
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
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Deadline (optional)</label>
            <DatePicker
              value={deadlineDate}
              calMode={calMode}
              onChange={setDeadlineDate}
              onClear={() => setDeadlineDate(null)}
              colors={colors}
            />
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
  onSave: (data: { name: string; unit: string; total: number; completed?: number; stage?: string | null }) => void;
  onCancel: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pages');
  const [total, setTotal] = useState('');
  const [completed, setCompleted] = useState('');
  const [stage, setStage] = useState('');
  const [customUnit, setCustomUnit] = useState('');

  function handleSave() {
    if (!name.trim()) return;
    const finalUnit = unit === 'custom' ? (customUnit.trim() || 'custom') : unit;
    const totalNum = parseInt(total) || 0;
    const completedNum = Math.min(parseInt(completed) || 0, totalNum);
    onSave({ name: name.trim(), unit: finalUnit, total: totalNum, completed: completedNum, stage: stage || null });
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

        <div className="grid grid-cols-2 gap-3 mb-3">
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
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Total</label>
            <input type="number" value={total} onChange={e => setTotal(e.target.value)} placeholder="0"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Completed (optional)</label>
            <input type="number" value={completed} onChange={e => setCompleted(e.target.value)} placeholder="0"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }} />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: colors.textSecondary }}>Stage (optional)</label>
            <select value={stage} onChange={e => setStage(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}>
              <option value="">No stage</option>
              <option value="learn">Learn</option>
              <option value="practice">Practice</option>
              <option value="review">Review</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
            style={{ background: colors.heroBg, border: 'none', cursor: !name.trim() ? 'not-allowed' : 'pointer', opacity: !name.trim() ? 0.6 : 1 }}>
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
