import React, { useState, useEffect } from 'react';
import { useApp } from '../store';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  CheckCircle2, Circle, Clock, ListTodo, Plus, Trash2,
  Layout, BarChart3, PieChart as PieChartIcon, X, AlertTriangle, Bug, BookOpen, User as UserIcon, Check
} from 'lucide-react';
import { TaskStatus, TaskCategory, DashboardWidget, WidgetType, ChartType, GroupBy, ColorTheme, WidgetFilter } from '../types';
import { Modal } from '../components/Modal';

const COLORS = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  orange: '#f97316',
  purple: '#a855f7',
  indigo: '#6366f1',
  slate: '#64748b'
};

const THEME_CLASSES: Record<ColorTheme, { bg: string, text: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  green: { bg: 'bg-green-50', text: 'text-green-600' },
  red: { bg: 'bg-red-50', text: 'text-red-600' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  slate: { bg: 'bg-slate-50', text: 'text-slate-600' }
};

const ICON_MAP: Record<string, React.ElementType> = {
  'list': ListTodo,
  'clock': Clock,
  'check': CheckCircle2,
  'circle': Circle,
  'alert': AlertTriangle,
  'bug': Bug,
  'book': BookOpen,
  'user': UserIcon
};

// --- Default Configuration ---
const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'w1', type: 'card', title: 'Total Tasks', icon: 'list', colorTheme: 'indigo', filter: { status: 'all', priority: 'all', category: 'all' } },
  { id: 'w2', type: 'card', title: 'In Progress', icon: 'clock', colorTheme: 'blue', filter: { status: TaskStatus.IN_PROGRESS, priority: 'all', category: 'all' } },
  { id: 'w3', type: 'card', title: 'Completed', icon: 'check', colorTheme: 'green', filter: { status: TaskStatus.DONE, priority: 'all', category: 'all' } },
  { id: 'w4', type: 'card', title: 'Pending', icon: 'circle', colorTheme: 'slate', filter: { status: TaskStatus.TODO, priority: 'all', category: 'all' } },
  { id: 'w5', type: 'chart', title: 'Task Status Distribution', chartType: 'pie', groupBy: 'status' },
  { id: 'w6', type: 'chart', title: 'Tasks by Priority', chartType: 'bar', groupBy: 'priority' },
];

export const Dashboard: React.FC = () => {
  const { tasks, currentUser, users, updateUser } = useApp();

  // State initialization from current user config or defaults
  const [widgets, setWidgets] = useState<DashboardWidget[]>(
    currentUser?.dashboardConfig || DEFAULT_WIDGETS
  );

  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Widget Form State
  const [newWidgetType, setNewWidgetType] = useState<WidgetType>('card');
  const [newWidgetTitle, setNewWidgetTitle] = useState('');

  // Card Form
  const [newWidgetIcon, setNewWidgetIcon] = useState('list');
  const [newWidgetTheme, setNewWidgetTheme] = useState<ColorTheme>('blue');
  const [newWidgetFilter, setNewWidgetFilter] = useState<WidgetFilter>({ status: 'all', priority: 'all', category: 'all' });

  // Chart Form
  const [newChartType, setNewChartType] = useState<ChartType>('pie');
  const [newChartGroup, setNewChartGroup] = useState<GroupBy>('status');

  // Sync with DB if user updates come in
  useEffect(() => {
    if (currentUser?.dashboardConfig) {
      // Only update if different to avoid potential loops, though strict equality check on objects implies we trust the DB source
      if (JSON.stringify(currentUser.dashboardConfig) !== JSON.stringify(widgets)) {
        setWidgets(currentUser.dashboardConfig);
      }
    }
  }, [currentUser?.dashboardConfig]);

  // Helper to persist changes
  const saveWidgets = (newWidgets: DashboardWidget[]) => {
    setWidgets(newWidgets);
    if (currentUser) {
      updateUser({ ...currentUser, dashboardConfig: newWidgets });
    }
  };

  // --- Logic Helpers ---

  const calculateCardValue = (filter: WidgetFilter | undefined) => {
    if (!filter) return 0;
    return tasks.filter(t => {
      // Permission Check
      if (currentUser?.role !== 'ADMIN') {
        const accessLevel = currentUser?.projectAccess?.[t.projectId] || 'none';
        if (accessLevel === 'none') return false;
      }

      if (filter.status !== 'all' && t.status !== filter.status) return false;
      if (filter.priority !== 'all' && t.priority !== filter.priority) return false;
      if (filter.category !== 'all' && t.category !== filter.category) return false;
      return true;
    }).length;
  };

  const calculateChartData = (groupBy: GroupBy | undefined) => {
    if (!groupBy) return [];
    const counts: Record<string, number> = {};

    tasks.forEach(t => {
      // Permission Check
      if (currentUser?.role !== 'ADMIN') {
        const accessLevel = currentUser?.projectAccess?.[t.projectId] || 'none';
        if (accessLevel === 'none') return;
      }

      let key = 'Unknown';
      if (groupBy === 'status') {
        key = t.status === TaskStatus.TODO ? 'To Do' : t.status === TaskStatus.IN_PROGRESS ? 'In Progress' : 'Done';
      } else if (groupBy === 'priority') {
        key = t.priority.charAt(0).toUpperCase() + t.priority.slice(1);
      } else if (groupBy === 'category') {
        key = t.category;
      } else if (groupBy === 'assignee') {
        const u = users.find(u => u.id === t.assigneeId);
        key = u ? u.name.split(' ')[0] : 'Unassigned';
      }
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.keys(counts).map(k => ({
      name: k,
      value: counts[k],
      // Assign specific colors for common keys if pie chart
      color: k === 'To Do' ? COLORS.slate :
        k === 'In Progress' ? COLORS.blue :
          k === 'Done' ? COLORS.green :
            k === 'High' ? COLORS.red :
              k === 'Medium' ? COLORS.orange :
                k === 'Low' ? COLORS.blue :
                  // Random fallback from palette
                  Object.values(COLORS)[Math.floor(Math.random() * Object.values(COLORS).length)]
    }));
  };

  const handleAddWidget = () => {
    const newId = 'w-' + Date.now();
    const widget: DashboardWidget = {
      id: newId,
      type: newWidgetType,
      title: newWidgetTitle || (newWidgetType === 'card' ? 'New Metric' : 'New Chart'),
    };

    if (newWidgetType === 'card') {
      widget.icon = newWidgetIcon;
      widget.colorTheme = newWidgetTheme;
      widget.filter = newWidgetFilter;
    } else {
      widget.chartType = newChartType;
      widget.groupBy = newChartGroup;
    }

    const updatedWidgets = [...widgets, widget];
    saveWidgets(updatedWidgets);
    setIsAddModalOpen(false);
    resetForm();
  };

  const removeWidget = (id: string) => {
    const updatedWidgets = widgets.filter(w => w.id !== id);
    saveWidgets(updatedWidgets);
  };

  const resetDefaults = () => {
    saveWidgets(DEFAULT_WIDGETS);
  };

  const resetForm = () => {
    setNewWidgetTitle('');
    setNewWidgetFilter({ status: 'all', priority: 'all', category: 'all' });
  };

  const cards = widgets.filter(w => w.type === 'card');
  const charts = widgets.filter(w => w.type === 'chart');

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500 pb-24 md:pb-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <div className="text-sm text-slate-500">Welcome back, {currentUser?.name}</div>
        </div>
        <div className="flex items-center space-x-3">
          {isEditMode ? (
            <>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm text-sm font-medium"
              >
                <Plus size={16} className="mr-2" /> Add Widget
              </button>
              <button
                onClick={resetDefaults}
                className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-sm font-medium"
              >
                Reset Default
              </button>
              <button
                onClick={() => setIsEditMode(false)}
                className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm text-sm font-medium"
              >
                <CheckCircle2 size={16} className="mr-2" /> Done
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditMode(true)}
              className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 rounded-lg transition-colors shadow-sm text-sm font-medium"
            >
              <Layout size={16} className="mr-2" /> Customize Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(widget => {
          const Icon = ICON_MAP[widget.icon || 'list'];
          const theme = THEME_CLASSES[widget.colorTheme || 'blue'];
          return (
            <div key={widget.id} className="relative group animate-in zoom-in-95 duration-300">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4 h-full hover:shadow-md transition-shadow">
                <div className={`p-3 rounded-lg ${theme.bg} ${theme.text}`}>
                  <Icon size={24} />
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium">{widget.title}</p>
                  <h3 className="text-2xl font-bold text-slate-800">{calculateCardValue(widget.filter)}</h3>
                </div>
              </div>
              {isEditMode && (
                <button
                  onClick={() => removeWidget(widget.id)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:scale-110 transition-transform"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}

        {isEditMode && (
          <button
            onClick={() => { setNewWidgetType('card'); setIsAddModalOpen(true); }}
            className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all min-h-[100px]"
          >
            <Plus size={24} className="mb-2" />
            <span className="text-sm font-medium">Add Metric</span>
          </button>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {charts.map(widget => {
          const data = calculateChartData(widget.groupBy);
          return (
            <div key={widget.id} className="relative group bg-white p-6 rounded-xl shadow-sm border border-slate-100 animate-in slide-in-from-bottom-2 duration-500">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">{widget.title}</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  {widget.chartType === 'pie' ? (
                    <PieChart>
                      <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS.blue} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  ) : (
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                      <YAxis axisLine={false} tickLine={false} fontSize={12} allowDecimals={false} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="value" fill={COLORS.indigo} radius={[4, 4, 0, 0]} barSize={40}>
                        {data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || COLORS.indigo} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
              {isEditMode && (
                <button
                  onClick={() => removeWidget(widget.id)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg hover:scale-110 transition-transform"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}

        {isEditMode && (
          <button
            onClick={() => { setNewWidgetType('chart'); setIsAddModalOpen(true); }}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all min-h-[300px]"
          >
            <BarChart3 size={48} className="mb-4 opacity-50" />
            <span className="text-lg font-medium">Add Chart</span>
          </button>
        )}
      </div>

      {/* Add Widget Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Dashboard Widget"
      >
        <div className="space-y-6">
          {/* Widget Type Selection */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setNewWidgetType('card')}
              className={`p-4 rounded-xl border-2 flex flex-col items-center transition-all ${newWidgetType === 'card' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:border-slate-300'}`}
            >
              <Layout size={32} className="mb-2" />
              <span className="font-semibold text-sm">Metric Card</span>
            </button>
            <button
              onClick={() => setNewWidgetType('chart')}
              className={`p-4 rounded-xl border-2 flex flex-col items-center transition-all ${newWidgetType === 'chart' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:border-slate-300'}`}
            >
              <BarChart3 size={32} className="mb-2" />
              <span className="font-semibold text-sm">Chart</span>
            </button>
          </div>

          {/* Common Fields */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Widget Title</label>
            <input
              type="text"
              value={newWidgetTitle}
              onChange={e => setNewWidgetTitle(e.target.value)}
              placeholder={newWidgetType === 'card' ? 'e.g. Critical Bugs' : 'e.g. Workload by Assignee'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {newWidgetType === 'card' ? (
            // Card Specific Options
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color Theme</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(COLORS).map(color => (
                      <button
                        key={color}
                        onClick={() => setNewWidgetTheme(color as ColorTheme)}
                        className={`w-6 h-6 rounded-full transition-transform ${newWidgetTheme === color ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
                        style={{ backgroundColor: COLORS[color as keyof typeof COLORS] }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Icon</label>
                  <select
                    value={newWidgetIcon}
                    onChange={e => setNewWidgetIcon(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none text-sm"
                  >
                    <option value="list">List</option>
                    <option value="clock">Clock</option>
                    <option value="check">Check</option>
                    <option value="circle">Circle</option>
                    <option value="alert">Alert</option>
                    <option value="bug">Bug</option>
                    <option value="book">Book</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-3">
                <h4 className="text-sm font-bold text-slate-700 uppercase">Filters</h4>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status</label>
                  <select
                    value={newWidgetFilter.status}
                    onChange={e => setNewWidgetFilter({ ...newWidgetFilter, status: e.target.value as any })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value={TaskStatus.TODO}>To Do</option>
                    <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                    <option value={TaskStatus.DONE}>Done</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Priority</label>
                  <select
                    value={newWidgetFilter.priority}
                    onChange={e => setNewWidgetFilter({ ...newWidgetFilter, priority: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm outline-none"
                  >
                    <option value="all">All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Category</label>
                  <select
                    value={newWidgetFilter.category}
                    onChange={e => setNewWidgetFilter({ ...newWidgetFilter, category: e.target.value as any })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm outline-none"
                  >
                    <option value="all">All Categories</option>
                    <option value={TaskCategory.TASK}>Task</option>
                    <option value={TaskCategory.ISSUE}>Issue</option>
                    <option value={TaskCategory.BUG}>Bug</option>
                    <option value={TaskCategory.STORY}>Story</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            // Chart Specific Options
            <div className="space-y-4 animate-in fade-in">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Visualization Type</label>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setNewChartType('pie')}
                    className={`flex-1 p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${newChartType === 'pie' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}
                  >
                    <PieChartIcon size={20} />
                    <span className="text-sm font-medium">Pie Chart</span>
                  </button>
                  <button
                    onClick={() => setNewChartType('bar')}
                    className={`flex-1 p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${newChartType === 'bar' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}
                  >
                    <BarChart3 size={20} />
                    <span className="text-sm font-medium">Bar Chart</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Group Data By</label>
                <select
                  value={newChartGroup}
                  onChange={e => setNewChartGroup(e.target.value as GroupBy)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none"
                >
                  <option value="status">Task Status</option>
                  <option value="priority">Task Priority</option>
                  <option value="category">Task Category</option>
                  <option value="assignee">Assignee</option>
                </select>
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end space-x-2">
            <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg">Cancel</button>
            <button onClick={handleAddWidget} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg">Add Widget</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
