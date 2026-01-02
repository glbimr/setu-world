import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../store';
import { supabase } from '../supabaseClient';
import { Task, TaskStatus, SubTask, Attachment, Comment, User, UserRole, NotificationType, TaskCategory, Project } from '../types';
import {
  Pencil, Plus, CheckSquare, Square, LockKeyhole,
  X, Calendar, Clock, Paperclip, Trash2, Send,
  Minus, FileText, Download, Share2, ChevronDown, ChevronUp, Eye,
  Bookmark, AlertTriangle, Bug, BookOpen, CheckCircle2, Check, User as UserIcon,
  LayoutGrid, List, Search, SlidersHorizontal, ArrowUpDown, MoreVertical, Settings,
  Link as LinkIcon, Circle
} from 'lucide-react';
import { Modal } from '../components/Modal';

// --- Category Helpers ---
const CATEGORY_STYLES = {
  [TaskCategory.TASK]: { label: 'Task', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: CheckCircle2 },
  [TaskCategory.ISSUE]: { label: 'Issue', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle },
  [TaskCategory.BUG]: { label: 'Bug', color: 'bg-red-100 text-red-700 border-red-200', icon: Bug },
  [TaskCategory.STORY]: { label: 'Story', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: BookOpen },
};

const PRIORITY_STYLES = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-orange-50 text-orange-600 border-orange-100',
  high: 'bg-red-50 text-red-600 border-red-100',
};

// --- Helper for rendering text with mentions ---
const renderWithMentions = (text: string, users: User[]) => {
  const sortedUsers = [...users].sort((a, b) => b.name.length - a.name.length);
  const userNames = sortedUsers.map(u => u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (userNames.length === 0) return text;

  const pattern = new RegExp(`(@(?:${userNames.join('|')}))`, 'g');

  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) => {
        const isMention = sortedUsers.some(u => '@' + u.name === part);
        if (isMention) {
          return (
            <span key={i} className="text-indigo-600 font-semibold bg-indigo-50 px-1 rounded mx-0.5 text-xs border border-indigo-100">
              {part}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};

// --- Task Card Component ---
const TaskCardItem: React.FC<{
  task: Task;
  users: User[];
  canEdit: boolean;
  onEditTask: (task: Task) => void;
  onEditSubtask: (task: Task, subtask: SubTask) => void;
  onUpdateTask: (task: Task) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDropOnTask: (e: React.DragEvent, targetTaskId: string, position: 'before' | 'after') => void;
}> = ({ task, users, canEdit, onEditTask, onEditSubtask, onUpdateTask, onDragStart, onDropOnTask }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assigningSubtaskId, setAssigningSubtaskId] = useState<string | null>(null);

  const assigneeRef = useRef<HTMLDivElement>(null);
  const subtaskAssigneeRef = useRef<HTMLDivElement>(null);

  const completedSubtasks = task.subtasks.filter(s => s.completed).length;
  const assignee = users.find(u => u.id === task.assigneeId);
  const categoryConfig = CATEGORY_STYLES[task.category] || CATEGORY_STYLES[TaskCategory.TASK];
  const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.low;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (assigneeRef.current && !assigneeRef.current.contains(event.target as Node)) {
        setIsAssigning(false);
      }
      if (subtaskAssigneeRef.current && !subtaskAssigneeRef.current.contains(event.target as Node)) {
        setAssigningSubtaskId(null);
      }
    };
    if (isAssigning || assigningSubtaskId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAssigning, assigningSubtaskId]);

  const { currentUser } = useApp();
  const hasProjectWrite = currentUser?.role === 'ADMIN' || (currentUser?.projectAccess?.[task.projectId] === 'write');
  // Allow editing for admins or anyone with write OR read access (as per requirements to change state/assignee/comments)
  const hasAccess = currentUser?.role === 'ADMIN' || (currentUser?.projectAccess?.[task.projectId] !== undefined && currentUser?.projectAccess?.[task.projectId] !== 'none');
  const isEditable = canEdit && hasAccess;

  const toggleSubtaskCompletion = (subtaskId: string) => {
    if (!isEditable) return;
    const updatedSubtasks = task.subtasks.map(s =>
      s.id === subtaskId ? { ...s, completed: !s.completed, status: !s.completed ? TaskStatus.DONE : TaskStatus.TODO } : s
    );
    onUpdateTask({ ...task, subtasks: updatedSubtasks });
  };

  const handleAssign = (userId: string | undefined) => {
    if (!isEditable) return;
    onUpdateTask({ ...task, assigneeId: userId });
    setIsAssigning(false);
  };

  const handleSubtaskAssign = (subtaskId: string, userId: string | undefined) => {
    if (!isEditable) return;
    const updatedSubtasks = task.subtasks.map(s =>
      s.id === subtaskId ? { ...s, assigneeId: userId } : s
    );
    onUpdateTask({ ...task, subtasks: updatedSubtasks });
    setAssigningSubtaskId(null);
  };

  return (
    <div
      draggable={isEditable}
      onDragStart={(e) => { if (isEditable) onDragStart(e, task.id); }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        onDropOnTask(e, task.id, e.clientY < midY ? 'before' : 'after');
      }}
      className={`bg-white p-3 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-100 transition-all group relative 
        ${isEditable ? 'cursor-grab active:cursor-grabbing hover:shadow-lg hover:border-indigo-100 hover:-translate-y-0.5' : 'cursor-default opacity-90'}
        ${(isAssigning || assigningSubtaskId) ? 'z-[100] ring-2 ring-indigo-100 shadow-xl' : 'z-0'}
      `}
    >
      {/* 1. Header: Badges Left, Actions Right */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${categoryConfig.color}`}>
            {categoryConfig.label}
          </span>
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border capitalize ${priorityStyle}`}>
            {task.priority}
          </span>
        </div>

        {/* Fixed visibility for action buttons */}
        <div className="flex items-center space-x-1">
          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-slate-50 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
            className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-slate-50 transition-colors"
            title={canEdit ? "Edit Task" : "View Details"}
          >
            {isEditable ? <Pencil size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* 2. Main Content: Title/Date Left, Assignee Right (Bigger) */}
      <div className="flex justify-between items-start mb-1 gap-4">
        <div className="flex flex-col flex-1 min-w-0 mr-2">
          <h4 className="font-semibold text-slate-800 text-sm leading-snug break-words">
            {task.title}
          </h4>

          {/* Due Date moved below title */}
          {task.dueDate && (
            <div className={`flex items-center text-xs font-medium mt-1.5 ${new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-slate-400'}`} title="Due Date">
              <Clock size={13} className="mr-1.5" />
              {new Date(task.dueDate).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Assignee Avatar - Increased Size */}
        <div ref={assigneeRef} className="relative shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); if (isEditable) setIsAssigning(!isAssigning); }}
            className={`flex items-center transition-transform hover:scale-105 ${isEditable ? 'cursor-pointer' : ''}`}
            title={isEditable ? "Click to reassign" : "Assignee"}
            disabled={!isEditable}
          >
            {assignee ? (
              <div className="relative">
                <img src={assignee.avatar} alt={assignee.name} className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm" />
                {isEditable && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-slate-200"><Pencil size={10} className="text-slate-500" /></div>}
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border-2 border-slate-50 border-dashed hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-500 transition-colors">
                <UserIcon size={14} />
              </div>
            )}
          </button>

          {isAssigning && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col p-1">
              <div className="px-2 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 mb-1">
                Assign To
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleAssign(undefined); }}
                className="w-full text-left flex items-center px-2 py-2 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs text-slate-500 transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center mr-3 text-slate-400 group-hover:bg-red-100 group-hover:text-red-500"><X size={14} /></div>
                <span className="font-medium">Unassigned</span>
                {!task.assigneeId && <Check size={14} className="ml-auto" />}
              </button>
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={(e) => { e.stopPropagation(); handleAssign(u.id); }}
                  className={`w-full text-left flex items-center px-2 py-2 hover:bg-slate-50 rounded-lg transition-colors ${task.assigneeId === u.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}
                >
                  <div className="relative mr-3">
                    <img src={u.avatar} className="w-6 h-6 rounded-full object-cover" />
                    {u.isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></div>}
                  </div>
                  <span className="text-xs font-medium truncate flex-1">{u.name}</span>
                  {task.assigneeId === u.id && <Check size={14} className="ml-2 text-indigo-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Footer: Subtasks & Attachments */}
      <div className="flex items-center space-x-4 pt-2 mt-2 border-t border-slate-50">
        <div className={`flex items-center text-xs font-medium ${task.subtasks.length > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
          <CheckSquare size={16} className={`mr-2 ${completedSubtasks === task.subtasks.length && task.subtasks.length > 0 ? 'text-green-500' : ''}`} />
          {task.subtasks.length > 0 ? `Subtasks ${completedSubtasks}/${task.subtasks.length}` : 'No Subtasks'}
        </div>

        {task.attachments?.length > 0 && (
          <div className="flex items-center text-xs font-medium text-slate-600">
            <Paperclip size={14} className="mr-1.5" />
            {task.attachments.length}
          </div>
        )}
      </div>

      {/* Expanded Subtasks View */}
      {isExpanded && task.subtasks.length > 0 && (
        <div className="mt-4 space-y-2 animate-in slide-in-from-top-2 duration-200 relative">
          {task.subtasks.map(sub => {
            const subAssignee = users.find(u => u.id === sub.assigneeId);

            return (
              <div key={sub.id} className="flex items-center justify-between group/sub bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="flex items-center flex-1 min-w-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); if (isEditable) toggleSubtaskCompletion(sub.id); }}
                    className={`mr-3 flex-shrink-0 transition-colors ${sub.completed ? 'text-green-500' : 'text-slate-300 hover:text-indigo-500'}`}
                    disabled={!isEditable}
                  >
                    {sub.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className={`text-xs font-medium truncate ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                      {sub.title}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${sub.priority === 'high' ? 'bg-red-50 text-red-600 border-red-100' :
                        sub.priority === 'medium' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                          'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                        {sub.priority}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase">{CATEGORY_STYLES[sub.category]?.label || 'Task'}</span>
                    </div>
                  </div>
                </div>

                {/* Right Side Actions: Assign & Edit */}
                <div className="flex items-center space-x-1 relative">
                  {/* Subtask Assignee Reassign Icon */}
                  <div className="relative" ref={assigningSubtaskId === sub.id ? subtaskAssigneeRef : null}>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (isEditable) setAssigningSubtaskId(assigningSubtaskId === sub.id ? null : sub.id); }}
                      className={`p-1 rounded-full transition-colors ${isEditable ? 'hover:bg-slate-200 cursor-pointer' : 'cursor-default'}`}
                      disabled={!isEditable}
                      title={subAssignee ? `Assigned to ${subAssignee.name}` : "Assign Subtask"}
                    >
                      {subAssignee ? (
                        <img src={subAssignee.avatar} className="w-5 h-5 rounded-full object-cover ring-1 ring-white" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600">
                          <UserIcon size={12} />
                        </div>
                      )}
                    </button>

                    {/* Dropdown for Subtask Assignment */}
                    {assigningSubtaskId === sub.id && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 max-h-48 overflow-y-auto flex flex-col p-1 animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50 mb-1">
                          Assign Subtask
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSubtaskAssign(sub.id, undefined); }}
                          className="w-full text-left flex items-center px-2 py-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs text-slate-500 transition-colors"
                        >
                          <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center mr-2 text-slate-400"><X size={12} /></div>
                          <span className="font-medium">Unassigned</span>
                          {!sub.assigneeId && <Check size={12} className="ml-auto" />}
                        </button>
                        {users.map(u => (
                          <button
                            key={u.id}
                            onClick={(e) => { e.stopPropagation(); handleSubtaskAssign(sub.id, u.id); }}
                            className={`w-full text-left flex items-center px-2 py-1.5 hover:bg-slate-50 rounded-lg transition-colors ${sub.assigneeId === u.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}
                          >
                            <img src={u.avatar} className="w-5 h-5 rounded-full object-cover mr-2" />
                            <span className="text-xs font-medium truncate flex-1">{u.name}</span>
                            {sub.assigneeId === u.id && <Check size={12} className="ml-2 text-indigo-600" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); onEditSubtask(task, sub); }}
                    className={`text-slate-400 hover:text-indigo-600 p-1 hover:bg-white rounded transition-colors ${!isEditable && 'cursor-default'}`}
                  >
                    {isEditable ? <Pencil size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- KanbanColumn Component ---
interface ColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  canEdit: boolean;
  users: User[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: TaskStatus, index?: number) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onEditTask: (task: Task) => void;
  onEditSubtask: (task: Task, subtask: SubTask) => void;
  onUpdateTask: (task: Task) => void;
}

const KanbanColumn: React.FC<ColumnProps> = ({
  status, title, tasks, canEdit, users,
  onDragOver, onDrop, onDragStart, onEditTask, onEditSubtask, onUpdateTask
}) => {
  const sortedTasks = [...tasks].sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleTaskDrop = (e: React.DragEvent, targetTaskId: string, position: 'before' | 'after') => {
    const targetIndex = sortedTasks.findIndex(t => t.id === targetTaskId);
    if (targetIndex === -1) return;
    const newIndex = position === 'before' ? targetIndex : targetIndex + 1;
    onDrop(e, status, newIndex);
  };
  return (
    <div
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, status)}
      className="bg-slate-50/50 p-4 rounded-xl min-h-[500px] flex flex-col border border-slate-100 md:h-full"
    >
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-slate-50/50 backdrop-blur-sm p-1 z-10">
        <h3 className="font-bold text-slate-700 flex items-center text-sm uppercase tracking-wide">
          <span className={`w-2.5 h-2.5 rounded-full mr-2.5 shadow-sm ${status === TaskStatus.TODO ? 'bg-slate-400' :
            status === TaskStatus.IN_PROGRESS ? 'bg-blue-500' : 'bg-emerald-500'
            }`}></span>
          {title}
        </h3>
        <span className="text-xs text-slate-500 font-bold px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-sm">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-4 flex-1 overflow-y-auto pr-1 pb-2 custom-scrollbar [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {sortedTasks.map(task => (
          <TaskCardItem
            key={task.id}
            task={task}
            users={users}
            canEdit={canEdit}
            onEditTask={onEditTask}
            onEditSubtask={onEditSubtask}
            onUpdateTask={onUpdateTask}
            onDragStart={onDragStart}
            onDropOnTask={handleTaskDrop}
          />
        ))}
        {tasks.length === 0 && canEdit && (
          <div className="h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 text-sm bg-slate-50/50">
            <Plus size={24} className="mb-2 opacity-50" />
            Drop task here
          </div>
        )}
      </div>
    </div>
  );
};

// --- List View Components ---
interface ListViewProps {
  tasks: Task[];
  users: User[];
  onEditTask: (task: Task) => void;
  visibleColumns: string[];
}

const ListView: React.FC<ListViewProps> = ({ tasks, users, onEditTask, visibleColumns }) => {

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700 w-1/3">Title</th>
              {visibleColumns.includes('status') && <th className="px-6 py-4 font-semibold text-slate-700">Status</th>}
              {visibleColumns.includes('priority') && <th className="px-6 py-4 font-semibold text-slate-700">Priority</th>}
              {visibleColumns.includes('category') && <th className="px-6 py-4 font-semibold text-slate-700">Category</th>}
              {visibleColumns.includes('assignee') && <th className="px-6 py-4 font-semibold text-slate-700">Assignee</th>}
              {visibleColumns.includes('dueDate') && <th className="px-6 py-4 font-semibold text-slate-700">Due Date</th>}
              {visibleColumns.includes('created') && <th className="px-6 py-4 font-semibold text-slate-700 text-right">Created</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map(task => {
              const assignee = users.find(u => u.id === task.assigneeId);
              const categoryConfig = CATEGORY_STYLES[task.category] || CATEGORY_STYLES[TaskCategory.TASK];

              return (
                <tr
                  key={task.id}
                  onClick={() => onEditTask(task)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center">
                      <div className="font-medium text-slate-800">{task.title}</div>
                    </div>
                    {task.subtasks.length > 0 && (
                      <div className="text-xs text-slate-400 mt-1 flex items-center">
                        <CheckSquare size={10} className="mr-1" />
                        {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length} subtasks
                      </div>
                    )}
                  </td>
                  {visibleColumns.includes('status') && (
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${task.status === TaskStatus.TODO ? 'bg-slate-100 text-slate-600 border-slate-200' :
                        task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          'bg-green-50 text-green-700 border-green-100'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${task.status === TaskStatus.TODO ? 'bg-slate-400' :
                          task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-500' :
                            'bg-green-500'
                          }`}></span>
                        {task.status === TaskStatus.TODO ? 'To Do' : task.status === TaskStatus.IN_PROGRESS ? 'In Progress' : 'Done'}
                      </span>
                    </td>
                  )}
                  {visibleColumns.includes('priority') && (
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs capitalize ${task.priority === 'high' ? 'text-red-700 bg-red-50' :
                        task.priority === 'medium' ? 'text-orange-700 bg-orange-50' :
                          'text-slate-600 bg-slate-100'
                        }`}>
                        {task.priority}
                      </span>
                    </td>
                  )}
                  {visibleColumns.includes('category') && (
                    <td className="px-6 py-3">
                      <div className="flex items-center">
                        <span className={`w-6 h-6 rounded flex items-center justify-center mr-2 ${categoryConfig.color.split(' ')[0]} ${categoryConfig.color.split(' ')[1]}`}>
                          <categoryConfig.icon size={14} />
                        </span>
                        <span className="text-slate-600 text-sm">{categoryConfig.label}</span>
                      </div>
                    </td>
                  )}
                  {visibleColumns.includes('assignee') && (
                    <td className="px-6 py-3">
                      {assignee ? (
                        <div className="flex items-center">
                          <img src={assignee.avatar} className="w-6 h-6 rounded-full mr-2 border border-slate-200" />
                          <span className="text-sm text-slate-700">{assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.includes('dueDate') && (
                    <td className="px-6 py-3">
                      {task.dueDate ? (
                        <div className="flex items-center text-slate-600">
                          <Calendar size={14} className="mr-1.5 text-slate-400" />
                          {new Date(task.dueDate).toLocaleDateString()}
                        </div>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                  )}
                  {visibleColumns.includes('created') && (
                    <td className="px-6 py-3 text-right text-slate-500 text-xs font-mono">
                      {new Date(task.createdAt).toLocaleDateString()}
                    </td>
                  )}
                </tr>
              );
            })}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                  No tasks found matching criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Task Editor Component (UPDATED UI) ---
const TaskEditor: React.FC<{
  task: Task | null;
  onClose: () => void;
  projectId: string;
  readOnly: boolean;
}> = ({ task, onClose, projectId, readOnly }) => {
  const { addTask, updateTask, moveTask, users, triggerNotification, currentUser, deleteUser } = useApp();
  const [formData, setFormData] = useState<Task>(task || {
    id: 't-' + Date.now(),
    projectId,
    title: '',
    description: '',
    status: TaskStatus.TODO,
    category: TaskCategory.TASK,
    priority: 'medium',
    subtasks: [],
    attachments: [],
    comments: [],
    createdAt: Date.now()
  });

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  // Local edit subtask state
  const [localEditingSubtask, setLocalEditingSubtask] = useState<SubTask | null>(null);

  // Mentions state
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'comment' | 'attachment' } | null>(null);

  // Title Edit State
  const [isTitleActive, setIsTitleActive] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Description Edit State
  const [isDescriptionActive, setIsDescriptionActive] = useState(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  // Mobile Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'chatter'>('details');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task) {
      updateTask(formData);
    } else {
      addTask(formData);
      if (formData.assigneeId) {
        triggerNotification(
          formData.assigneeId,
          NotificationType.ASSIGNMENT,
          'New Task Assigned',
          `${currentUser?.name} assigned you to "${formData.title}"`,
          formData.id
        );
      }
    }
    onClose();
  };

  const addSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSub: SubTask = {
      id: 'st-' + Date.now(),
      title: newSubtaskTitle,
      completed: false,
      status: TaskStatus.TODO,
      category: TaskCategory.TASK,
      description: '',
      priority: 'medium',
      attachments: [],
      comments: [],
      createdAt: Date.now()
    };
    const updatedSubtasks = [...formData.subtasks, newSub];
    const updatedTask = { ...formData, subtasks: updatedSubtasks };
    setFormData(updatedTask);
    setNewSubtaskTitle('');
  };

  const addComment = () => {
    if (!newComment.trim() || !currentUser) return;
    const comment: Comment = {
      id: Date.now().toString(),
      userId: currentUser.id,
      text: newComment,
      timestamp: Date.now()
    };
    const updatedTask = { ...formData, comments: [...formData.comments, comment] };
    setFormData(updatedTask);
    updateTask(updatedTask); // Auto-save
    setNewComment('');
  };

  const deleteComment = (commentId: string) => {
    const updatedTask = { ...formData, comments: formData.comments.filter(c => c.id !== commentId) };
    setFormData(updatedTask);
    updateTask(updatedTask); // Auto-save
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newAttachments: Attachment[] = [];

      for (const file of files) {
        try {
          const fileName = `${Date.now()}_task_${Math.random().toString(36).substr(2, 5)}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const { error } = await supabase.storage.from('attachments').upload(fileName, file);

          if (error) {
            console.error('Task attachment upload error:', error);
            continue;
          }

          const { data } = supabase.storage.from('attachments').getPublicUrl(fileName);

          newAttachments.push({
            id: Date.now().toString() + Math.random(),
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.type,
            url: data.publicUrl,
            uploadedBy: currentUser?.id
          });
        } catch (err) {
          console.error('Error processing task attachment:', err);
        }
      }

      const updatedTask = { ...formData, attachments: [...formData.attachments, ...newAttachments] };
      setFormData(updatedTask);
      updateTask(updatedTask); // Auto-save
      e.target.value = ''; // Reset
    }
  };

  const removeAttachment = (id: string) => {
    const updatedTask = { ...formData, attachments: formData.attachments.filter(a => a.id !== id) };
    setFormData(updatedTask);
    updateTask(updatedTask); // Auto-save
  };

  // Mention Handlers
  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');

    if (lastAt !== -1 && (lastAt === 0 || textBefore[lastAt - 1] === ' ')) {
      const query = textBefore.slice(lastAt + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (name: string) => {
    const cursor = commentInputRef.current?.selectionStart || newComment.length;
    const textBefore = newComment.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');
    const textAfter = newComment.slice(cursor);
    const newText = textBefore.slice(0, lastAt) + '@' + name + ' ' + textAfter;
    setNewComment(newText);
    setShowMentions(false);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()));

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title="Edit Task" maxWidth="max-w-6xl" className="h-[90vh]" noScroll={true}>
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">

          {/* Universal Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'details' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chatter')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'chatter' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Chatter
            </button>
          </div>

          {/* Scrollable Content Area: Single scroll for entire form except fixed footer */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-0">
            <div className="flex flex-col lg:flex-row min-h-full">

              {/* LEFT COLUMN: Main Content */}
              <div className="flex-1 p-6 md:p-8 bg-white border-r border-slate-100">

                {/* Title */}
                <div className={`mb-6 ${activeTab === 'details' ? 'block' : 'hidden'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Task Title
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!readOnly) {
                          const newState = !isTitleActive;
                          setIsTitleActive(newState);
                          if (newState) setTimeout(() => titleInputRef.current?.focus(), 0);
                        }
                      }}
                      disabled={readOnly}
                      className={`p-1.5 rounded transition-all ${isTitleActive ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
                      title={isTitleActive ? "Disable Editing" : "Enable Editing"}
                    >
                      {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                    </button>
                  </div>
                  <input
                    ref={titleInputRef}
                    required
                    readOnly={readOnly || !isTitleActive}
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className={`w-full text-xl md:text-2xl font-bold rounded-lg px-4 py-3 outline-none transition-all border
                        ${isTitleActive
                        ? 'bg-white border-indigo-200 text-slate-800 shadow-sm ring-2 ring-indigo-50/50'
                        : 'bg-slate-50 border-slate-100 text-slate-700 cursor-default'}`}
                    placeholder="Task Title"
                  />
                </div>

                {/* Description */}
                <div className={`mb-8 ${activeTab === 'details' ? 'block' : 'hidden'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Description
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!readOnly) {
                          const newState = !isDescriptionActive;
                          setIsDescriptionActive(newState);
                          if (newState) setTimeout(() => descriptionInputRef.current?.focus(), 0);
                        }
                      }}
                      disabled={readOnly}
                      className={`p-1.5 rounded transition-all ${isDescriptionActive ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
                      title={isDescriptionActive ? "Disable Editing" : "Enable Editing"}
                    >
                      {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                    </button>
                  </div>
                  <textarea
                    ref={descriptionInputRef}
                    readOnly={readOnly || !isDescriptionActive}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className={`w-full rounded-lg p-4 min-h-[120px] outline-none resize-none transition-all leading-relaxed border
                        ${isDescriptionActive
                        ? 'bg-white border-indigo-200 text-slate-800 shadow-sm ring-2 ring-indigo-50/50'
                        : 'bg-slate-50 border-slate-100 text-slate-500 cursor-default'}`}
                    placeholder={isDescriptionActive ? "Add a detailed description..." : "No description provided."}
                  />
                </div>

                {/* Attachments Section */}
                <div className={`mb-8 ${activeTab === 'chatter' ? 'block' : 'hidden'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setShowAttachments(!showAttachments)} className="flex items-center text-xs font-bold text-slate-500 uppercase hover:text-indigo-600 transition-colors">
                      {showAttachments ? <Minus size={12} className="mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
                      ATTACHMENTS ({formData.attachments.length})
                    </button>
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Upload Attachment"
                      >
                        <Paperclip size={14} />
                      </button>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                    </>
                  </div>

                  {showAttachments && (
                    <div className="space-y-2">
                      {formData.attachments.map(att => (
                        <div key={att.id} className="flex items-center p-2 border border-slate-100 rounded-lg bg-white hover:border-slate-300 transition-colors group">
                          <div className="w-6 h-6 bg-slate-50 rounded border border-slate-100 flex items-center justify-center text-indigo-500 mr-2">
                            <FileText size={12} />
                          </div>
                          <button type="button" onClick={() => att.url && setPreviewAttachment(att)} className="flex-1 min-w-0 text-left hover:text-indigo-600">
                            <p className="text-xs font-medium text-slate-700 truncate">{att.name}</p>
                            <p className="text-[10px] text-slate-400">{att.size}</p>
                          </button>
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                            <a href={att.url} download target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600"><Download size={12} /></a>
                            {(att.uploadedBy === currentUser?.id || currentUser?.role === 'ADMIN') && (
                              <button type="button" onClick={() => setItemToDelete({ id: att.id, type: 'attachment' })} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                      ))}
                      {formData.attachments.length === 0 && <p className="text-xs text-slate-400 italic">No attachments added.</p>}
                    </div>
                  )}
                </div>

                {/* Comments Section */}
                <div className={`mb-8 ${activeTab === 'chatter' ? 'block' : 'hidden'}`}>
                  <label className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Comments ({formData.comments.length})
                  </label>

                  {/* Comment Input - Enabled for everyone */}
                  <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                      <input
                        ref={commentInputRef}
                        type="text"
                        value={newComment}
                        onChange={handleCommentChange}
                        placeholder="Write a comment... (use @ to mention)"
                        className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all"
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addComment())}
                      />
                      <button
                        type="button"
                        onClick={addComment}
                        className="absolute right-2 top-2 text-indigo-500 hover:text-indigo-700 p-1 rounded-md transition-colors"
                      >
                        <Send size={16} />
                      </button>
                      {showMentions && filteredUsers.length > 0 && (
                        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                          {filteredUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => insertMention(u.name)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 border-b border-slate-50 last:border-0"
                            >
                              <img src={u.avatar} className="w-6 h-6 rounded-full" alt={u.name} />
                              <span className="text-sm text-slate-700 font-medium">{u.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comments List */}
                  <div className="space-y-3">
                    {[...formData.comments].reverse().map(c => {
                      const u = users.find(user => user.id === c.userId);
                      return (
                        <div key={c.id} className="group flex items-start space-x-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">
                          <img src={u?.avatar} className="w-8 h-8 rounded-full border border-slate-200 bg-white" alt={u?.name} />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <span className="text-sm font-semibold text-slate-700">{u?.name}</span>
                              <span className="text-[10px] text-slate-400">{new Date(c.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1 break-words leading-relaxed">
                              {renderWithMentions(c.text, users)}
                            </p>
                          </div>
                          {(c.userId === currentUser?.id || currentUser?.role === 'ADMIN') && (
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ id: c.id, type: 'comment' })}
                              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Sidebar Metadata & Lists */}
              <div className={`w-full lg:w-96 bg-slate-50 p-6 border-l border-slate-200 flex flex-col gap-6 ${activeTab === 'details' ? 'flex' : 'hidden'}`}>

                <div className="grid grid-cols-2 gap-4">
                  {/* Status / Completed */}
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">State</label>
                    <select
                      value={formData.status}
                      onChange={e => {
                        const newStatus = e.target.value as TaskStatus;
                        setFormData({ ...formData, status: newStatus });
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value={TaskStatus.TODO}>To Do</option>
                      <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                      <option value={TaskStatus.DONE}>Completed</option>
                    </select>
                  </div>

                  {/* Category */}
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Category</label>
                    <select
                      disabled={readOnly}
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value as TaskCategory })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value={TaskCategory.TASK}>Task</option>
                      <option value={TaskCategory.STORY}>Story</option>
                      <option value={TaskCategory.ISSUE}>Issue</option>
                      <option value={TaskCategory.BUG}>Bug</option>
                    </select>
                  </div>

                  {/* Assignee */}
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Assignee</label>
                    <div className="relative">
                      <select
                        value={formData.assigneeId || ''}
                        onChange={e => setFormData({ ...formData, assigneeId: e.target.value || undefined })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 pl-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Priority</label>
                    <select
                      disabled={readOnly}
                      value={formData.priority}
                      onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  {/* Due Date */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Due Date</label>
                    <input
                      readOnly={readOnly}
                      type="date"
                      value={formData.dueDate || ''}
                      onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* Subtasks Section */}
                <div className="col-span-2 border-t border-slate-200/60 pt-4 pb-2">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setShowSubtasks(!showSubtasks)} className="flex items-center text-xs font-bold text-slate-500 uppercase hover:text-indigo-600 transition-colors">
                      {showSubtasks ? <Minus size={12} className="mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
                      SUBTASKS ({formData.subtasks.length})
                    </button>
                  </div>

                  {showSubtasks && (
                    <div className="space-y-3 animate-in slide-in-from-top-2 duration-200 mb-4">
                      {!readOnly && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={newSubtaskTitle}
                            onChange={e => setNewSubtaskTitle(e.target.value)}
                            placeholder="New subtask..."
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
                          />
                          <button
                            type="button"
                            onClick={addSubtask}
                            disabled={!newSubtaskTitle.trim()}
                            className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      )}

                      <div className="space-y-2">
                        {formData.subtasks.map(sub => (
                          <div key={sub.id} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg hover:border-indigo-300 transition-colors group">
                            <div className="flex items-center flex-1 min-w-0 mr-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedSubtasks = formData.subtasks.map(s => s.id === sub.id ? { ...s, completed: !s.completed, status: !s.completed ? TaskStatus.DONE : TaskStatus.TODO } : s);
                                  const updatedTask = { ...formData, subtasks: updatedSubtasks };
                                  setFormData(updatedTask);
                                }}
                                className={`mr-2 flex-shrink-0 ${sub.completed ? 'text-green-500' : 'text-slate-300 hover:text-indigo-500'}`}
                              >
                                {sub.completed ? <CheckSquare size={16} /> : <Square size={16} />}
                              </button>
                              <span className={`text-sm truncate ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{sub.title}</span>
                            </div>

                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => setLocalEditingSubtask(sub)}
                                className="p-1 text-slate-400 hover:text-indigo-600"
                                title={readOnly ? "View Subtask" : "Edit Subtask"}
                              >
                                {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                              </button>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedTask = { ...formData, subtasks: formData.subtasks.filter(s => s.id !== sub.id) };
                                    setFormData(updatedTask);
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="p-3 bg-white border-t border-slate-200 flex justify-end space-x-3 shrink-0 z-20">
            <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-8 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-200 transition-all transform hover:scale-[1.02] active:scale-[0.98]">Save Task</button>
          </div>

        </form>

        {/* Local Subtask Editor Modal */}
        {
          localEditingSubtask && (
            <SubtaskEditor
              task={formData}
              subtask={localEditingSubtask!}
              onClose={() => setLocalEditingSubtask(null)}
              readOnly={readOnly}
              onUpdate={(updatedSub) => {
                const updatedTask = {
                  ...formData,
                  subtasks: formData.subtasks.map(s => s.id === updatedSub.id ? updatedSub : s)
                };
                setFormData(updatedTask);
                setLocalEditingSubtask(null);
              }}
              onInstantUpdate={(updatedSub) => {
                const updatedTask = {
                  ...formData,
                  subtasks: formData.subtasks.map(s => s.id === updatedSub.id ? updatedSub : s)
                };
                setFormData(updatedTask);
                updateTask(updatedTask);
              }}
            />
          )
        }

        {
          previewAttachment && (
            <Modal
              isOpen={!!previewAttachment}
              onClose={() => setPreviewAttachment(null)}
              title={previewAttachment!.name}
              maxWidth="max-w-4xl"
              className="h-[80vh]"
            >
              <div className="w-full h-full flex items-center justify-center bg-slate-50">
                {previewAttachment!.type.startsWith('image/') ? (
                  <img src={previewAttachment!.url} alt={previewAttachment!.name} className="max-w-full max-h-full object-contain" />
                ) : previewAttachment!.type.startsWith('video/') ? (
                  <video src={previewAttachment!.url} controls className="max-w-full max-h-full" />
                ) : previewAttachment!.type.startsWith('audio/') ? (
                  <audio src={previewAttachment!.url} controls />
                ) : (
                  <iframe
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(previewAttachment!.url || '')}&embedded=true`}
                    className="w-full h-full border-none"
                    title="Document Preview"
                  />
                )}
              </div>
            </Modal>
          )
        }
      </Modal>
      <Modal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title={`Confirm ${itemToDelete?.type === 'comment' ? 'Comment' : 'Attachment'} Deletion`}
        maxWidth="max-w-md"
        className="h-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4 mx-auto">
            <AlertTriangle size={24} />
          </div>
          <p className="text-center text-slate-600 mb-6">
            Are you sure you want to delete this {itemToDelete?.type}? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setItemToDelete(null)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (itemToDelete) {
                  if (itemToDelete.type === 'comment') {
                    deleteComment(itemToDelete.id);
                  } else {
                    removeAttachment(itemToDelete.id);
                  }
                  setItemToDelete(null);
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-md shadow-red-200 transition-colors"
            >
              Delete {itemToDelete?.type === 'comment' ? 'Comment' : 'Attachment'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

// --- Subtask Editor Component ---
const SubtaskEditor: React.FC<{
  task: Task;
  subtask: SubTask;
  onClose: () => void;
  readOnly: boolean;
  onUpdate?: (subtask: SubTask) => void;
  onInstantUpdate?: (subtask: SubTask) => void;
}> = ({ task, subtask, onClose, readOnly, onUpdate, onInstantUpdate }) => {
  const { updateTask, users, currentUser } = useApp();
  const [formData, setFormData] = useState<SubTask>(subtask);
  const [newComment, setNewComment] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  // Mentions state
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string, type: 'comment' | 'attachment' } | null>(null);

  // Title Edit State
  const [isTitleActive, setIsTitleActive] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Description Edit State
  const [isDescriptionActive, setIsDescriptionActive] = useState(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  // Mobile Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'chatter'>('details');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdate) {
      onUpdate(formData);
    } else {
      const updatedSubtasks = task.subtasks.map(s => s.id === formData.id ? formData : s);
      updateTask({ ...task, subtasks: updatedSubtasks });
    }
    onClose();
  };

  const handleAutoSave = (updatedSub: SubTask) => {
    setFormData(updatedSub);
    if (onInstantUpdate) {
      onInstantUpdate(updatedSub);
    } else {
      const updatedSubtasks = task.subtasks.map(s => s.id === updatedSub.id ? updatedSub : s);
      updateTask({ ...task, subtasks: updatedSubtasks });
    }
  };

  const addComment = () => {
    if (!newComment.trim() || !currentUser) return;
    const comment: Comment = {
      id: Date.now().toString(),
      userId: currentUser.id,
      text: newComment,
      timestamp: Date.now()
    };
    handleAutoSave({ ...formData, comments: [...formData.comments, comment] });
    setNewComment('');
  };

  const deleteComment = (commentId: string) => {
    handleAutoSave({ ...formData, comments: formData.comments.filter(c => c.id !== commentId) });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newAttachments: Attachment[] = [];

      for (const file of files) {
        try {
          const fileName = `${Date.now()}_subtask_${Math.random().toString(36).substr(2, 5)}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const { error } = await supabase.storage.from('attachments').upload(fileName, file);

          if (error) {
            console.error('Subtask attachment upload error:', error);
            continue;
          }

          const { data } = supabase.storage.from('attachments').getPublicUrl(fileName);

          newAttachments.push({
            id: Date.now().toString() + Math.random(),
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.type,
            url: data.publicUrl,
            uploadedBy: currentUser?.id
          });
        } catch (err) {
          console.error('Error processing subtask attachment:', err);
        }
      }

      handleAutoSave({ ...formData, attachments: [...formData.attachments, ...newAttachments] });
      e.target.value = ''; // Reset
    }
  };

  const removeAttachment = (id: string) => {
    handleAutoSave({ ...formData, attachments: formData.attachments.filter(a => a.id !== id) });
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewComment(val);
    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');

    if (lastAt !== -1 && (lastAt === 0 || textBefore[lastAt - 1] === ' ')) {
      const query = textBefore.slice(lastAt + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (name: string) => {
    const cursor = commentInputRef.current?.selectionStart || newComment.length;
    const textBefore = newComment.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');
    const textAfter = newComment.slice(cursor);
    const newText = textBefore.slice(0, lastAt) + '@' + name + ' ' + textAfter;
    setNewComment(newText);
    setShowMentions(false);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()));

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title="Edit Subtask" maxWidth="max-w-6xl" className="h-[90vh]" noScroll={true}>
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">

          {/* Universal Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'details' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('chatter')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'chatter' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Chatter
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-0">
            <div className="flex flex-col lg:flex-row min-h-full">

              {/* LEFT COLUMN */}
              <div className="flex-1 p-6 md:p-8 bg-white border-r border-slate-100">
                <div className={`mb-2 text-sm text-slate-500 flex items-center ${activeTab === 'details' ? 'flex' : 'hidden'}`}>
                  <span className="font-semibold mr-2">Parent Task:</span> {task.title}
                </div>

                <div className={`mb-6 ${activeTab === 'details' ? 'block' : 'hidden'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Subtask Title
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!readOnly) {
                          const newState = !isTitleActive;
                          setIsTitleActive(newState);
                          if (newState) setTimeout(() => titleInputRef.current?.focus(), 0);
                        }
                      }}
                      disabled={readOnly}
                      className={`p-1.5 rounded transition-all ${isTitleActive ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
                      title={isTitleActive ? "Disable Editing" : "Enable Editing"}
                    >
                      {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                    </button>
                  </div>
                  <input
                    ref={titleInputRef}
                    required
                    readOnly={readOnly || !isTitleActive}
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className={`w-full text-xl md:text-2xl font-bold rounded-lg px-4 py-3 outline-none transition-all border
                        ${isTitleActive
                        ? 'bg-white border-indigo-200 text-slate-800 shadow-sm ring-2 ring-indigo-50/50'
                        : 'bg-slate-50 border-slate-100 text-slate-700 cursor-default'}`}
                    placeholder="Subtask Title"
                  />
                </div>

                <div className={`mb-8 ${activeTab === 'details' ? 'block' : 'hidden'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Description
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!readOnly) {
                          const newState = !isDescriptionActive;
                          setIsDescriptionActive(newState);
                          if (newState) setTimeout(() => descriptionInputRef.current?.focus(), 0);
                        }
                      }}
                      disabled={readOnly}
                      className={`p-1.5 rounded transition-all ${isDescriptionActive ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
                      title={isDescriptionActive ? "Disable Editing" : "Enable Editing"}
                    >
                      {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
                    </button>
                  </div>
                  <textarea
                    ref={descriptionInputRef}
                    readOnly={readOnly || !isDescriptionActive}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className={`w-full rounded-lg p-4 min-h-[120px] outline-none resize-none transition-all leading-relaxed border
                        ${isDescriptionActive
                        ? 'bg-white border-indigo-200 text-slate-800 shadow-sm ring-2 ring-indigo-50/50'
                        : 'bg-slate-50 border-slate-100 text-slate-500 cursor-default'}`}
                    placeholder={isDescriptionActive ? "Add a detailed description..." : "No description provided."}
                  />
                </div>



                {/* Attachments Section */}
                <div className={`mb-8 ${activeTab === 'chatter' ? 'block' : 'hidden'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setShowAttachments(!showAttachments)} className="flex items-center text-xs font-bold text-slate-500 uppercase hover:text-indigo-600 transition-colors">
                      {showAttachments ? <Minus size={12} className="mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
                      ATTACHMENTS ({formData.attachments.length})
                    </button>
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Upload Attachment"
                      >
                        <Paperclip size={14} />
                      </button>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                    </>
                  </div>

                  {showAttachments && (
                    <div className="space-y-2">
                      {formData.attachments.map(att => (
                        <div key={att.id} className="flex items-center p-2 border border-slate-100 rounded-lg bg-white hover:border-slate-300 transition-colors group">
                          <div className="w-6 h-6 bg-slate-50 rounded border border-slate-100 flex items-center justify-center text-indigo-500 mr-2">
                            <FileText size={12} />
                          </div>
                          <button type="button" onClick={() => att.url && setPreviewAttachment(att)} className="flex-1 min-w-0 text-left hover:text-indigo-600">
                            <p className="text-xs font-medium text-slate-700 truncate">{att.name}</p>
                            <p className="text-[10px] text-slate-400">{att.size}</p>
                          </button>
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                            <a href={att.url} download target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-600"><Download size={12} /></a>
                            {(att.uploadedBy === currentUser?.id || currentUser?.role === 'ADMIN') && (
                              <button type="button" onClick={() => setItemToDelete({ id: att.id, type: 'attachment' })} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                      ))}
                      {formData.attachments.length === 0 && <p className="text-xs text-slate-400 italic">No attachments added.</p>}
                    </div>
                  )}
                </div>

                {/* Comments Section */}
                <div className={`mb-8 ${activeTab === 'chatter' ? 'block' : 'hidden'}`}>
                  <label className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Comments ({formData.comments.length})
                  </label>

                  <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                      <input
                        ref={commentInputRef}
                        type="text"
                        value={newComment}
                        onChange={handleCommentChange}
                        placeholder="Write a comment... (use @ to mention)"
                        className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all"
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addComment())}
                      />
                      <button
                        type="button"
                        onClick={addComment}
                        className="absolute right-2 top-2 text-indigo-500 hover:text-indigo-700 p-1 rounded-md transition-colors"
                      >
                        <Send size={16} />
                      </button>
                      {showMentions && filteredUsers.length > 0 && (
                        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                          {filteredUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => insertMention(u.name)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center space-x-2 border-b border-slate-50 last:border-0"
                            >
                              <img src={u.avatar} className="w-6 h-6 rounded-full" alt={u.name} />
                              <span className="text-sm text-slate-700 font-medium">{u.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[...formData.comments].reverse().map(c => {
                      const u = users.find(user => user.id === c.userId);
                      return (
                        <div key={c.id} className="group flex items-start space-x-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">
                          <img src={u?.avatar} className="w-8 h-8 rounded-full border border-slate-200 bg-white" alt={u?.name} />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <span className="text-sm font-semibold text-slate-700">{u?.name}</span>
                              <span className="text-[10px] text-slate-400">{new Date(c.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1 break-words leading-relaxed">
                              {renderWithMentions(c.text, users)}
                            </p>
                          </div>
                          {(c.userId === currentUser?.id || currentUser?.role === 'ADMIN') && (
                            <button
                              type="button"
                              onClick={() => setItemToDelete({ id: c.id, type: 'comment' })}
                              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className={`w-full lg:w-96 bg-slate-50 p-6 border-l border-slate-200 flex flex-col gap-6 ${activeTab === 'details' ? 'flex' : 'hidden'}`}>

                <div className="grid grid-cols-2 gap-4">
                  {/* Status / Completed */}
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">State</label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, completed: !formData.completed, status: !formData.completed ? TaskStatus.DONE : TaskStatus.TODO })}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-all ${formData.completed
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'
                        }`}
                    >
                      <span>{formData.completed ? 'Completed' : 'Incomplete'}</span>
                      {formData.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </button>
                  </div>

                  {/* Category (Subtask category typically matches parent but can differ) */}
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Category</label>
                    <select
                      disabled={readOnly}
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value as TaskCategory })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value={TaskCategory.TASK}>Task</option>
                      <option value={TaskCategory.STORY}>Story</option>
                      <option value={TaskCategory.ISSUE}>Issue</option>
                      <option value={TaskCategory.BUG}>Bug</option>
                    </select>
                  </div>

                  {/* Assignee */}
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Assignee</label>
                    <div className="relative">
                      <select
                        value={formData.assigneeId || ''}
                        onChange={e => setFormData({ ...formData, assigneeId: e.target.value || undefined })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 pl-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Priority</label>
                    <select
                      disabled={readOnly}
                      value={formData.priority}
                      onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  {/* Due Date (If exists on Subtask, adding it just in case as type definition has it) */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Due Date</label>
                    <input
                      readOnly={readOnly}
                      type="date"
                      value={formData.dueDate || ''}
                      onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="p-3 bg-white border-t border-slate-200 flex justify-end space-x-3 shrink-0 z-20">
            <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-8 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-200 transition-all transform hover:scale-[1.02] active:scale-[0.98]">Save Subtask</button>
          </div>
        </form>

        {previewAttachment && (
          <Modal
            isOpen={!!previewAttachment}
            onClose={() => setPreviewAttachment(null)}
            title={previewAttachment!.name}
            maxWidth="max-w-4xl"
            className="h-[80vh]"
          >
            <div className="w-full h-full flex items-center justify-center bg-slate-50">
              {previewAttachment!.type.startsWith('image/') ? (
                <img src={previewAttachment!.url} alt={previewAttachment!.name} className="max-w-full max-h-full object-contain" />
              ) : previewAttachment!.type.startsWith('video/') ? (
                <video src={previewAttachment!.url} controls className="max-w-full max-h-full" />
              ) : previewAttachment!.type.startsWith('audio/') ? (
                <audio src={previewAttachment!.url} controls />
              ) : (
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(previewAttachment!.url || '')}&embedded=true`}
                  className="w-full h-full border-none"
                  title="Document Preview"
                />
              )}
            </div>
          </Modal>
        )}
      </Modal>
      <Modal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        title={`Confirm ${itemToDelete?.type === 'comment' ? 'Comment' : 'Attachment'} Deletion`}
        maxWidth="max-w-md"
        className="h-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4 mx-auto">
            <AlertTriangle size={24} />
          </div>
          <p className="text-center text-slate-600 mb-6">
            Are you sure you want to delete this {itemToDelete?.type}? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setItemToDelete(null)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (itemToDelete) {
                  if (itemToDelete.type === 'comment') {
                    deleteComment(itemToDelete.id);
                  } else {
                    removeAttachment(itemToDelete.id);
                  }
                  setItemToDelete(null);
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-md shadow-red-200 transition-colors"
            >
              Delete {itemToDelete?.type === 'comment' ? 'Comment' : 'Attachment'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export const KanbanBoard: React.FC = () => {
  const { tasks, users, updateTask, moveTask, currentUser, projects } = useApp();
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchTerm, setSearchTerm] = useState('');

  // Filters
  const [filterCategory, setFilterCategory] = useState<TaskCategory | 'all'>('all');
  const [filterProject, setFilterProject] = useState<string | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<string | 'all'>('all');
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>(TaskStatus.TODO);

  // Modal State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Subtask Modal State
  const [editingSubtaskData, setEditingSubtaskData] = useState<{ task: Task, subtask: SubTask } | null>(null);

  // Drag State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus, newIndex?: number) => {
    e.preventDefault();
    if (draggedTaskId) {
      moveTask(draggedTaskId, status, newIndex);
      setDraggedTaskId(null);
    }
  };

  const filteredTasks = tasks.filter(t => {
    // Permission Check
    if (currentUser?.role !== 'ADMIN') {
      const accessLevel = currentUser?.projectAccess?.[t.projectId] || 'none';
      if (accessLevel === 'none') return false;
    }

    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
    const matchesProject = filterProject === 'all' || t.projectId === filterProject;

    let matchesAssignee = true;
    if (filterAssignee === 'me') matchesAssignee = t.assigneeId === currentUser?.id;
    else if (filterAssignee === 'unassigned') matchesAssignee = !t.assigneeId;
    else if (filterAssignee !== 'all') matchesAssignee = t.assigneeId === filterAssignee;

    return matchesSearch && matchesCategory && matchesProject && matchesAssignee;
  });

  const todoTasks = filteredTasks.filter(t => t.status === TaskStatus.TODO);
  const inProgressTasks = filteredTasks.filter(t => t.status === TaskStatus.IN_PROGRESS);
  const doneTasks = filteredTasks.filter(t => t.status === TaskStatus.DONE);

  const canEdit = !!currentUser; // Assuming all logged in users can edit for now based on role logic in store/types

  const openNewTaskModal = () => {
    setEditingTask(null);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const openEditSubtaskModal = (task: Task, subtask: SubTask) => {
    setEditingSubtaskData({ task, subtask });
  };

  return (
    <div className="flex flex-col h-full p-4 md:p-6 pb-4 md:pb-6">
      {/* Header Controls */}
      <div className="flex flex-col space-y-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Projects Board</h1>
            <p className="text-slate-500 text-sm">Manage tasks and track progress</p>
          </div>
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
              <button
                onClick={() => setViewMode('board')}
                className={`p-2 rounded-md transition-all ${viewMode === 'board' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <List size={18} />
              </button>
            </div>
            <button
              onClick={openNewTaskModal}
              className="flex-1 md:flex-none flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg transition-colors font-medium shadow-sm shadow-indigo-200"
            >
              <Plus size={18} className="mr-2" /> New Task
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 w-full md:flex md:w-auto md:items-center md:space-x-2 shrink-0">
            <SlidersHorizontal size={16} className="text-slate-400 ml-2 mr-1 hidden md:block" />

            {/* Compute Visible Projects */}
            <select
              value={filterProject}
              onChange={e => setFilterProject(e.target.value)}
              className="w-full md:w-auto px-2 py-1.5 md:px-3 md:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:bg-slate-100"
            >
              <option value="all">All Projects</option>
              {projects
                .filter(p => currentUser?.role === 'ADMIN' || (currentUser?.projectAccess?.[p.id] && currentUser.projectAccess[p.id] !== 'none'))
                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as any)}
              className="w-full md:w-auto px-2 py-1.5 md:px-3 md:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:bg-slate-100"
            >
              <option value="all">All Categories</option>
              {Object.values(TaskCategory).map(c => <option key={c} value={c}>{CATEGORY_STYLES[c].label}</option>)}
            </select>

            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="w-full md:w-auto px-2 py-1.5 md:px-3 md:py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:bg-slate-100 md:max-w-[150px]"
            >
              <option value="all">All Assignees</option>
              <option value="me">Assigned to Me</option>
              <option value="unassigned">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {/* Mobile Status Tabs */}
      <div className="flex md:hidden space-x-1 mb-4 bg-slate-100 p-1 rounded-lg shrink-0">
        {[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE].map(status => (
          <button
            key={status}
            onClick={() => setMobileStatus(status)}
            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all uppercase ${mobileStatus === status
              ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            {status === TaskStatus.TODO ? 'To Do' : status === TaskStatus.IN_PROGRESS ? 'In Progress' : 'Done'}
          </button>
        ))}
      </div>

      {viewMode === 'board' ? (
        <div className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden custom-scrollbar">
          <div className="flex flex-col md:flex-row md:h-full gap-6">
            <div className={`flex-1 min-w-[300px] md:h-full ${mobileStatus === TaskStatus.TODO ? 'block' : 'hidden md:block'}`}>
              <KanbanColumn
                status={TaskStatus.TODO}
                title="To Do"
                tasks={todoTasks}
                canEdit={canEdit}
                users={users}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onEditTask={openEditTaskModal}
                onEditSubtask={openEditSubtaskModal}
                onUpdateTask={updateTask}
              />
            </div>
            <div className={`flex-1 min-w-[300px] md:h-full ${mobileStatus === TaskStatus.IN_PROGRESS ? 'block' : 'hidden md:block'}`}>
              <KanbanColumn
                status={TaskStatus.IN_PROGRESS}
                title="In Progress"
                tasks={inProgressTasks}
                canEdit={canEdit}
                users={users}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onEditTask={openEditTaskModal}
                onEditSubtask={openEditSubtaskModal}
                onUpdateTask={updateTask}
              />
            </div>
            <div className={`flex-1 min-w-[300px] md:h-full ${mobileStatus === TaskStatus.DONE ? 'block' : 'hidden md:block'}`}>
              <KanbanColumn
                status={TaskStatus.DONE}
                title="Done"
                tasks={doneTasks}
                canEdit={canEdit}
                users={users}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onEditTask={openEditTaskModal}
                onEditSubtask={openEditSubtaskModal}
                onUpdateTask={updateTask}
              />
            </div>
          </div>
        </div>
      ) : (
        <ListView
          tasks={filteredTasks}
          users={users}
          onEditTask={openEditTaskModal}
          visibleColumns={['status', 'priority', 'category', 'assignee', 'dueDate', 'created']}
        />
      )}

      {/* Task Modal */}
      {isTaskModalOpen && (
        <TaskEditor
          task={editingTask}
          onClose={() => setIsTaskModalOpen(false)}
          projectId={editingTask?.projectId || (filterProject !== 'all' ? filterProject : projects[0]?.id || '')}
          readOnly={!canEdit || (editingTask && (currentUser?.role !== 'ADMIN' && currentUser?.projectAccess?.[editingTask.projectId] !== 'write')) || (!editingTask && currentUser?.role !== 'ADMIN' && currentUser?.projectAccess?.[(filterProject !== 'all' ? filterProject : projects[0]?.id || '')] !== 'write')}
        />
      )}

      {/* Subtask Modal */}
      {editingSubtaskData && (
        <SubtaskEditor
          task={editingSubtaskData.task}
          subtask={editingSubtaskData.subtask}
          onClose={() => setEditingSubtaskData(null)}
          readOnly={!canEdit || (currentUser?.role !== 'ADMIN' && currentUser?.projectAccess?.[editingSubtaskData.task.projectId] !== 'write')}
        />
      )}
    </div>
  );
};