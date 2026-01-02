import React, { useState } from 'react';
import { useApp } from '../store';
import { UserRole, User, ProjectAccessLevel, Project } from '../types';
import { Trash2, UserPlus, Shield, User as UserIcon, Settings, Lock, Search, KeyRound, LayoutGrid, Eye, EyeOff, FolderPlus, Folder, PenLine, Users as UsersIcon, AlertTriangle } from 'lucide-react';
import { Modal } from '../components/Modal';

export const AdminPanel: React.FC = () => {
  const {
    users, projects, currentUser,
    addUser, updateUser, deleteUser,
    addProject, updateProject, deleteProject
  } = useApp();

  const [activeSection, setActiveSection] = useState<'users' | 'projects'>('users');

  // --- User Management State ---
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userModalTab, setUserModalTab] = useState<'account' | 'permissions'>('account');
  const [showPassword, setShowPassword] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const [userFormData, setUserFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: UserRole.MEMBER,
    projectAccess: {} as Record<string, ProjectAccessLevel>
  });

  // --- Project Management State ---
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: ''
  });

  if (currentUser?.role !== UserRole.ADMIN) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Access Denied. Admin privileges required.
      </div>
    );
  }

  // --- User Actions ---
  const openAddUserModal = () => {
    setEditingUser(null);
    setUserFormData({
      name: '',
      username: '',
      password: '',
      role: UserRole.MEMBER,
      projectAccess: projects.reduce((acc, p) => ({ ...acc, [p.id]: 'read' }), {})
    });
    setUserModalTab('account');
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    const access = { ...user.projectAccess };
    projects.forEach(p => {
      if (!access[p.id]) access[p.id] = 'none';
    });

    setUserFormData({
      name: user.name,
      username: user.username,
      password: user.password,
      role: user.role,
      projectAccess: access
    });
    setUserModalTab('account');
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.name || !userFormData.username || !userFormData.password) return;

    if (editingUser) {
      updateUser({
        ...editingUser,
        name: userFormData.name,
        username: userFormData.username,
        password: userFormData.password,
        role: userFormData.role,
        projectAccess: userFormData.projectAccess
      });
    } else {
      addUser({
        id: crypto.randomUUID(),
        name: userFormData.name,
        username: userFormData.username,
        password: userFormData.password,
        role: userFormData.role,
        avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${userFormData.username}`,
        projectAccess: userFormData.projectAccess,
        isOnline: false
      });
    }
    setIsUserModalOpen(false);
  };

  const handleAccessChange = (projectId: string, level: ProjectAccessLevel) => {
    setUserFormData(prev => ({
      ...prev,
      projectAccess: { ...prev.projectAccess, [projectId]: level }
    }));
  };

  // --- Project Actions ---
  const openAddProjectModal = () => {
    setEditingProject(null);
    setProjectFormData({ name: '', description: '' });
    setIsProjectModalOpen(true);
  };

  const openEditProjectModal = (project: Project) => {
    setEditingProject(project);
    setProjectFormData({
      name: project.name,
      description: project.description
    });
    setIsProjectModalOpen(true);
  };

  const handleProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectFormData.name) return;

    if (editingProject) {
      updateProject({
        ...editingProject,
        name: projectFormData.name,
        description: projectFormData.description
      });
    } else {
      addProject(projectFormData.name, projectFormData.description);
    }
    setIsProjectModalOpen(false);
  };

  // --- Filtering ---
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(projectSearchTerm.toLowerCase()) ||
    project.description.toLowerCase().includes(projectSearchTerm.toLowerCase())
  );

  return (
    <div className="w-full p-4 md:p-6 pb-24 md:pb-6 flex flex-col h-full overflow-hidden">
      {/* Top Header & Tabs */}
      <div className="flex flex-col mb-6 shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-4">Administration</h1>

        <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveSection('users')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSection === 'users'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <UsersIcon size={16} className="mr-2" />
            Users
          </button>
          <button
            onClick={() => setActiveSection('projects')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSection === 'projects'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <LayoutGrid size={16} className="mr-2" />
            Projects
          </button>
        </div>
      </div>

      {activeSection === 'users' ? (
        <>
          {/* USERS TOOLBAR */}
          <div className="flex justify-between items-center mb-4 shrink-0 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search users..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={openAddUserModal}
              className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm shrink-0 font-medium text-sm"
            >
              <UserPlus size={16} className="mr-2" /> Add User
            </button>
          </div>

          {/* USERS TABLE */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-sm table-fixed md:table-auto">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700 w-[40%]">User</th>
                    <th className="hidden md:table-cell px-6 py-4 font-semibold text-slate-700">Username</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 w-[20%]">Role</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right w-[20%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full mr-3 border border-slate-200 shrink-0" />
                          <div className="font-medium text-slate-800 truncate">{user.name}</div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-slate-500 font-mono text-xs">{user.username}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                          {user.role === UserRole.ADMIN ? <Shield size={10} className="mr-1" /> : <UserIcon size={10} className="mr-1" />}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-1">
                          <button
                            onClick={() => openEditUserModal(user)}
                            className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition-colors"
                            title="Settings"
                          >
                            <Settings size={18} />
                          </button>
                          {user.id !== currentUser.id && (
                            <button
                              onClick={() => setUserToDelete(user)}
                              className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                              title="Delete User"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        {userSearchTerm ? `No users found matching "${userSearchTerm}"` : 'No users found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* PROJECTS TOOLBAR */}
          <div className="flex justify-between items-center mb-4 shrink-0 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search projects..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={openAddProjectModal}
              className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg transition-colors shadow-sm shrink-0 font-medium text-sm"
            >
              <FolderPlus size={16} className="mr-2" /> Add Project
            </button>
          </div>

          {/* PROJECTS TABLE */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-sm table-fixed md:table-auto">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700 w-[40%]">Project Name</th>
                    <th className="hidden md:table-cell px-6 py-4 font-semibold text-slate-700">Description</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right w-[20%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map(project => (
                    <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3 border border-indigo-100 shrink-0">
                            <Folder size={16} />
                          </div>
                          <div>
                            <div className="font-medium text-slate-800 truncate">{project.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">ID: {project.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-slate-500 truncate max-w-xs">{project.description}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-1">
                          <button
                            onClick={() => openEditProjectModal(project)}
                            className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition-colors"
                            title="Edit Project"
                          >
                            <PenLine size={18} />
                          </button>
                          <button
                            onClick={() => setProjectToDelete(project)}
                            className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                            title="Delete Project"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredProjects.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                        {projectSearchTerm ? `No projects found matching "${projectSearchTerm}"` : 'No projects found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* --- User Modal --- */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title={editingUser ? "Edit User Settings" : "Create New User"}
        maxWidth="max-w-2xl"
        className="h-auto"
      >
        <form onSubmit={handleUserSubmit} className="flex flex-col h-full px-6 pb-6">
          {/* Custom Tabs */}
          <div className="flex border-b border-slate-100 mb-6 -mx-6 px-6">
            <button
              type="button"
              onClick={() => setUserModalTab('account')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${userModalTab === 'account' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Account Details
            </button>
            <button
              type="button"
              onClick={() => setUserModalTab('permissions')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${userModalTab === 'permissions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Project Access
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {userModalTab === 'account' ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-200 py-1">
                {/* Name Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Full Name</label>
                  <div className="relative">
                    <UserIcon size={18} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      required
                      type="text"
                      className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all bg-slate-50 focus:bg-white"
                      value={userFormData.name}
                      onChange={e => setUserFormData({ ...userFormData, name: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>
                </div>

                {/* Username & Role Row */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Username</label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all bg-slate-50 focus:bg-white"
                      value={userFormData.username}
                      onChange={e => setUserFormData({ ...userFormData, username: e.target.value })}
                      placeholder="johndoe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Role</label>
                    <div className="relative">
                      <select
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all bg-slate-50 focus:bg-white appearance-none cursor-pointer"
                        value={userFormData.role}
                        onChange={e => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
                      >
                        <option value={UserRole.MEMBER}>Member</option>
                        <option value={UserRole.ADMIN}>Administrator</option>
                      </select>
                      <div className="absolute right-3 top-3 pointer-events-none text-slate-400">
                        <Shield size={14} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password</label>
                  <div className="relative">
                    <KeyRound size={18} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all bg-slate-50 focus:bg-white font-mono tracking-wide"
                      value={userFormData.password}
                      onChange={e => setUserFormData({ ...userFormData, password: e.target.value })}
                      placeholder="Secret123"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Password must be at least 6 characters long.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200 py-1">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-slate-800">Project Permissions</h4>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
                    {projects.length} Projects
                  </span>
                </div>

                <div className="space-y-3">
                  {projects.map(project => (
                    <div key={project.id} className="p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors border border-slate-100 rounded-xl bg-white shadow-sm">
                      <div className="flex items-center min-w-0 mr-4">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mr-3 shrink-0 border border-indigo-100">
                          <LayoutGrid size={18} />
                        </div>
                        <div className="truncate">
                          <div className="text-sm font-bold text-slate-800 truncate mb-0.5">{project.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">ID: {project.id}</div>
                        </div>
                      </div>

                      <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                        {(['none', 'read', 'write'] as ProjectAccessLevel[]).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => handleAccessChange(project.id, level)}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-md capitalize transition-all ${userFormData.projectAccess[project.id] === level
                              ? level === 'none' ? 'bg-white text-slate-600 shadow-sm border border-slate-200' :
                                level === 'read' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'bg-white text-green-600 shadow-sm border border-slate-200'
                              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                              }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">No projects available to configure.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsUserModalOpen(false)}
              className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm shadow-lg shadow-indigo-200 transition-all transform hover:scale-[1.02]"
            >
              {editingUser ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --- Project Modal --- */}
      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        title={editingProject ? "Edit Project" : "Create New Project"}
        maxWidth="max-w-xl"
        className="h-auto"
      >
        <form onSubmit={handleProjectSubmit} className="flex flex-col h-full px-6 pb-6">
          <div className="space-y-6 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Project Name</label>
              <input
                required
                type="text"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                value={projectFormData.name}
                onChange={e => setProjectFormData({ ...projectFormData, name: e.target.value })}
                placeholder="Marketing Campaign"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Description</label>
              <textarea
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all min-h-[100px] resize-none"
                value={projectFormData.description}
                onChange={e => setProjectFormData({ ...projectFormData, description: e.target.value })}
                placeholder="Project goals and details..."
              />
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsProjectModalOpen(false)}
              className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm shadow-lg shadow-indigo-200 transition-all transform hover:scale-[1.02]"
            >
              {editingProject ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="Confirm User Deletion"
        maxWidth="max-w-md"
        className="h-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4 mx-auto">
            <AlertTriangle size={24} />
          </div>
          <p className="text-center text-slate-600 mb-6">
            Are you sure you want to delete <span className="font-bold text-slate-800">{userToDelete?.name}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setUserToDelete(null)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (userToDelete) {
                  deleteUser(userToDelete.id);
                  setUserToDelete(null);
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-md shadow-red-200 transition-colors"
            >
              Delete User
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        title="Confirm Project Deletion"
        maxWidth="max-w-md"
        className="h-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-4 mx-auto">
            <AlertTriangle size={24} />
          </div>
          <p className="text-center text-slate-600 mb-6">
            Are you sure you want to delete project <span className="font-bold text-slate-800">{projectToDelete?.name}</span>? This action cannot be undone and will delete all associated tasks.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setProjectToDelete(null)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (projectToDelete) {
                  deleteProject(projectToDelete.id);
                  setProjectToDelete(null);
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-md shadow-red-200 transition-colors"
            >
              Delete Project
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};