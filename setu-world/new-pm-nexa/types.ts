
export enum UserRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER'
}

export type ProjectAccessLevel = 'read' | 'write' | 'none';

export type WidgetType = 'card' | 'chart';
export type ChartType = 'pie' | 'bar';
export type GroupBy = 'status' | 'priority' | 'category' | 'assignee';
export type ColorTheme = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'indigo' | 'slate';

export interface WidgetFilter {
  status?: TaskStatus | 'all';
  priority?: string | 'all';
  category?: TaskCategory | 'all';
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  // Card specific
  icon?: string;
  colorTheme?: ColorTheme;
  filter?: WidgetFilter;
  // Chart specific
  chartType?: ChartType;
  groupBy?: GroupBy;
}

export interface User {
  id: string;
  name: string;
  username: string;
  password: string;
  role: UserRole;
  avatar: string;
  isOnline?: boolean;
  projectAccess: Record<string, ProjectAccessLevel>;
  dashboardConfig?: DashboardWidget[];
}

export interface Group {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: number;
  createdBy: string;
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE'
}

export enum TaskCategory {
  TASK = 'TASK',
  ISSUE = 'ISSUE',
  BUG = 'BUG',
  STORY = 'STORY'
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  type: string;
  url?: string;
  uploadedBy?: string;
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  timestamp: number;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  status: TaskStatus;
  category: TaskCategory;
  description: string;
  priority: 'low' | 'medium' | 'high';
  assigneeId?: string;
  dueDate?: string;
  attachments: Attachment[];
  comments: Comment[];
  createdAt: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  category: TaskCategory;
  assigneeId?: string;
  subtasks: SubTask[];
  priority: 'low' | 'medium' | 'high';
  attachments: Attachment[];
  comments: Comment[];
  dueDate?: string;
  order?: number;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  memberIds: string[]; // Kept for backward compatibility
  attachments: Attachment[];
  comments: Comment[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId?: string; // If undefined, it is a global team message
  text: string;
  timestamp: number;
  type: 'text' | 'system' | 'missed_call';
  attachments?: Attachment[];
  isRead?: boolean;
}

export interface CallState {
  isActive: boolean;
  participants: string[];
  isScreenSharing: boolean;
}

export enum NotificationType {
  MENTION = 'MENTION',
  ASSIGNMENT = 'ASSIGNMENT',
  MISSED_CALL = 'MISSED_CALL',
  SYSTEM = 'SYSTEM'
}

export interface Notification {
  id: string;
  recipientId: string;
  senderId?: string; // Who triggered it
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  linkTo?: string; // ID of the related task or chat
}

export interface IncomingCall {
  callerId: string;
  timestamp: number;
  offer?: RTCSessionDescriptionInit; // WebRTC Offer
}

// WebRTC Signaling Types
export type SignalType = 'OFFER' | 'ANSWER' | 'CANDIDATE' | 'HANGUP' | 'CHAT_MSG' | 'CHAT_MESSAGE' | 'USER_ONLINE' | 'SCREEN_STARTED' | 'SCREEN_STOPPED';

export interface SignalData {
  type: SignalType;
  senderId: string;
  recipientId?: string;
  payload?: any;
}
