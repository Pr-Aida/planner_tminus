import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { ProgressProject, ProgressResource, ProgressContribution } from '../types';

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
    setResources((rRes.data as ProgressResource[]) || []);
    setContributions((cRes.data as ProgressContribution[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const createProject = useCallback(async (data: {
    name: string; description?: string; color?: string | null; icon?: string | null;
    deadline_date?: string | null; target_study_minutes?: number | null;
  }) => {
    if (!userId) return null;
    const { data: row } = await supabase.from('planner_progress_projects').insert({
      user_id: userId, name: data.name, description: data.description || null,
      color: data.color || null, icon: data.icon || null,
      deadline_date: data.deadline_date || null,
      target_study_minutes: data.target_study_minutes || null,
    }).select().single();
    if (row) setProjects(prev => [...prev, row as ProgressProject]);
    return row as ProgressProject | null;
  }, [userId]);

  const updateProject = useCallback(async (id: string, patch: Partial<ProgressProject>) => {
    await supabase.from('planner_progress_projects').update(patch).eq('id', id);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await supabase.from('planner_progress_projects').delete().eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setResources(prev => prev.filter(r => r.project_id !== id));
    setContributions(prev => prev.filter(c => c.project_id !== id));
  }, []);

  const archiveProject = useCallback(async (id: string, archived: boolean) => {
    await supabase.from('planner_progress_projects').update({ archived }).eq('id', id);
    setProjects(prev => prev.map(p => p.id === id ? { ...p, archived } : p));
  }, []);

  const createResource = useCallback(async (data: {
    project_id: string; name: string; unit: string; total: number; completed?: number; stage?: string | null;
  }) => {
    if (!userId) return null;
    const { data: row } = await supabase.from('planner_progress_resources').insert({
      user_id: userId, project_id: data.project_id, name: data.name,
      unit: data.unit, total: data.total, completed: data.completed || 0, stage: data.stage || null,
    }).select().single();
    if (row) setResources(prev => [...prev, row as ProgressResource]);
    return row as ProgressResource | null;
  }, [userId]);

  const updateResource = useCallback(async (id: string, patch: Partial<ProgressResource>) => {
    await supabase.from('planner_progress_resources').update(patch).eq('id', id);
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
  }) => {
    if (!userId) return null;
    const activityId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: row } = await supabase.from('planner_progress_contributions').insert({
      user_id: userId, activity_id: activityId,
      project_id: data.project_id, resource_id: data.resource_id,
      units_added: data.units_added, date_key: data.date_key,
      duration_minutes: data.duration_minutes || 0,
    }).select().single();
    if (row) setContributions(prev => [...prev, row as ProgressContribution]);

    // Update resource completed count
    if (data.resource_id && data.units_added !== 0) {
      setResources(prev => prev.map(r => {
        if (r.id !== data.resource_id) return r;
        const newCompleted = Math.max(0, r.completed + data.units_added);
        const finalCompleted = r.total > 0 ? Math.min(newCompleted, r.total) : newCompleted;
        supabase.from('planner_progress_resources').update({ completed: finalCompleted }).eq('id', r.id);
        return { ...r, completed: finalCompleted };
      }));
    }
    return row as ProgressContribution | null;
  }, [userId]);

  const deleteContribution = useCallback(async (id: string) => {
    const contrib = contributions.find(c => c.id === id);
    await supabase.from('planner_progress_contributions').delete().eq('id', id);
    setContributions(prev => prev.filter(c => c.id !== id));
    // Reverse the units on the resource
    if (contrib && contrib.resource_id && contrib.units_added !== 0) {
      setResources(prev => prev.map(r => {
        if (r.id !== contrib.resource_id) return r;
        const newCompleted = Math.max(0, r.completed - contrib.units_added);
        supabase.from('planner_progress_resources').update({ completed: newCompleted }).eq('id', r.id);
        return { ...r, completed: newCompleted };
      }));
    }
  }, [contributions]);

  return {
    projects, resources, contributions, loading, loadAll,
    createProject, updateProject, deleteProject, archiveProject,
    createResource, updateResource, deleteResource, setResourceCompleted,
    logContribution, deleteContribution,
  };
}
