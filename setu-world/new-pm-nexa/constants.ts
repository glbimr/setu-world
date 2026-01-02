import { User, UserRole, Project, Task, TaskStatus, TaskCategory } from './types';

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Website Redesign',
    description: 'Overhaul of the main corporate website with modern stack.',
    memberIds: [],
    attachments: [],
    comments: []
  },
  {
    id: 'p2',
    name: 'Mobile App Launch',
    description: 'Prepare iOS and Android apps for Q4 launch.',
    memberIds: [],
    attachments: [],
    comments: []
  }
];

export const INITIAL_USERS: User[] = [
  {
    id: 'u1',
    name: 'Admin User',
    username: 'admin',
    password: 'admin123',
    role: UserRole.ADMIN,
    avatar: 'https://picsum.photos/200/200?random=1',
    isOnline: true,
    projectAccess: { 'p1': 'write', 'p2': 'write' }
  },
  {
    id: 'u2',
    name: 'Sarah Engineer',
    username: 'sarah',
    password: 'password',
    role: UserRole.MEMBER,
    avatar: 'https://picsum.photos/200/200?random=2',
    isOnline: true,
    projectAccess: { 'p1': 'write', 'p2': 'read' }
  },
  {
    id: 'u3',
    name: 'Mike Designer',
    username: 'mike',
    password: 'password',
    role: UserRole.MEMBER,
    avatar: 'https://picsum.photos/200/200?random=3',
    isOnline: false,
    projectAccess: { 'p1': 'read', 'p2': 'none' }
  }
];

export const INITIAL_TASKS: Task[] = [
  {
    id: 't1',
    projectId: 'p1',
    title: 'Setup React Repo',
    description: 'Initialize the project with Vite, TypeScript and Tailwind.',
    status: TaskStatus.DONE,
    category: TaskCategory.TASK,
    assigneeId: 'u2',
    priority: 'high',
    dueDate: '2023-12-01',
    createdAt: Date.now() - 10000000,
    attachments: [],
    comments: [],
    subtasks: [
      {
        id: 'st1',
        title: 'Install dependencies',
        completed: true,
        status: TaskStatus.DONE,
        category: TaskCategory.TASK,
        description: 'Run npm install',
        priority: 'medium',
        attachments: [],
        comments: [],
        createdAt: Date.now()
      },
      {
        id: 'st2',
        title: 'Configure ESLint',
        completed: true,
        status: TaskStatus.DONE,
        category: TaskCategory.TASK,
        description: 'Standard config',
        priority: 'low',
        attachments: [],
        comments: [],
        createdAt: Date.now()
      }
    ]
  },
  {
    id: 't2',
    projectId: 'p1',
    title: 'Design Home Page',
    description: 'Create Figma mockups for the landing page hero section.',
    status: TaskStatus.IN_PROGRESS,
    category: TaskCategory.STORY,
    assigneeId: 'u3',
    priority: 'medium',
    dueDate: '2023-12-15',
    createdAt: Date.now() - 5000000,
    attachments: [
      { id: 'a1', name: 'hero_v1.png', size: '2.4 MB', type: 'image/png' }
    ],
    comments: [],
    subtasks: [
      {
        id: 'st3',
        title: 'Hero Banner',
        completed: true,
        status: TaskStatus.DONE,
        category: TaskCategory.STORY,
        description: '',
        priority: 'high',
        attachments: [],
        comments: [],
        createdAt: Date.now()
      },
      {
        id: 'st4',
        title: 'Testimonials Section',
        completed: false,
        status: TaskStatus.TODO,
        category: TaskCategory.STORY,
        description: '',
        priority: 'medium',
        attachments: [],
        comments: [],
        createdAt: Date.now()
      }
    ]
  },
  {
    id: 't3',
    projectId: 'p1',
    title: 'Integrate API',
    description: 'Connect frontend to the backend GraphQL endpoints.',
    status: TaskStatus.TODO,
    category: TaskCategory.TASK,
    assigneeId: 'u2',
    priority: 'high',
    dueDate: '2023-12-20',
    createdAt: Date.now() - 1000000,
    attachments: [],
    comments: [],
    subtasks: []
  },
  {
    id: 't4',
    projectId: 'p1',
    title: 'Fix Login Crash',
    description: 'App crashes on Safari when clicking login button.',
    status: TaskStatus.TODO,
    category: TaskCategory.BUG,
    assigneeId: 'u2',
    priority: 'high',
    dueDate: '2023-12-10',
    createdAt: Date.now() - 200000,
    attachments: [],
    comments: [],
    subtasks: []
  }
];