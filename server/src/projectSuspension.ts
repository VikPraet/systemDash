import { listProjects, updateProject } from "./projects.js";
import { startSuspendedPage } from "./suspendedPage.js";

/** In-memory mirror of the persisted `projects.suspended` flag. */
export const suspendedProjects = new Set<number>();

/** Load suspension flags from the DB into the in-memory set (call before the worker supervisor). */
export function hydrateSuspendedProjects(): void {
  suspendedProjects.clear();
  for (const project of listProjects()) {
    if (project.suspended) suspendedProjects.add(project.id);
  }
}

/** Persist suspension and keep the in-memory set in sync. */
export function setProjectSuspended(id: number, suspended: boolean): void {
  if (suspended) suspendedProjects.add(id);
  else suspendedProjects.delete(id);
  updateProject(id, { suspended });
}

/**
 * Re-bind the “Service suspended” page for every project that was left off
 * across a Beacon restart, so public hostnames still answer while the real
 * app stays down.
 */
export async function restoreSuspendedPages(): Promise<void> {
  for (const project of listProjects()) {
    if (!project.suspended) continue;
    suspendedProjects.add(project.id);
    try {
      await startSuspendedPage(project);
    } catch (err) {
      console.error(`Suspended page for project ${project.id} (${project.name}) failed:`, err);
    }
  }
}
