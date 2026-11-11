import { supabase } from './supabase';
import { getSignedInUserId } from './activitySync';

export interface ContributionInput {
  activityId: string;
  projectId: string;
  resourceId: string | null;
  unitsAdded: number;
  dateKey: string;
  durationMinutes: number;
}

export async function upsertContribution(input: ContributionInput): Promise<void> {
  const userId = await getSignedInUserId();
  if (!userId) return;

  const existing = await supabase
    .from('planner_progress_contributions')
    .select('id, units_added')
    .eq('activity_id', input.activityId)
    .eq('project_id', input.projectId)
    .eq('resource_id', input.resourceId || '')
    .maybeSingle();

  if (existing.data) {
    const prev = (existing.data as { units_added: number }).units_added;
    const delta = input.unitsAdded - prev;

    if (input.resourceId && delta !== 0) {
      const res = await supabase
        .from('planner_progress_resources')
        .select('completed, total')
        .eq('id', input.resourceId)
        .maybeSingle();
      if (res.data) {
        const newCompleted = Math.max(0, Math.min(
          (res.data as { completed: number; total: number }).completed + delta,
          (res.data as { completed: number; total: number }).total
        ));
        await supabase.from('planner_progress_resources').update({ completed: newCompleted }).eq('id', input.resourceId);
      }
    }

    await supabase.from('planner_progress_contributions')
      .update({ units_added: input.unitsAdded, duration_minutes: input.durationMinutes })
      .eq('id', (existing.data as { id: string }).id);
  } else {
    if (input.resourceId && input.unitsAdded > 0) {
      const res = await supabase
        .from('planner_progress_resources')
        .select('completed, total')
        .eq('id', input.resourceId)
        .maybeSingle();
      if (res.data) {
        const newCompleted = Math.max(0, Math.min(
          (res.data as { completed: number; total: number }).completed + input.unitsAdded,
          (res.data as { completed: number; total: number }).total
        ));
        await supabase.from('planner_progress_resources').update({ completed: newCompleted }).eq('id', input.resourceId);
      }
    }

    await supabase.from('planner_progress_contributions').insert({
      user_id: userId,
      activity_id: input.activityId,
      project_id: input.projectId,
      resource_id: input.resourceId,
      units_added: input.unitsAdded,
      date_key: input.dateKey,
      duration_minutes: input.durationMinutes,
    });
  }
}

export async function removeContribution(activityId: string, projectId: string, resourceId: string | null): Promise<void> {
  const existing = await supabase
    .from('planner_progress_contributions')
    .select('id, units_added')
    .eq('activity_id', activityId)
    .eq('project_id', projectId)
    .eq('resource_id', resourceId || '')
    .maybeSingle();

  if (!existing.data) return;

  const prev = (existing.data as { units_added: number }).units_added;
  if (resourceId && prev > 0) {
    const res = await supabase
      .from('planner_progress_resources')
      .select('completed')
      .eq('id', resourceId)
      .maybeSingle();
    if (res.data) {
      const newCompleted = Math.max(0, (res.data as { completed: number }).completed - prev);
      await supabase.from('planner_progress_resources').update({ completed: newCompleted }).eq('id', resourceId);
    }
  }

  await supabase.from('planner_progress_contributions')
    .delete()
    .eq('id', (existing.data as { id: string }).id);
}

export async function getActivityLink(activityId: string): Promise<{ project_id: string; resource_id: string | null; units_added: number } | null> {
  const { data } = await supabase
    .from('planner_progress_contributions')
    .select('project_id, resource_id, units_added')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!data) return null;
  return data as { project_id: string; resource_id: string | null; units_added: number };
}

export function calcDurationMinutes(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const diff = (th * 60 + tm) - (fh * 60 + fm);
  return diff > 0 ? diff : 0;
}
