import { invoke } from "@tauri-apps/api/core";

export interface Session {
  id: number;
  goal: string;
  plannedMinutes: number;
  startedAt: string;
  endedAt?: string | null;
}

export interface SessionWithStats {
  id: number;
  goal: string;
  plannedMinutes: number;
  startedAt: string;
  endedAt?: string | null;
  distractionCount: number;
}

export interface Distraction {
  id: number;
  sessionId: number;
  processName: string;
  timestamp: string;
}

export interface BlacklistItem {
  id: number;
  name: string;
  itemType: "app" | "domain";
}

export interface DistractionEventPayload {
  sessionId: number;
  processName: string;
  sessionGoal: string;
}

/**
 * Ping backend to verify Tauri IPC communication
 */
export async function ping(): Promise<string> {
  return invoke<string>("ping");
}

/**
 * Start a new focus session
 */
export async function startSession(goal: string, minutes: number): Promise<Session> {
  return invoke<Session>("start_session", { goal, minutes });
}

/**
 * End the currently active session
 */
export async function endSession(): Promise<Session | null> {
  return invoke<Session | null>("end_session");
}

/**
 * Get currently active focus session, if one exists
 */
export async function getActiveSession(): Promise<Session | null> {
  return invoke<Session | null>("get_active_session");
}

/**
 * Get past session history with distraction statistics
 */
export async function getHistory(): Promise<SessionWithStats[]> {
  return invoke<SessionWithStats[]>("get_history");
}

/**
 * Get detailed distractions recorded for a specific session
 */
export async function getSessionDistractions(sessionId: number): Promise<Distraction[]> {
  return invoke<Distraction[]>("get_session_distractions", { sessionId });
}

/**
 * Get all current blacklist items
 */
export async function getBlacklist(): Promise<BlacklistItem[]> {
  return invoke<BlacklistItem[]>("get_blacklist");
}

/**
 * Add an item to the blacklist
 */
export async function addBlacklistItem(
  name: string,
  itemType: "app" | "domain",
): Promise<BlacklistItem> {
  return invoke<BlacklistItem>("add_blacklist_item", { name, itemType });
}

/**
 * Remove an item from the blacklist
 */
export async function removeBlacklistItem(id: number): Promise<boolean> {
  return invoke<boolean>("remove_blacklist_item", { id });
}

/**
 * Hide the distraction warning overlay window
 */
export async function hideOverlay(): Promise<void> {
  return invoke<void>("hide_overlay");
}

/**
 * Bring the main application window to the foreground and focus it
 */
export async function showMainWindow(): Promise<void> {
  return invoke<void>("show_main_window");
}

