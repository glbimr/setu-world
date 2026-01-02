import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, Project, Task, ChatMessage, UserRole, TaskStatus, Attachment, Group, ProjectAccessLevel, Notification, NotificationType, IncomingCall, SignalData } from './types';
import { supabase, fetchMessages } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

interface AppContextType {
  currentUser: User | null;
  users: User[];
  projects: Project[];
  tasks: Task[];
  messages: ChatMessage[];
  groups: Group[];
  notifications: Notification[];
  incomingCall: IncomingCall | null;
  isInCall: boolean;
  activeCallData: { participantIds: string[] } | null;

  // Chat History Management
  deletedMessageIds: Set<string>;
  clearChatHistory: (targetId: string) => Promise<void>;

  // Media Streams for UI
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>; // Map of userId -> MediaStream
  isScreenSharing: boolean;

  // Media Controls
  isMicOn: boolean;
  isCameraOn: boolean;
  hasAudioDevice: boolean;
  hasVideoDevice: boolean;
  toggleMic: () => void;
  toggleCamera: () => void;

  login: (u: User) => void;
  logout: () => void;
  addUser: (u: User) => void;
  updateUser: (u: User) => void;
  deleteUser: (id: string) => void;
  addTask: (t: Task) => void;
  updateTask: (t: Task) => void;
  deleteTask: (id: string) => Promise<void>;
  moveTask: (taskId: string, newStatus: TaskStatus, newIndex?: number) => Promise<void>;
  addMessage: (text: string, recipientId?: string, attachments?: Attachment[]) => void;
  createGroup: (name: string, memberIds: string[]) => Promise<string | null>;
  addProject: (name: string, description: string) => void;
  updateProject: (p: Project) => void;
  deleteProject: (id: string) => Promise<void>;
  updateGroup: (g: Group) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;

  // Notification & Unread Logic
  triggerNotification: (recipientId: string, type: NotificationType, title: string, message: string, linkTo?: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  markChatRead: (chatId: string) => void;
  getUnreadCount: (chatId: string) => number;
  totalUnreadChatCount: number;

  // Call Logic
  startCall: (recipientId: string) => Promise<void>;
  startGroupCall: (recipientIds: string[]) => Promise<void>;
  addToCall: (recipientId: string) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => void;
  endCall: () => void;
  toggleScreenShare: () => Promise<void>;

  // Preferences
  ringtone: string;
  setRingtone: (url: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Configuration for WebRTC (using public STUN servers)
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize currentUser from localStorage if available
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('nexus_pm_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });

  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [deletedMessageIds, setDeletedMessageIds] = useState<Set<string>>(new Set());

  // Call State
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [activeCallData, setActiveCallData] = useState<{ participantIds: string[] } | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // Separate streams for audio and video to avoid coupling audio and screen sharing
  const [localAudioStream, setLocalAudioStream] = useState<MediaStream | null>(null);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Media Controls State
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [hasAudioDevice, setHasAudioDevice] = useState(true);
  const [hasVideoDevice, setHasVideoDevice] = useState(true);

  // User Preferences
  const [ringtone, setRingtoneState] = useState<string>(() => {
    return localStorage.getItem('nexus_pm_ringtone') || 'https://orangefreesounds.com/wp-content/uploads/2023/04/Office-phone-ringing-sound-effect.mp3';
  });

  const setRingtone = (url: string) => {
    setRingtoneState(url);
    localStorage.setItem('nexus_pm_ringtone', url);
  };

  // WebRTC Refs - Now using a Map for multiple connections
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalingChannelRef = useRef<RealtimeChannel | null>(null);
  const isSignalingConnectedRef = useRef(false);

  // Ref to track incoming call state within event listeners without dependency loops
  const incomingCallRef = useRef<IncomingCall | null>(null);

  // Refs for State Access in Event Listeners to avoid dependency cycles / re-subscriptions
  const isInCallRef = useRef(isInCall);
  const activeCallDataRef = useRef(activeCallData);
  const localStreamRef = useRef(localStream);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const prevCameraWasOnRef = useRef<boolean>(false);
  const prevCameraStreamRef = useRef<MediaStream | null>(null);
  const usersRef = useRef(users);

  // IDs of users currently active (via Supabase Presence)
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const presentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    presentIdsRef.current = presentIds;
  }, [presentIds]);

  // Map of ChatID -> Timestamp when current user last read it
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, number>>({});

  // --- Data Mappers (DB Snake_case to App CamelCase) ---
  const mapUserFromDB = (u: any): User => ({
    ...u,
    isOnline: u.is_online,
    projectAccess: u.project_access,
    dashboardConfig: u.dashboard_config
  });
  const mapTaskFromDB = (t: any): Task => ({
    ...t,
    projectId: t.project_id,
    assigneeId: t.assignee_id,
    dueDate: t.due_date,
    order: t.order,
    subtasks: t.subtasks || [],
    attachments: t.attachments || [],
    comments: t.comments || [],
    createdAt: t.created_at
  });
  const mapProjectFromDB = (p: any): Project => ({
    id: p.id,
    name: p.name,
    description: p.description,
    memberIds: p.member_ids || [],
    attachments: [],
    comments: []
  });
  const mapGroupFromDB = (g: any): Group => ({
    ...g,
    memberIds: g.member_ids,
    createdBy: g.created_by,
    createdAt: g.created_at
  });
  const mapMessageFromDB = (m: any): ChatMessage => ({
    id: m.id,
    senderId: m.sender_id,
    recipientId: m.recipient_id,
    text: m.text,
    timestamp: m.timestamp,
    type: m.type,
    attachments: m.attachments,
    isRead: m.is_read || false
  });
  const mapNotificationFromDB = (n: any): Notification => ({
    id: n.id,
    recipientId: n.recipient_id,
    senderId: n.sender_id,
    type: n.type,
    title: n.title,
    message: n.message,
    timestamp: n.timestamp,
    read: n.read,
    linkTo: n.link_to
  });

  // Keep Refs in sync with state
  useEffect(() => {
    incomingCallRef.current = incomingCall;
    isInCallRef.current = isInCall;
    activeCallDataRef.current = activeCallData;
    localStreamRef.current = localStream;
    localAudioStreamRef.current = localAudioStream;
    localVideoStreamRef.current = localVideoStream;
    usersRef.current = users;
  }, [incomingCall, isInCall, activeCallData, localStream, localAudioStream, localVideoStream, users]);

  // Check available devices
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setHasAudioDevice(devices.some(d => d.kind === 'audioinput'));
      setHasVideoDevice(devices.some(d => d.kind === 'videoinput'));
    });
  }, []);

  // --- 1. Fetch Initial Data from Supabase ---
  useEffect(() => {
    const fetchData = async () => {
      const { data: userData } = await supabase.from('users').select('*');
      if (userData) setUsers(userData.map(mapUserFromDB));

      const { data: projectData } = await supabase.from('projects').select('*');
      if (projectData) setProjects(projectData.map(mapProjectFromDB));

      const { data: taskData } = await supabase.from('tasks').select('*');
      if (taskData) setTasks(taskData.map(mapTaskFromDB));

      // Fetch messages from public.messages via helper that normalizes rows
      try {
        const msgs = await fetchMessages({ limit: 500, order: 'asc' });
        if (msgs && msgs.length) setMessages(msgs);
      } catch (e) {
        // Fallback: try decrypted_messages if public.messages is unavailable
        const { data: msgData } = await supabase.from('decrypted_messages').select('*').order('timestamp', { ascending: true });
        if (msgData) setMessages(msgData.map(mapMessageFromDB));
      }

      const { data: groupData } = await supabase.from('groups').select('*');
      if (groupData) setGroups(groupData.map(mapGroupFromDB));

      const { data: notifData } = await supabase.from('notifications').select('*').order('timestamp', { ascending: false });
      if (notifData) setNotifications(notifData.map(mapNotificationFromDB));
    };

    fetchData();
  }, []);

  // --- 1.1 Fetch Deleted Messages ---
  useEffect(() => {
    if (currentUser) {
      const fetchDeletedAndRead = async () => {
        // Fetch Deleted Messages
        const { data: deletedData } = await supabase.from('deleted_messages').select('message_id').eq('user_id', currentUser.id);
        if (deletedData) {
          setDeletedMessageIds(new Set(deletedData.map(d => d.message_id)));
        }

        // Fetch Read Receipts
        const { data: receipts } = await supabase.from('read_receipts').select('*').eq('user_id', currentUser.id);
        if (receipts) {
          const map: Record<string, number> = {};
          receipts.forEach((r: any) => map[r.chat_id] = r.last_read_timestamp);
          setLastReadTimestamps(map);
        }
      };
      fetchDeletedAndRead();
    } else {
      setDeletedMessageIds(new Set());
    }
  }, [currentUser]);

  // --- 1.5 Update Online Status via Presence (Handled in Signaling Effect) ---
  // No longer manual DB updates here to avoid stale status when tab is closed.

  // --- 1.6 Sync Current User with Users List (Refresh Data) ---
  useEffect(() => {
    if (currentUser && users.length > 0) {
      const freshUser = users.find(u => u.id === currentUser.id);
      if (freshUser && JSON.stringify(freshUser) !== JSON.stringify(currentUser)) {
        setCurrentUser(freshUser);
        localStorage.setItem('nexus_pm_user', JSON.stringify(freshUser));
      }
    }
  }, [users, currentUser]);

  // --- 2. Setup Realtime Subscriptions ---
  useEffect(() => {
    const channel = supabase.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
        if (payload.eventType === 'INSERT') setTasks(prev => [...prev, mapTaskFromDB(payload.new)]);
        if (payload.eventType === 'UPDATE') setTasks(prev => prev.map(t => t.id === payload.new.id ? mapTaskFromDB(payload.new) : t));
        if (payload.eventType === 'DELETE') setTasks(prev => prev.filter(t => t.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async payload => {
        try {
          if (payload.eventType === 'INSERT') {
            // Try to fetch a decrypted view, but fall back to payload.new if unavailable
            try {
              const { data } = await supabase.from('decrypted_messages').select('*').eq('id', payload.new.id).single();
              if (data) {
                setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, mapMessageFromDB(data)]);
                return;
              }
            } catch (e) {
              // ignore and fallback to payload.new below
            }

            // Fallback: use payload.new directly
            const row = payload.new;
            const mapped = mapMessageFromDB(row);
            setMessages(prev => prev.some(m => m.id === mapped.id) ? prev : [...prev, mapped]);
          }

          // Handle UPDATE (e.g. Reads)
          if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, isRead: payload.new.is_read } : m));
          }
        } catch (e) {
          console.error('Realtime messages handler error:', e);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
        if (payload.eventType === 'UPDATE') {
          const fresh = mapUserFromDB(payload.new);
          setUsers(prev => prev.map(u => u.id === fresh.id ? { ...fresh, isOnline: presentIdsRef.current.has(u.id) } : u));
        }
        if (payload.eventType === 'INSERT') {
          const fresh = mapUserFromDB(payload.new);
          setUsers(prev => [...prev, { ...fresh, isOnline: presentIdsRef.current.has(fresh.id) }]);
        }
        if (payload.eventType === 'DELETE') setUsers(prev => prev.filter(u => u.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, payload => {
        if (payload.eventType === 'INSERT') setNotifications(prev => [mapNotificationFromDB(payload.new), ...prev]);
        if (payload.eventType === 'UPDATE') setNotifications(prev => prev.map(n => n.id === payload.new.id ? mapNotificationFromDB(payload.new) : n));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, payload => {
        if (payload.eventType === 'INSERT') setProjects(prev => [...prev, mapProjectFromDB(payload.new)]);
        if (payload.eventType === 'UPDATE') setProjects(prev => prev.map(p => p.id === payload.new.id ? mapProjectFromDB(payload.new) : p));
        if (payload.eventType === 'DELETE') setProjects(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, payload => {
        if (payload.eventType === 'INSERT') setGroups(prev => [...prev, mapGroupFromDB(payload.new)]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // --- 3. WebRTC Signaling & Realtime Presence via Supabase ---
  useEffect(() => {
    if (!currentUser) return;

    // Use a unique channel for signaling and presence
    const channel = supabase.channel('signaling', {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });
    signalingChannelRef.current = channel;

    const updatePresence = async () => {
      if (document.visibilityState === 'visible') {
        await channel.track({
          user_id: currentUser.id,
          name: currentUser.name,
          online_at: new Date().toISOString(),
        });
      } else {
        // Untrack or update metadata if hidden (user's choice: we'll untrack to be strict about "Active Now")
        await channel.untrack();
      }
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activeIds = new Set<string>();
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.user_id) activeIds.add(p.user_id);
          });
        });
        setPresentIds(activeIds);
      })
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const { type, senderId, recipientId, payload: signalPayload } = payload as SignalData;

        // Ignore if not meant for us (unless public)
        if (recipientId && recipientId !== currentUser.id && type !== 'USER_ONLINE') return;
        if (senderId === currentUser.id) return; // Don't process own messages

        // Access current state via Refs
        const currentIsInCall = isInCallRef.current;
        const currentActiveCallData = activeCallDataRef.current;

        switch (type) {
          case 'USER_ONLINE':
            break;

          case 'OFFER':
            // If busy and not part of the current call (renegotiation), ignore
            if (currentIsInCall && !currentActiveCallData?.participantIds.includes(senderId)) return;

            if (currentIsInCall && currentActiveCallData?.participantIds.includes(senderId)) {
              // Renegotiation handling
              const pc = peerConnectionsRef.current.get(senderId);
              if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(signalPayload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal('ANSWER', senderId, { sdp: { type: answer.type, sdp: answer.sdp } });
              }
              return;
            }

            setIncomingCall({
              callerId: senderId,
              timestamp: Date.now(),
              offer: signalPayload.sdp
            });
            break;

          case 'ANSWER':
            {
              const pc = peerConnectionsRef.current.get(senderId);
              if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(signalPayload.sdp));
                setActiveCallData(prev => {
                  if (!prev) return null;
                  if (prev.participantIds.includes(senderId)) return prev;
                  return { ...prev, participantIds: [...prev.participantIds, senderId] };
                });
              }
            }
            break;

          case 'CANDIDATE':
            {
              const pc = peerConnectionsRef.current.get(senderId);
              if (pc && signalPayload.candidate) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(signalPayload.candidate));
                } catch (e) {
                  console.error("Error adding ice candidate", e);
                }
              }
            }
            break;

          case 'HANGUP':
            // Check if we have a pending incoming call from this sender (Missed Call Scenario)
            if (incomingCallRef.current && incomingCallRef.current.callerId === senderId) {
              // The caller hung up before we answered
              const usersList = usersRef.current;
              const caller = usersList.find(u => u.id === senderId);
              const callerName = caller ? caller.name : 'Unknown User';

              // 1. Create Missed Call Notification
              const { error: notifError } = await supabase.from('notifications').insert({
                id: 'n-' + Date.now() + Math.random(),
                recipient_id: currentUser.id,
                sender_id: senderId,
                type: NotificationType.MISSED_CALL,
                title: 'Missed Call',
                message: `You missed a call from ${callerName}`,
                timestamp: Date.now(),
                read: false,
                link_to: senderId
              });
              if (notifError) console.error("Error creating missed call notification:", notifError);

              // 2. Create Missed Call Chat Message
              const { error: msgError } = await supabase.from('messages').insert({
                id: 'm-' + Date.now() + Math.random(),
                sender_id: senderId,
                recipient_id: currentUser.id,
                text: 'Missed Call',
                timestamp: Date.now(),
                type: 'missed_call',
                attachments: []
              });
              if (msgError) console.error("Error creating missed call message:", msgError);

              setIncomingCall(null);
            }

            handleRemoteHangup(senderId);
            break;
          case 'CHAT_MESSAGE': {
            try {
              const incoming = signalPayload as any;
              const msg: ChatMessage = {
                id: incoming.id || (Date.now().toString() + Math.random()),
                senderId: incoming.senderId || incoming.sender_id || incoming.sender,
                recipientId: incoming.recipientId || incoming.recipient_id || incoming.recipient,
                text: incoming.text || incoming.body || incoming.message || '',
                timestamp: incoming.timestamp || Date.now(),
                type: incoming.type || 'text',
                attachments: incoming.attachments || []
              } as ChatMessage;

              setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
            } catch (e) { console.error('Error handling CHAT_MESSAGE', e); }
            break;
          }

          case 'SCREEN_STOPPED': {
            try {
              const { hasCameraFallback } = signalPayload as any;
              if (!hasCameraFallback) {
                setRemoteStreams(prev => {
                  const newMap = new Map(prev);
                  const existing = newMap.get(senderId);
                  if (!existing) return prev;
                  const audioTracks = existing.getAudioTracks();
                  const newStream = new MediaStream(audioTracks);
                  newMap.set(senderId, newStream);
                  return newMap;
                });
              }
            } catch (e) { console.error('Error handling SCREEN_STOPPED', e); }
            break;
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSignalingConnectedRef.current = true;
          updatePresence();
          sendSignal('USER_ONLINE', undefined, {});
        } else {
          isSignalingConnectedRef.current = false;
        }
      });

    // Activity listener to track "Active Now" accurately
    const onVisibilityChange = () => updatePresence();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isSignalingConnectedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (signalingChannelRef.current) supabase.removeChannel(signalingChannelRef.current);
    };
  }, [currentUser]); // DEPENDENCY REDUCED: No longer depends on isInCall or activeCallData


  const sendSignal = async (type: SignalData['type'], recipientId: string | undefined, payload: any) => {
    if (signalingChannelRef.current && currentUser) {
      if (!isSignalingConnectedRef.current) return;

      try {
        await signalingChannelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type,
            senderId: currentUser.id,
            recipientId,
            payload
          }
        });
      } catch (err) {
        console.warn("Error sending signal:", err);
      }
    }
  };

  // --- Actions ---

  // ... (keeping lines 538-1326 unchanged implicitly, but since we are replacing a block, we focus on the functions we need to change)
  // Wait, I cannot skip lines in replace_file_content if they are in the range. 
  // I must check where SCREEN_STOPPED is (lines ~477-490) and where the screen share functions are (lines ~1327-1463).
  // These are far apart. I should use MULTI_REPLACE.

  // Let me switch to multi_replace_file_content to handle these disparate blocks cleanly.
  // Cancelling this tool call and switching strategies.


  // --- Actions ---

  const login = async (user: User) => {
    localStorage.setItem('nexus_pm_user', JSON.stringify(user));
    setCurrentUser(user);
    // Presence handles online status automatically now
  };

  const logout = async () => {
    localStorage.removeItem('nexus_pm_user');
    setCurrentUser(null);
    setNotifications([]);
    setLastReadTimestamps({});
    setIncomingCall(null);
    setIsInCall(false);
    setDeletedMessageIds(new Set());
    cleanupCall();
  };

  const addUser = async (user: User) => {
    // Create in public.users table
    const { error } = await supabase.from('users').insert({
      id: user.id,
      name: user.name,
      username: user.username,
      password: user.password,
      role: user.role,
      avatar: user.avatar,
      project_access: user.projectAccess,
      dashboard_config: user.dashboardConfig
    });
    if (error) console.error("Add user failed:", error);
  };

  const updateUser = async (u: User) => {
    const { error } = await supabase.from('users').update({
      name: u.name,
      username: u.username,
      password: u.password,
      role: u.role,
      avatar: u.avatar,
      project_access: u.projectAccess,
      dashboard_config: u.dashboardConfig
    }).eq('id', u.id);
    if (error) console.error("Update user failed", error);

    if (currentUser?.id === u.id) {
      setCurrentUser(u);
      localStorage.setItem('nexus_pm_user', JSON.stringify(u));
    }
  };

  const deleteUser = async (id: string) => {
    await supabase.from('users').delete().eq('id', id);
  };

  const addTask = async (t: Task) => {
    const projectTasks = tasks.filter(task => task.status === t.status && task.projectId === t.projectId);
    const maxOrder = projectTasks.reduce((max, curr) => Math.max(max, curr.order || 0), -1);

    await supabase.from('tasks').insert({
      id: t.id,
      project_id: t.projectId,
      title: t.title,
      description: t.description,
      status: t.status,
      category: t.category,
      assignee_id: t.assigneeId || null,
      priority: t.priority,
      due_date: t.dueDate || null,
      attachments: t.attachments,
      comments: t.comments,
      subtasks: t.subtasks,
      created_at: t.createdAt,
      order: maxOrder + 1
    });
  };

  const updateTask = async (t: Task) => {
    // Optimistic Update
    setTasks(prev => prev.map(task => task.id === t.id ? t : task));

    await supabase.from('tasks').update({
      title: t.title,
      description: t.description,
      status: t.status,
      category: t.category,
      assignee_id: t.assigneeId || null, // Explicitly set null if undefined to unassign
      priority: t.priority,
      due_date: t.dueDate || null,
      attachments: t.attachments,
      comments: t.comments,
      subtasks: t.subtasks,
      order: t.order
    }).eq('id', t.id);
  };

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id);
  };

  const moveTask = async (taskId: string, s: TaskStatus, newIndex?: number) => {
    // 1. Get current state and task
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // 2. Identify destination tasks (excluding the moved task if it was already in this column)
    // We want the list of tasks in the target status, EXCLUDING the dragged task.
    let destTasks = tasks.filter(t => t.status === s && t.id !== taskId);

    // 3. Sort by current order to ensure correct insertion point
    destTasks.sort((a, b) => (a.order || 0) - (b.order || 0));

    // 4. Insert task at new index
    const updatedTask = { ...task, status: s };
    if (newIndex !== undefined && newIndex >= 0 && newIndex <= destTasks.length) {
      destTasks.splice(newIndex, 0, updatedTask);
    } else {
      destTasks.push(updatedTask);
    }

    // 5. Re-assign orders
    const updates = destTasks.map((t, idx) => ({ ...t, order: idx }));

    // 6. Optimistic Update
    // We need to construct the new full task list. 
    // We take all tasks NOT in the destination status (and not the moved task), and combine with updated destination tasks.
    // Wait, if we moved FROM s TO s (reorder), the above logic works (filtered out, inserted back).
    // If we moved FROM A TO B, 'destTasks' holds B tasks + moved task.
    // We also need to keep A tasks (excluding moved task) unchanged order-wise (gaps are fine).

    // Map of ID -> New Task Data
    const updateMap = new Map(updates.map(u => [u.id, u]));

    const newTasks = tasks.map(t => {
      if (updateMap.has(t.id)) return updateMap.get(t.id)!;
      if (t.id === taskId) return { ...t, status: s }; // Fallback, should be covered by updateMap
      return t;
    });
    setTasks(newTasks);

    // 7. Persist to DB
    await Promise.all(updates.map(u =>
      supabase.from('tasks').update({ status: u.status, order: u.order }).eq('id', u.id)
    ));

    // 8. Notification
    if (task.status !== s && task.assigneeId) {
      triggerNotification(
        task.assigneeId,
        NotificationType.ASSIGNMENT,
        'Task Status Updated',
        `Task "${task.title}" moved to ${s.replace('_', ' ')}`,
        task.id
      );
    }
  };

  const addMessage = async (text: string, recipientId?: string, attachments: Attachment[] = []) => {
    if (!currentUser) return;

    // Create the message object for internal app state (CamelCase)
    const optimisticMsg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      senderId: currentUser.id,
      recipientId: recipientId || undefined,
      text,
      timestamp: Date.now(),
      type: 'text',
      attachments
    };

    // 1. Optimistic Update (Immediate Feedback for Sender)
    setMessages(prev => [...prev, optimisticMsg]);

    const chatId = recipientId || 'general';
    setLastReadTimestamps(prev => ({ ...prev, [chatId]: Date.now() }));

    // 2. Broadcast to active peers (Instant Delivery for Receivers) via signaling
    if (isSignalingConnectedRef.current) {
      try {
        await sendSignal('CHAT_MESSAGE', undefined, optimisticMsg);
      } catch (err) {
        console.error('Broadcast failed', err);
      }
    }

    // 3. Persist to DB (Encrypted) via RPC
    const { error } = await supabase.rpc('send_encrypted_message', {
      p_id: optimisticMsg.id,
      p_sender_id: optimisticMsg.senderId,
      p_recipient_id: optimisticMsg.recipientId,
      p_text: optimisticMsg.text,
      p_type: optimisticMsg.type,
      p_attachments: optimisticMsg.attachments,
      p_timestamp: optimisticMsg.timestamp
    });

    if (error) {
      console.error("Error sending encrypted message (RPC):", error);
      // Fallback: attempt direct insert into public.messages to ensure UI visibility
      try {
        const { data: fallbackData, error: insertErr } = await supabase.from('messages').insert({
          id: optimisticMsg.id,
          sender_id: optimisticMsg.senderId,
          recipient_id: optimisticMsg.recipientId,
          text: optimisticMsg.text,
          timestamp: optimisticMsg.timestamp,
          type: optimisticMsg.type,
          attachments: optimisticMsg.attachments
        }).select();
        if (insertErr) {
          console.error('Fallback insert to public.messages failed:', insertErr);
        } else {
          console.debug('Fallback insert succeeded, row:', fallbackData);
          // Refresh messages from public.messages to ensure UI reflects DB
          try {
            const refreshed = await fetchMessages({ limit: 500, order: 'asc' });
            if (refreshed) setMessages(refreshed);
          } catch (e) {
            console.warn('Failed to refresh messages after fallback insert:', e);
          }
        }
      } catch (e) {
        console.error('Fallback insert exception:', e);
      }
      return;
    }

    // Best-effort: also write to public.messages so the UI (which reads public.messages) is populated.
    try {
      const { data: insertData, error: insertErr } = await supabase.from('messages').insert({
        id: optimisticMsg.id,
        sender_id: optimisticMsg.senderId,
        recipient_id: optimisticMsg.recipientId,
        text: optimisticMsg.text,
        timestamp: optimisticMsg.timestamp,
        type: optimisticMsg.type,
        attachments: optimisticMsg.attachments
      }).select();

      if (insertErr) {
        // Not fatal; log for debugging
        console.warn('Insert to public.messages returned error (non-fatal):', insertErr);
      } else {
        console.debug('Insert to public.messages succeeded, row:', insertData);
        try {
          const refreshed = await fetchMessages({ limit: 500, order: 'asc' });
          if (refreshed) setMessages(refreshed);
        } catch (e) {
          console.warn('Failed to refresh messages after insert:', e);
        }
      }
    } catch (e) {
      console.error('Insert to public.messages exception (non-fatal):', e);
    }
  };

  const createGroup = async (name: string, memberIds: string[]): Promise<string | null> => {
    if (!currentUser) return null;
    const newGroupId = 'g-' + Date.now();
    const allMembers = Array.from(new Set([...memberIds, currentUser.id]));
    const { error } = await supabase.from('groups').insert({
      id: newGroupId,
      name,
      member_ids: allMembers,
      created_by: currentUser.id,
      created_at: Date.now()
    });

    if (error) {
      console.error("Error creating group:", error);
      return null;
    }
    return newGroupId;
  };

  const updateGroup = async (g: Group) => {
    // Optimistic Update
    setGroups(prev => prev.map(group => group.id === g.id ? g : group));

    const { error } = await supabase.from('groups').update({
      name: g.name,
      member_ids: g.memberIds
    }).eq('id', g.id);

    if (error) console.error("Error updating group:", error);
  };

  const deleteGroup = async (id: string) => {
    // Optimistic Update
    setGroups(prev => prev.filter(g => g.id !== id));

    const { error } = await supabase.from('groups').delete().eq('id', id);
    if (error) console.error("Error deleting group:", error);
  };

  const addProject = async (name: string, description: string) => {
    const newProjectId = 'p-' + Date.now();
    // Use only schema-defined columns to prevent errors
    const { error } = await supabase.from('projects').insert({
      id: newProjectId,
      name,
      description,
      member_ids: []
    });

    if (error) {
      console.error("Error creating project:", error);
      return;
    }

    if (currentUser) {
      const updatedAccess = { ...currentUser.projectAccess, [newProjectId]: 'write' };
      updateUser({ ...currentUser, projectAccess: updatedAccess as any });
    }
  };

  const updateProject = async (p: Project) => {
    // Use only schema-defined columns
    const { error } = await supabase.from('projects').update({
      name: p.name,
      description: p.description,
      member_ids: p.memberIds
    }).eq('id', p.id);

    if (error) console.error("Error updating project:", error);
  };

  const deleteProject = async (id: string) => {
    // Optimistic update
    const oldProjects = [...projects];
    setProjects(prev => prev.filter(p => p.id !== id));

    try {
      // 1. Delete tasks (Manual cascade since DB might not have ON DELETE CASCADE)
      const { error: taskError } = await supabase.from('tasks').delete().eq('project_id', id);
      if (taskError) {
        console.warn("Project tasks deletion issue (proceeding with project delete):", taskError.message);
      }

      // 2. Delete project
      const { error: projectError } = await supabase.from('projects').delete().eq('id', id);

      if (projectError) {
        throw new Error(projectError.message);
      }
    } catch (error: any) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project. " + (error.message || "Unknown error"));
      // Restore optimistic update
      setProjects(oldProjects);
      // Refresh from DB to be safe
      const { data } = await supabase.from('projects').select('*');
      if (data) setProjects(data.map(mapProjectFromDB));
    }
  };

  const triggerNotification = async (recipientId: string, type: NotificationType, title: string, message: string, linkTo?: string) => {
    if (currentUser && recipientId === currentUser.id) return;
    await supabase.from('notifications').insert({
      id: 'n-' + Date.now() + Math.random(),
      recipient_id: recipientId,
      sender_id: currentUser?.id,
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      link_to: linkTo
    });
  };

  const markNotificationRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  const clearNotifications = async () => {
    if (!currentUser) return;
    await supabase.from('notifications').update({ read: true }).eq('recipient_id', currentUser.id);
  };

  const markChatRead = async (chatId: string) => {
    if (!currentUser) return;

    // 1. Optimistic Update (Immediate UI response) to stop blinking dot
    setMessages(prev => {
      // Check if any change is actually needed to avoid unnecessary re-renders
      const needsUpdate = prev.some(m => {
        const isTarget = (chatId === 'general' && !m.recipientId) ||
          (chatId.startsWith('g-') && m.recipientId === chatId) ||
          (m.senderId === chatId && m.recipientId === currentUser.id);
        return isTarget && !m.isRead && m.senderId !== currentUser.id;
      });

      if (!needsUpdate) return prev;

      return prev.map(m => {
        const isTarget = (chatId === 'general' && !m.recipientId) ||
          (chatId.startsWith('g-') && m.recipientId === chatId) ||
          (m.senderId === chatId && m.recipientId === currentUser.id);

        if (isTarget && !m.isRead && m.senderId !== currentUser.id) {
          return { ...m, isRead: true };
        }
        return m;
      });
    });

    // 2. Database Update
    try {
      let query = supabase.from('messages').update({ is_read: true }).neq('sender_id', currentUser.id).eq('is_read', false);

      if (chatId === 'general') {
        // General Chat
        query = query.is('recipient_id', null);
      } else if (chatId.startsWith('g-')) {
        // Group Chat
        query = query.eq('recipient_id', chatId);
      } else {
        // Direct Message: Mark messages FROM the other user TO me
        query = query.eq('sender_id', chatId).eq('recipient_id', currentUser.id);
      }

      const { error } = await query;
      if (error) console.error("Error marking messages read in DB:", error);
    } catch (e) {
      console.error("Exception marking messages read:", e);
    }
  };

  const getUnreadCount = (chatId: string) => {
    if (!currentUser) return 0;

    return messages.filter(m => {
      if (deletedMessageIds.has(m.id)) return false;
      if (m.isRead) return false; // Already read

      if (chatId === 'general') {
        // Global chat: User is NOT the sender
        return !m.recipientId && m.senderId !== currentUser.id;
      }
      if (chatId.startsWith('g-')) {
        // Group chat
        return m.recipientId === chatId && m.senderId !== currentUser.id;
      }
      // DM
      return m.senderId === chatId && m.senderId !== currentUser.id; // Corrected logic: Sender is the Chat Partner, User is recipient
    }).length;
  };

  const totalUnreadChatCount = React.useMemo(() => {
    if (!currentUser) return 0;
    let count = getUnreadCount('general');
    groups.forEach(g => { if (g.memberIds.includes(currentUser.id)) count += getUnreadCount(g.id); });
    users.forEach(u => { if (u.id !== currentUser.id) count += getUnreadCount(u.id); });
    return count;
  }, [messages, lastReadTimestamps, currentUser, groups, users, deletedMessageIds]); // Added deletedMessageIds dep

  // --- Clear Chat History Logic ---
  const clearChatHistory = async (targetId: string) => {
    if (!currentUser) return;

    const isGroup = groups.some(g => g.id === targetId);

    const msgsToDelete = messages.filter(m => {
      if (deletedMessageIds.has(m.id)) return false; // Already deleted

      if (targetId === 'general') {
        return !m.recipientId; // Global chat
      }
      if (isGroup) {
        return m.recipientId === targetId;
      } else {
        // 1:1 Chat
        return (m.senderId === currentUser.id && m.recipientId === targetId) ||
          (m.senderId === targetId && m.recipientId === currentUser.id);
      }
    });

    if (msgsToDelete.length === 0) return;

    const newDeletedIds = new Set(deletedMessageIds);
    const recordsToInsert = msgsToDelete.map(m => {
      newDeletedIds.add(m.id);
      return {
        id: 'dm-' + Date.now() + Math.random().toString(36).substr(2, 9),
        user_id: currentUser.id,
        message_id: m.id,
        timestamp: Date.now()
      };
    });

    setDeletedMessageIds(newDeletedIds); // Optimistic UI update

    const { error } = await supabase.from('deleted_messages').insert(recordsToInsert);
    if (error) console.error("Failed to delete chat history", error);
  };


  // --- WebRTC Logic (Audio + Screen Share Only) ---

  const createPeerConnection = (recipientId: string) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('CANDIDATE', recipientId, { candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      // The receiver is unable to hear audio because sometimes tracks are added but not correctly mapped to the existing stream reference
      // We force create a NEW MediaStream object to ensure the video element reloads the source
      setRemoteStreams(prev => {
        const newMap = new Map<string, MediaStream>(prev);
        const existingStream = newMap.get(recipientId);
        const track = event.track;

        if (existingStream) {
          // Create a brand new stream combining existing tracks and the new one
          const newStream = new MediaStream(existingStream.getTracks());
          if (!newStream.getTracks().find(t => t.id === track.id)) {
            newStream.addTrack(track);
          }
          newMap.set(recipientId, newStream);
        } else {
          // Create new stream with this track
          // If event.streams[0] is available, we could use it, but cloning is safer for React reactivity
          const newStream = event.streams[0] ? new MediaStream(event.streams[0].getTracks()) : new MediaStream([track]);
          newMap.set(recipientId, newStream);
        }
        return newMap;
      });
    };

    peerConnectionsRef.current.set(recipientId, pc);
    return pc;
  };

  // Compose a preview local stream from separate audio/video streams
  const composeLocalStream = () => {
    const tracks: MediaStreamTrack[] = [];
    if (localAudioStreamRef.current) tracks.push(...localAudioStreamRef.current.getTracks());
    if (localVideoStreamRef.current) tracks.push(...localVideoStreamRef.current.getTracks());
    const composed = new MediaStream(tracks);
    setLocalStream(composed);
    localStreamRef.current = composed;
  };

  const renegotiate = async () => {
    if (!localStream) return;
    for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp } });
      } catch (e) {
        console.error("Renegotiation failed", e);
      }
    }
  };

  const toggleMic = async () => {
    let audioStream = localAudioStreamRef.current || localAudioStream;

    // If no audio stream yet, request mic permission and create one
    if (!audioStream) {
      try {
        const newAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = newAudioStream.getAudioTracks()[0];

        setLocalAudioStream(newAudioStream);
        localAudioStreamRef.current = newAudioStream;
        setIsMicOn(true);

        // Attach audio track to all peer connections
        for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
          const sender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'audio');
          if (sender) {
            try { await sender.replaceTrack(newTrack); } catch (e) { console.error('replaceTrack audio failed', e); }
          } else {
            try { pc.addTrack(newTrack, newAudioStream); } catch (e) { console.error('addTrack audio failed', e); }
          }
        }

        // Update preview stream
        composeLocalStream();
        await renegotiate();
        return;
      } catch (e) {
        console.error('Failed to acquire microphone:', e);
        alert('Could not access microphone.');
        return;
      }
    }

    // Toggle enabled state on existing audio tracks (avoid removing sender.track)
    const audioTracks = audioStream.getAudioTracks();
    const newStatus = !isMicOn;
    audioTracks.forEach(t => t.enabled = newStatus);
    setIsMicOn(newStatus);

    // Ensure senders have a live track when unmuting
    if (newStatus) {
      const active = audioTracks.find(t => t.readyState === 'live') || audioTracks[0];
      if (active) {
        for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
          const sender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'audio');
          if (sender && sender.track !== active) {
            try { await sender.replaceTrack(active); } catch (e) { console.error('replaceTrack audio on unmute failed', e); }
          } else if (!sender) {
            // Only if we don't have a sender do we need to add track + negotiate
            try {
              pc.addTrack(active, audioStream);
              // In this rare case (sender missing), we MIGHT need renegotiation, 
              // but usually this path isn't hit for simple mute toggles.
            } catch (e) { console.error('addTrack audio on unmute failed', e); }
          }
        }
      }
    }

    // NO composeLocalStream() or renegotiate() here.
    // Changing 'enabled' does not require stream recreation or signaling.
    // This prevents the local video element from reloading (flickering).
  };

  const toggleCamera = async () => {
    // operate on localVideoStream only
    let videoStream = localVideoStreamRef.current || localVideoStream;

    if (isCameraOn) {
      if (!videoStream) return;
      // stop camera tracks that are not screen
      videoStream.getVideoTracks().forEach(t => {
        if (!t.label.includes('screen') && !(t.getSettings && (t.getSettings() as any).displaySurface)) {
          t.stop();
          videoStream!.removeTrack(t);
        }
      });
      setLocalVideoStream(videoStream.getTracks().length ? videoStream : null);
      localVideoStreamRef.current = localVideoStream;
      setIsCameraOn(false);

      // Update peers: clear video sender
      for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
        const sender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'video');
        if (sender) {
          try { await sender.replaceTrack(null); } catch (e) { console.error('replaceTrack null video failed', e); }
        }
      }

      composeLocalStream();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = stream.getVideoTracks()[0];

      // If we were screen sharing, stop it first (mutually exclusive video track for simplicity)
      if (isScreenSharing) {
        await stopScreenSharing();
      }

      // Set local video stream
      const newVideoStream = new MediaStream([videoTrack]);
      setLocalVideoStream(newVideoStream);
      localVideoStreamRef.current = newVideoStream;
      setIsCameraOn(true);

      // Update peers
      for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
        const sender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'video');
        if (sender) {
          try { await sender.replaceTrack(videoTrack); } catch (e) { console.error('replaceTrack video failed', e); }
        } else {
          try { pc.addTrack(videoTrack, newVideoStream); } catch (e) { console.error('addTrack video failed', e); }
        }
      }

      composeLocalStream();
      await renegotiate();
    } catch (e) {
      console.error('Failed to access camera', e);
    }
  };

  const startCall = async (recipientId: string) => {
    await startGroupCall([recipientId]);
  };

  const startGroupCall = async (recipientIds: string[]) => {
    if (!currentUser || recipientIds.length === 0) return;

    let stream = localStream;
    if (!stream) {
      try {
        // Start with Audio ON (permission wise) but Muted, Video OFF
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        // Important: Start MUTED by default as per requirement
        stream.getAudioTracks().forEach(t => t.enabled = false);
        setIsMicOn(false);
        setIsCameraOn(false);
      } catch (e) {
        console.error("Error getting user media", e);
        alert("Could not access microphone. Call cannot start.");
        return;
      }
      setLocalStream(stream);
    }

    setIsInCall(true);
    setActiveCallData({ participantIds: recipientIds });

    recipientIds.forEach(async (recipientId) => {
      try {
        const pc = createPeerConnection(recipientId);
        stream!.getTracks().forEach(track => pc.addTrack(track, stream!));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp } });
      } catch (e) {
        console.error(`Failed to call ${recipientId}`, e);
      }
    });
  };

  const addToCall = async (recipientId: string) => {
    if (!currentUser || !isInCall || !activeCallData) return;
    await initiateCallConnection(recipientId, true);
    setActiveCallData(prev => prev ? { ...prev, participantIds: [...prev.participantIds, recipientId] } : null);
  };

  const initiateCallConnection = async (recipientId: string, isAdding: boolean = false) => {
    try {
      let stream = localStream;

      // Ensure we have a stream
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          // Start Muted
          stream.getAudioTracks().forEach(t => t.enabled = false);
          setLocalStream(stream);
          setIsMicOn(false);
        }
        catch (e) { console.error("No audio device found"); return; }
      }

      const pc = createPeerConnection(recipientId);
      stream.getTracks().forEach(track => pc.addTrack(track, stream!));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('OFFER', recipientId, { sdp: { type: offer.type, sdp: offer.sdp } });
    } catch (err) { console.error("Error initiating connection:", err); }
  }

  const acceptIncomingCall = async () => {
    if (!incomingCall || !currentUser) return;
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        // Start Muted
        stream.getAudioTracks().forEach(t => t.enabled = false);
        setIsMicOn(false);
        setIsCameraOn(false);
      }
      catch (e) { console.error("Could not access microphone"); return; }
      setLocalStream(stream);

      const pc = createPeerConnection(incomingCall.callerId);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      if (incomingCall.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('ANSWER', incomingCall.callerId, { sdp: { type: answer.type, sdp: answer.sdp } });
      }

      setIsInCall(true);
      setActiveCallData({ participantIds: [incomingCall.callerId] });
      setIncomingCall(null);
    } catch (err) { console.error("Error accepting call:", err); }
  };

  const rejectIncomingCall = () => {
    if (incomingCall && currentUser) {
      sendSignal('HANGUP', incomingCall.callerId, {});
      setIncomingCall(null);
    }
  };

  const endCall = () => {
    if (activeCallData && currentUser) {
      activeCallData.participantIds.forEach(pid => { sendSignal('HANGUP', pid, {}); });
    }
    cleanupCall();
  };

  const handleRemoteHangup = (senderId: string) => {
    const pc = peerConnectionsRef.current.get(senderId);
    if (pc) { pc.close(); peerConnectionsRef.current.delete(senderId); }
    setRemoteStreams(prev => { const newMap = new Map(prev); newMap.delete(senderId); return newMap; });
    setActiveCallData(prev => {
      if (!prev) return null;
      const newIds = prev.participantIds.filter(id => id !== senderId);
      if (newIds.length === 0) { cleanupCall(); return null; }
      return { ...prev, participantIds: newIds };
    });
  };

  const cleanupCall = () => {
    // Stop audio and video streams explicitly
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach(t => t.stop());
      localAudioStreamRef.current = null;
      setLocalAudioStream(null);
    }
    if (localVideoStreamRef.current) {
      localVideoStreamRef.current.getTracks().forEach(t => t.stop());
      localVideoStreamRef.current = null;
      setLocalVideoStream(null);
    }
    peerConnectionsRef.current.forEach((pc: RTCPeerConnection) => pc.close());
    peerConnectionsRef.current.clear();
    setLocalStream(null);
    setRemoteStreams(new Map());
    setIsInCall(false);
    setActiveCallData(null);
    setIsScreenSharing(false);
    setIsMicOn(false);
    setIsCameraOn(false);
  };

  const stopScreenSharing = async () => {
    const vStream = localVideoStreamRef.current || localVideoStream;
    const aStream = localAudioStreamRef.current || localAudioStream;
    if (peerConnectionsRef.current.size === 0 || !vStream) return;
    try {

      let negotiationNeeded = false;
      let hasCameraFallback = false;

      // 1. If camera was on before screen share, re-acquire camera FIRST (Make-Before-Break)
      if (prevCameraWasOnRef.current) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const camTrack = camStream.getVideoTracks()[0];

          // Set new local state (this might briefly show camera + screen in memory, but UI will update)
          const newVideoStream = new MediaStream([camTrack]);
          setLocalVideoStream(newVideoStream);
          localVideoStreamRef.current = newVideoStream;
          setIsCameraOn(true);
          hasCameraFallback = true;

          // Replace tracks on all peers
          for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
              try {
                await sender.replaceTrack(camTrack);
                // Reset bitrate for camera (e.g. 1Mbps)
                const params = sender.getParameters();
                if (params.encodings && params.encodings[0]) {
                  params.encodings[0].maxBitrate = 1000000;
                  delete params.encodings[0].networkPriority;
                  await sender.setParameters(params);
                }
              } catch (e) { hasCameraFallback = false; console.error('replaceTrack camera failed', e); }
            } else {
              try {
                pc.addTrack(camTrack, newVideoStream);
                negotiationNeeded = true;
              } catch (e) { console.error('addTrack camera failed', e); }
            }
          }
        } catch (e) {
          console.error('Failed to re-acquire camera after screen stop:', e);
          // Fallback: clear video senders
          for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
              try { await sender.replaceTrack(null); } catch (e) { console.error('replaceTrack null video failed', e); }
            }
          }
        }
        prevCameraWasOnRef.current = false;
      } else {
        // No camera to restore: clear video senders
        for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            try { await sender.replaceTrack(null); } catch (e) { console.error('replaceTrack null video failed', e); }
          }
        }
      }

      // 2. NOW Stop and remove screen tracks (Break)
      vStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        if (track.label.includes('screen') || (track.getSettings && (track.getSettings() as any).displaySurface)) {
          track.stop();
          vStream.removeTrack(track); // Clean up the old stream object
        }
      });

      setIsScreenSharing(false);

      // Ensure audio senders still have correct audio track
      if (aStream) {
        const activeAudio = aStream.getAudioTracks().find(t => t.readyState === 'live');
        if (activeAudio) {
          for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
            const sender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'audio');
            if (sender && sender.track !== activeAudio) {
              try { await sender.replaceTrack(activeAudio); } catch (e) { console.error('replaceTrack audio failed', e); }
            }
          }
        }
      }

      // Update preview
      composeLocalStream();

      if (negotiationNeeded) {
        await renegotiate();
      }

      // Notify peers to update their remote preview state
      // IMPORTANT: Pass hasCameraFallback so they don't screen-black the video
      try { await sendSignal('SCREEN_STOPPED', undefined, { hasCameraFallback }); } catch (e) { /* non-fatal */ }
    } catch (e) {
      console.error('Error stopping screen share:', e);
    }
  };

  const toggleScreenShare = async () => {
    const vStream = localVideoStreamRef.current || localVideoStream;
    if (peerConnectionsRef.current.size === 0) return;

    if (isScreenSharing) {
      await stopScreenSharing();
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            // @ts-ignore
            cursor: 'always',
            height: { ideal: 1080 },
            frameRate: 30 // Fixed framerate provides better stability than variable max
          },
          audio: false // Explicitly disable audio to avoid mix-ups, or enable if system audio is desired
        });
        const screenTrack = displayStream.getVideoTracks()[0];

        // 'motion' is often better for general screen sharing (browsing, UI interaction) to avoid stalled frames
        // 'detail' optimizes for text but can drop frames heavily during transitions, causing "black screen"
        if ('contentHint' in screenTrack) (screenTrack as any).contentHint = 'motion';

        // Critical: degradationPreference 'maintain-resolution' ensures clarity over framerate
        // This prevents the browser from downscaling the image to keep up with FPS, which causes blurriness.
        const settings = screenTrack.getSettings();
        // @ts-ignore
        if (screenTrack.kind === 'video' && typeof screenTrack.contentHint !== 'undefined') {
          // We can't easily access RTCRtpSender from track alone to set degradationPreference directly here,
          // but we will do it on the sender below.
        }

        let oldCameraStream: MediaStream | null = null;

        // If camera is on, mark it. We will stop it AFTER replacing tracks to avoid black gap.
        if (isCameraOn) {
          prevCameraWasOnRef.current = true;
          if (localVideoStreamRef.current) {
            oldCameraStream = localVideoStreamRef.current;
            // setLocalVideoStream(null); // Don't nullify yet, transition first
          }
          setIsCameraOn(false);
        } else {
          prevCameraWasOnRef.current = false;
        }

        const newVideoStream = new MediaStream([screenTrack]);
        setLocalVideoStream(newVideoStream);
        localVideoStreamRef.current = newVideoStream;

        screenTrack.onended = () => { stopScreenSharing(); };

        let negotiationNeeded = false;

        // Update all peers
        for (const [recipientId, pc] of peerConnectionsRef.current.entries()) {
          const sender = pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.kind === 'video');
          if (sender) {
            try {
              await sender.replaceTrack(screenTrack);

              // Set degradation preference to maintain resolution (prevent blurring)
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];

              // 4.5 Mbps (4500000) provides very high quality 1080p
              params.encodings[0].maxBitrate = 4500000;
              // minBitrate removed to fix TS build error

              // Important: Prioritize resolution (sharpness) over frame rate
              // @ts-ignore
              params.degradationPreference = 'maintain-resolution';

              params.encodings[0].networkPriority = 'high';
              await sender.setParameters(params);
            } catch (e) {
              console.error('replaceTrack/setParameters screen failed', e);
              // Fallback if parameter setting fails (e.g. not supported in some states)
            }
          } else {
            try {
              const sender = pc.addTrack(screenTrack, newVideoStream);

              // Apply quality settings immediately for new tracks too
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              params.encodings[0].maxBitrate = 4500000;
              // @ts-ignore
              params.degradationPreference = 'maintain-resolution';
              params.encodings[0].networkPriority = 'high';
              await sender.setParameters(params);

              negotiationNeeded = true;
            } catch (e) { console.error('addTrack screen failed', e); }
          }
        }

        // NOW stop the old camera tracks (Make-Before-Break)
        if (oldCameraStream) {
          oldCameraStream.getVideoTracks().forEach(t => {
            t.stop();
            // oldCameraStream!.removeTrack(t); // Optional, stream is discarded anyway
          });
        }

        setIsScreenSharing(true);
        composeLocalStream();

        // Only renegotiate if we ADDED a track (topology change)
        // replaceTrack does not require renegotiation and skipping it prevents "glitch/blink"
        if (negotiationNeeded) {
          await renegotiate();
        }

        try { await sendSignal('SCREEN_STARTED', undefined, {}); } catch (e) { /* non-fatal */ }
      } catch (err: any) { console.error('Error starting screen share:', err); }
    }
  };

  // --- 4. Sync Users List with Presence Status ---
  useEffect(() => {
    setUsers(prev => prev.map(u => ({
      ...u,
      isOnline: presentIds.has(u.id)
    })));
  }, [presentIds]);

  return (
    <AppContext.Provider value={{
      currentUser, users, projects, tasks, messages, groups, notifications, incomingCall, isInCall, activeCallData,
      localStream, remoteStreams, isScreenSharing, isMicOn, isCameraOn, hasAudioDevice, hasVideoDevice,
      deletedMessageIds, clearChatHistory,
      login, logout, addUser, updateUser, deleteUser, addTask, updateTask, deleteTask, moveTask, addMessage, createGroup, updateGroup, deleteGroup, addProject, updateProject, deleteProject,
      triggerNotification, markNotificationRead, clearNotifications, markChatRead, getUnreadCount, totalUnreadChatCount,
      startCall, startGroupCall, addToCall, acceptIncomingCall, rejectIncomingCall, endCall, toggleScreenShare, toggleMic, toggleCamera,
      ringtone, setRingtone
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};