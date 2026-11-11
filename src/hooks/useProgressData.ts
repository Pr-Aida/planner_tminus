import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { shiftResourceCompleted } from '../lib/progressSync';
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

export function useProgressData(userId: string | null) {
  const [projects, setProjects] = useState<ProgressProject[]>([]);
  const [resources, setResources] = useState<ProgressResource[]>([]);
  const [contributions, setContributions] = useState<ProgressContribution[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const [pRes, rRes, cRes] = await Promise.all([
      supabase.from('planner_progress_projects').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
      supabase.from('planner_progress_resources').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
      supabase.from('planner_progress_contributions').select('*').eq('user_id', userId),
    ]);
    setProjects((pRes.data as ProgressProject[]) || []);
    setResources(((rRes.data as ProgressResource[]) || []).map(sanitizeResource));
    setContributions(((cRes.data as ProgressContribution[]) || []).map(sanitizeContribution));
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Refetch when the window regains focus (cross-device sync)
  useEffect(() => {
    function onFocus() { loadAll(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadAll]);

  const createProject = useCallback(async (data: {
    name: string; description?: string; color?: string | null; icon?: string | null;
    deadline_date?: string | null; target_study_minutes?: number | null;
    status?: ProjectStatus;
  }) => {
    if (!userId) return null;
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

  const updateProject = useCallback(async (id: string, patch: Partial<ProgressProject>) => {
    const { error } = await supabase.from('planner_progress_projects').update(patch).eq('id', id);
    if (error) { console.error('Failed to update project:', error); return; }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await supabase.from('planner_progress_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setResources(prev => prev.filter(r => r.project_id !== id));
    setContributions(prev => prev.filter(c => c.project_id !== id));
  }, []);

  const archiveProject = useCallback(async (id: string, archived: boolean) => {
    const newStatus = archived ? 'archived' : 'in_progress';
    await supabase.from('planner_progress_projects').update({ archived, status: newStatus }).eq('id', id);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, archived, status: newStatus } : p));
  }, []);

  const createResource = useCallback(async (data: {
    project_id: string; name: string; unit: string; total: number; completed?: number; stage?: string | null;
  }) => {
    if (!userId) return null;
    const { data: row, error } = await supabase.from('planner_progress_resources').insert({
      user_id: userId, project_id: data.project_id, name: data.name,
      unit: data.unit, total: data.total, completed: data.completed || 0, stage: data.stage || null,
    }).select().single();
    if (error) { console.error('Failed to create resource:', error); return null; }
    if (row) setResources(prev => [...prev, row as ProgressResource]);
    return row as ProgressResource | null;
  }, [userId]);

  const updateResource = useCallback(async (id: string, patch: Partial<ProgressResource>) => {
    const { error } = await supabase.from('planner_progress_resources').update(patch).eq('id', id);
    if (error) { console.error('Failed to update resource:', error); return; }
    setResources(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const deleteResource = useCallback(async (id: string) => {
    await supabase.from('planner_progress_resources').delete().eq('id', id);
    setResources(prev => prev.filter(r => r.id !== id));
  }, []);

  const setResourceCompleted = useCallback(async (id: string, completed: number) => {
    await supabase.from('planner_progress_resources').update({ completed }).eq('id', id);
    setResources(prev => prev.map(r => r.id === id ? { ...r, completed } : r));
  }, []);

  const logContribution = useCallback(async (data: {
    project_id: string; resource_id: string | null; units_added: number; date_key: string; duration_minutes?: number;
  }): Promise<boolean> => {
    if (!userId) return false;
    const activityId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeUnits = safeNum(data.units_added);
    const safeDuration = safeNum(data.duration_minutes);

    // Insert contribution first
    const { data: row, error: insertErr } = await supabase.from('planner_progress_contributions').insert({
      user_id: userId, activity_id: activityId,
      project_id: data.project_id, resource_id: data.resource_id,
      units_added: safeUnits, date_key: data.date_key,
      duration_minutes: safeDuration,
    }).select().single();
    if (insertErr || !row) {
      console.error('Failed to log contribution:', insertErr);
      return false;
    }
    const contribution = sanitizeContribution(row as ProgressContribution);

    // Atomically shift resource completed
    if (data.resource_id && safeUnits !== 0) {
      const next = await shiftResourceCompleted(data.resource_id, safeUnits);
      if (next === null) {
        // Rollback the contribution insert
        await supabase.from('planner_progress_contributions').delete().eq('id', contribution.id);
        return false;
      }
      setResources(prev => prev.map(r => r.id === data.resource_id ? { ...r, completed: next } : r));
    }
    setContributions(prev => [...prev, contribution]);
    return true;
  }, [userId]);

  const deleteContribution = useCallback(async (id: string): Promise<void> => {
    const contrib = contributions.find(c => c.id === id);
    if (!contrib) return;

    // Reverse resource shift FIRST (atomically), then delete contribution
    if (contrib.resource_id && contrib.units_added !== 0) {
      const next = await shiftResourceCompleted(contrib.resource_id, -contrib.units_added);
      if (next === null) {
        console.error('Failed to reverse resource completed');
        return;
      }
      setResources(prev => prev.map(r => r.id === contrib.resource_id ? { ...r, completed: next } : r));
    }

    const { error } = await supabase.from('planner_progress_contributions').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete contribution:', error);
      // Re-apply the shift since delete failed
      if (contrib.resource_id && contrib.units_added !== 0) {
        const restored = await shiftResourceCompleted(contrib.resource_id, contrib.units_added);
        if (restored !== null) {
          setResources(prev => prev.map(r => r.id === contrib.resource_id ? { ...r, completed: restored } : r));
        }
      }
      return;
    }
    setContributions(prev => prev.filter(c => c.id !== id));
  }, [contributions]);

  return {
    projects, resources, contributions, loading, loadAll,
    createProject, updateProject, deleteProject, archiveProject,
    createResource, updateResource, deleteResource, setResourceCompleted,
    logContribution, deleteContribution,
  };
}
