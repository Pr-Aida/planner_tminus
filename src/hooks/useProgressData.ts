import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { shiftResourceCompleted } from '../lib/progressSync';
import { isTimeUnit } from '../lib/progress';
import type { ProgressProject, ProgressResource, ProgressContribution, ProjectStatus } from '../types';

// Safe number: avoids NaN/Infinity from malformed DB data
function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeResource(r: Partial<ProgressResource>): ProgressResource {
  return {
    ...r,
    total: safeNum(r.total),
    completed: safeNum(r.completed),
    sort_order: safeNum(r.sort_order),
  } as ProgressResource;
}

function sanitizeContribution(c: Partial<ProgressContribution>): ProgressContribution {
  return {
    ...c,
    units_added: safeNum(c.units_added),
    duration_minutes: safeNum(c.duration_minutes),
  } as ProgressContribution;
}

function sanitizeContributions(rows: Partial<ProgressContribution>[], resources: ProgressResource[]): ProgressContribution[] {
  const unitById = new Map(resources.map(r => [r.id, r.unit]));
  return rows.map(row => {
    const contribution = sanitizeContribution(row);
    const unit = contribution.resource_id ? unitById.get(contribution.resource_id) : null;
    if (!isTimeUnit(unit)) return contribution;
    const minutes = contribution.activity_id.startsWith('manual-')
      ? contribution.units_added
      : contribution.duration_minutes > 0 ? contribution.duration_minutes : contribution.units_added;
    return { ...contribution, units_added: minutes, duration_minutes: minutes };
  });
}

export function useProgressData(userId: string | null) {
  const [projects, setProjects] = useState<ProgressProject[]>([]);
  const [resources, setResources] = useState<ProgressResource[]>([]);
  const [contributions, setContributions] = useState<ProgressContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUserRef = useRef(userId);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const dataVersionRef = useRef(0);
  currentUserRef.current = userId;

  const markMutation = () => { dataVersionRef.current += 1; };

  const loadAll = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    if (loadPromiseRef.current) return loadPromiseRef.current;
    const requestVersion = dataVersionRef.current;
    const requestUserId = userId;
    setLoading(true);
    const request = Promise.all([
      supabase.from('planner_progress_projects').select('*').eq('user_id', requestUserId).order('sort_order', { ascending: true }),
      supabase.from('planner_progress_resources').select('*').eq('user_id', requestUserId).order('sort_order', { ascending: true }),
      supabase.from('planner_progress_contributions').select('*').eq('user_id', requestUserId),
    ]).then(([pRes, rRes, cRes]) => {
      if (currentUserRef.current !== requestUserId) return;
      if (dataVersionRef.current !== requestVersion) {
        setLoading(false);
        return;
      }
      const loadedResources = ((rRes.data as ProgressResource[]) || []).map(sanitizeResource);
      setProjects((pRes.data as ProgressProject[]) || []);
      setResources(loadedResources);
      setContributions(sanitizeContributions((cRes.data as ProgressContribution[]) || [], loadedResources));
      setLoading(false);
    }).finally(() => {
      if (loadPromiseRef.current === request) loadPromiseRef.current = null;
    });
    loadPromiseRef.current = request;
    return request;
  }, [userId]);

  useEffect(() => {
    loadPromiseRef.current = null;
    if (!userId) {
      setProjects([]);
      setResources([]);
      setContributions([]);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Refetch when the window regains focus (cross-device sync)
  useEffect(() => {
    function onFocus() { loadAll(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadAll]);

  const createProject = useCallback(async (data: {
    name: string; description?: string | null; color?: string | null; icon?: string | null;
    deadline_date?: string | null; target_study_minutes?: number | null;
    status?: ProjectStatus;
  }) => {
    if (!userId) return null;
    markMutation();
    const { data: row, error } = await supabase.from('planner_progress_projects').insert({
      user_id: userId, name: data.name, description: data.description || null,
      color: data.color || null, icon: data.icon || null,
      deadline_date: data.deadline_date || null,
      target_study_minutes: data.target_study_minutes || null,
      status: data.status || 'in_progress',
    }).select().single();
    if (error) { console.error('Failed to create project:', error); return null; }
    if (row) setProjects(prev => [...prev, row as ProgressProject]);
    return row as ProgressProject | null;
  }, [userId]);

  const updateProject = useCallback(async (id: string, patch: Partial<ProgressProject>): Promise<boolean> => {
    const previous = projects.find(p => p.id === id);
    if (!previous) return false;
    markMutation();
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    const { error } = await supabase.from('planner_progress_projects').update(patch).eq('id', id);
    if (error) {
      console.error('Failed to update project:', error);
      setProjects(prev => prev.map(p => p.id === id ? previous : p));
      return false;
    }
    return true;
  }, [projects]);

  const deleteProject = useCallback(async (id: string) => {
    markMutation();
    await supabase.from('planner_progress_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setResources(prev => prev.filter(r => r.project_id !== id));
    setContributions(prev => prev.filter(c => c.project_id !== id));
  }, []);

  const archiveProject = useCallback(async (id: string, archived: boolean) => {
    markMutation();
    const newStatus = archived ? 'archived' : 'in_progress';
    await supabase.from('planner_progress_projects').update({ archived, status: newStatus }).eq('id', id);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, archived, status: newStatus } : p));
  }, []);

  const createResource = useCallback(async (data: {
    project_id: string; name: string; unit: string; total: number; completed?: number; stage?: string | null;
  }) => {
    if (!userId) return null;
    markMutation();
    const { data: row, error } = await supabase.from('planner_progress_resources').insert({
      user_id: userId, project_id: data.project_id, name: data.name,
      unit: data.unit, total: data.total, completed: data.completed || 0, stage: data.stage || null,
    }).select().single();
    if (error) { console.error('Failed to create resource:', error); return null; }
    if (row) setResources(prev => [...prev, row as ProgressResource]);
    return row as ProgressResource | null;
  }, [userId]);

  const updateResource = useCallback(async (id: string, patch: Partial<ProgressResource>): Promise<boolean> => {
    const previous = resources.find(r => r.id === id);
    if (!previous) return false;
    markMutation();
    setResources(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const { error } = await supabase.from('planner_progress_resources').update(patch).eq('id', id);
    if (error) {
      console.error('Failed to update resource:', error);
      setResources(prev => prev.map(r => r.id === id ? previous : r));
      return false;
    }
    return true;
  }, [resources]);

  const deleteResource = useCallback(async (id: string) => {
    markMutation();
    await supabase.from('planner_progress_resources').delete().eq('id', id);
    setResources(prev => prev.filter(r => r.id !== id));
  }, []);

  // Completed edits are recorded as a signed contribution so that the sum of
  // contributions always equals Resource.completed (one source of truth).
  const adjustResourceCompleted = useCallback(async (id: string, target: number, dateKey: string): Promise<boolean> => {
    if (!userId) return false;
    const resource = resources.find(r => r.id === id);
    if (!resource) return false;
    const delta = target - resource.completed;
    if (delta === 0) return true;
    markMutation();
    const activityId = `adjust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: row, error: insertErr } = await supabase.from('planner_progress_contributions').insert({
      user_id: userId, activity_id: activityId,
      project_id: resource.project_id, resource_id: id,
      units_added: delta, date_key: dateKey,
      duration_minutes: isTimeUnit(resource.unit) ? delta : 0,
    }).select().single();
    if (insertErr || !row) {
      console.error('Failed to record progress adjustment:', insertErr);
      return false;
    }
    const contribution = sanitizeContribution(row as ProgressContribution);
    const next = await shiftResourceCompleted(id, delta);
    if (next === null) {
      await supabase.from('planner_progress_contributions').delete().eq('id', contribution.id);
      return false;
    }
    setResources(prev => prev.map(r => r.id === id ? { ...r, completed: next } : r));
    setContributions(prev => [...prev, contribution]);
    return true;
  }, [userId, resources]);

  const logContribution = useCallback(async (data: {
    project_id: string; resource_id: string | null; units_added: number; date_key: string; duration_minutes?: number;
  }): Promise<boolean> => {
    if (!userId) return false;
    markMutation();
    const activityId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeUnits = safeNum(data.units_added);
    const resourceId = data.resource_id;
    const resource = resources.find(r => r.id === resourceId);
    const storedDuration = resource && isTimeUnit(resource.unit) ? safeUnits : 0;
    const applyLocal = (delta: number) => {
      if (!resourceId || delta === 0) return;
      setResources(prev => prev.map(r => r.id === resourceId ? { ...r, completed: r.completed + delta } : r));
    };
    applyLocal(safeUnits);

    // Insert contribution first
    const { data: row, error: insertErr } = await supabase.from('planner_progress_contributions').insert({
      user_id: userId, activity_id: activityId,
      project_id: data.project_id, resource_id: resourceId,
      units_added: safeUnits, date_key: data.date_key,
      duration_minutes: storedDuration,
    }).select().single();
    if (insertErr || !row) {
      console.error('Failed to log contribution:', insertErr);
      applyLocal(-safeUnits);
      return false;
    }
    const contribution = sanitizeContribution(row as ProgressContribution);

    // Atomically shift resource completed
    if (resourceId && safeUnits !== 0) {
      const next = await shiftResourceCompleted(resourceId, safeUnits);
      if (next === null) {
        applyLocal(-safeUnits);
        await supabase.from('planner_progress_contributions').delete().eq('id', contribution.id);
        return false;
      }
      setResources(prev => prev.map(r => r.id === resourceId ? { ...r, completed: next } : r));
    }
    setContributions(prev => [...prev, contribution]);
    return true;
  }, [userId, resources]);


  const deleteContribution = useCallback(async (id: string): Promise<boolean> => {
    const contrib = contributions.find(c => c.id === id);
    if (!contrib) return false;
    markMutation();

    if (contrib.resource_id && contrib.units_added !== 0) {
      const next = await shiftResourceCompleted(contrib.resource_id, -contrib.units_added);
      if (next === null) {
        console.error('Failed to reverse resource completed');
        return false;
      }
      setResources(prev => prev.map(r => r.id === contrib.resource_id ? { ...r, completed: next } : r));
    }

    const { error } = await supabase.from('planner_progress_contributions').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete contribution:', error);
      if (contrib.resource_id && contrib.units_added !== 0) {
        const restored = await shiftResourceCompleted(contrib.resource_id, contrib.units_added);
        if (restored !== null) {
          setResources(prev => prev.map(r => r.id === contrib.resource_id ? { ...r, completed: restored } : r));
        }
      }
      return false;
    }
    setContributions(prev => prev.filter(c => c.id !== id));
    return true;
  }, [contributions]);

  return {
    projects, resources, contributions, loading, loadAll,
    createProject, updateProject, deleteProject, archiveProject,
    createResource, updateResource, deleteResource, adjustResourceCompleted,
    logContribution, deleteContribution,
  };
}
