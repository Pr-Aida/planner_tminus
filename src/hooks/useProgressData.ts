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
    project_id: string; name: string; unit: string; total: number; stage?: string | null;
  }) => {
    if (!userId) return null;
    const { data: row } = await supabase.from('planner_progress_resources').insert({
      user_id: userId, project_id: data.project_id, name: data.name,
      unit: data.unit, total: data.total, completed: 0, stage: data.stage || null,
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

  return {
    projects, resources, contributions, loading, loadAll,
    createProject, updateProject, deleteProject, archiveProject,
    createResource, updateResource, deleteResource, setResourceCompleted,
  };
}
