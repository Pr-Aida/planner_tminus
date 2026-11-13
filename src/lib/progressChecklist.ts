import { supabase } from './supabase';
import type { ChecklistItem } from '../types';

export async function fetchChecklistItems(projectId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from('planner_progress_checklist_items')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('fetchChecklistItems failed:', error);
    return [];
  }
  return (data as ChecklistItem[]) || [];
}

export async function createChecklistItem(
  projectId: string,
  userId: string,
  title: string,
  parentId: string | null,
  sortOrder: number,
): Promise<ChecklistItem | null> {
  const { data, error } = await supabase
    .from('planner_progress_checklist_items')
    .insert({
      project_id: projectId,
      user_id: userId,
      parent_id: parentId,
      title,
      completed: false,
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (error) {
    console.error('createChecklistItem failed:', error);
    return null;
  }
  return data as ChecklistItem;
}

export async function updateChecklistItem(
  id: string,
  patch: Partial<Pick<ChecklistItem, 'title' | 'completed' | 'sort_order'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('planner_progress_checklist_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('updateChecklistItem failed:', error);
    return false;
  }
  return true;
}

export async function deleteChecklistItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('planner_progress_checklist_items')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('deleteChecklistItem failed:', error);
    return false;
  }
  return true;
}

export async function setSubtasksCompleted(parentId: string, completed: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('planner_progress_checklist_items')
    .update({ completed, updated_at: new Date().toISOString() })
    .eq('parent_id', parentId);
  if (error) {
    console.error('setSubtasksCompleted failed:', error);
    return false;
  }
  return true;
}

export async function saveProjectNotes(projectId: string, notes: string): Promise<boolean> {
  const { error } = await supabase
    .from('planner_progress_projects')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) {
    console.error('saveProjectNotes failed:', error);
    return false;
  }
  return true;
}

export type { ChecklistItem };
