import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../store';
import { supabase } from '../supabaseClient';
import {
  Send, Phone, Mic, MicOff,
  Monitor, PhoneOff, Search, Users, ChevronLeft,
  Paperclip, FileText, Image as ImageIcon, X, Plus, Check, BellRing,
  Maximize2, Minimize2, PictureInPicture, UserPlus, Layout, MoreVertical, Trash2,
  PhoneMissed, Pin, PinOff, Maximize
} from 'lucide-react';
import { User, Attachment, Group, NotificationType } from '../types';
import { Modal } from '../components/Modal';

export const Communication: React.FC = () => {
  const {
    messages, addMessage, currentUser, users, groups, createGroup, markChatRead, getUnreadCount,
    startCall, startGroupCall, addToCall, endCall, isInCall, activeCallData, localStream, remoteStreams, isScreenSharing, toggleScreenShare,
    isMicOn, isCameraOn, toggleMic, deletedMessageIds, clearChatHistory, hasAudioDevice, updateGroup, deleteGroup
  } = useApp();

  // UI State
  const [selectedChat, setSelectedChat] = useState<User | Group | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [viewMode, setViewMode] = useState<'default' | 'fullscreen' | 'pip'>('default');
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  // Call UI State
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);

  // Chat Visibility State
  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>([]);
  const [manualChatIds, setManualChatIds] = useState<string[]>([]); // Chats manually opened via "New Chat"
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null); // For the 3-dot menu
  const [activeHeaderMenu, setActiveHeaderMenu] = useState(false); // For header 3-dot menu

  // Modal State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatSearchTerm, setNewChatSearchTerm] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedUserIdsForGroup, setSelectedUserIdsForGroup] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');

  // New Modals State
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [groupInfoModal, setGroupInfoModal] = useState<{ isOpen: boolean; group: Group } | null>(null);
  const [isAddingMembersToGroup, setIsAddingMembersToGroup] = useState(false);
  const [addMembersSearchTerm, setAddMembersSearchTerm] = useState('');
  const [selectedUserIdsToAdd, setSelectedUserIdsToAdd] = useState<string[]>([]);

  // Video Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  const isGroup = (chat: any): chat is Group => {
    return chat && 'memberIds' in chat;
  };

  const isUser = (chat: any): chat is User => {
    return chat && 'username' in chat;
  };

  // Switch chat view if an active call exists for a specific user and it's 1:1
  useEffect(() => {
    if (activeCallData && !selectedChat && activeCallData.participantIds.length === 1) {
      const partner = users.find(u => u.id === activeCallData.participantIds[0]);
      if (partner) {
        setSelectedChat(partner);
        setShowMobileChat(true);
      }
    }
  }, [activeCallData, users]);

  // Auto-mark messages as read when displayed
  useEffect(() => {
    if (!currentUser) return;

    // Determine current chat ID
    const currentChatId = selectedChat ? selectedChat.id : 'general';

    // Check if we assume the chat is visible
    // On mobile, showMobileChat must be true.
    // On desktop (md+), the chat area is always visible if selectedChat is set (or default Team Chat).
    const isMobile = window.innerWidth < 768; // 768px is md breakpoint
    if (isMobile && !showMobileChat) return;

    // Check if there are any unread messages for this chat
    const hasUnread = messages.some(m => {
      if (deletedMessageIds.has(m.id)) return false;

      const isTarget = (currentChatId === 'general' && !m.recipientId) ||
        (currentChatId.startsWith('g-') && m.recipientId === currentChatId) ||
        (m.senderId === currentChatId && m.recipientId === currentUser.id); // For DMs, sender is the chat ID

      return isTarget && !m.isRead && m.senderId !== currentUser.id;
    });

    if (hasUnread) {
      markChatRead(currentChatId);
    }
  }, [messages, selectedChat, showMobileChat, currentUser, markChatRead, deletedMessageIds]);

  // Handle auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isInCall, attachments, selectedChat, deletedMessageIds]);

  // Restore hidden chats if a new message arrives
  useEffect(() => {
    if (!currentUser) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && !deletedMessageIds.has(lastMessage.id)) {
      // If I receive a message from someone I hid, unhide them
      if (lastMessage.senderId !== currentUser.id && hiddenChatIds.includes(lastMessage.senderId)) {
        setHiddenChatIds(prev => prev.filter(id => id !== lastMessage.senderId));
      }
      // If I receive a group message for a hidden group, unhide it
      if (lastMessage.recipientId && hiddenChatIds.includes(lastMessage.recipientId) && lastMessage.senderId !== currentUser.id) {
        setHiddenChatIds(prev => prev.filter(id => id !== lastMessage.recipientId));
      }
    }
  }, [messages, currentUser, hiddenChatIds, deletedMessageIds]);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current) {
      if (!localStream) {
        localVideoRef.current.srcObject = null;
      } else {
        localVideoRef.current.srcObject = localStream;
      }
    }
  }, [localStream, isInCall, viewMode, isCameraOn, isScreenSharing]);

  // Reset view mode when call ends
  useEffect(() => {
    if (!isInCall) {
      setViewMode('default');
      setPinnedUserId(null);
    }
  }, [isInCall]);

  // Close menu on click outside (simple implementation)
  useEffect(() => {
    const closeMenu = () => {
      setActiveMenuId(null);
      setActiveHeaderMenu(false);
    };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() || attachments.length > 0) {
      // Upload files if any
      const finalAttachments = await Promise.all(attachments.map(async (att) => {
        const file = fileMapRef.current.get(att.id);
        if (file) {
          try {
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file);

            if (uploadError) {
              console.error('File upload error:', uploadError);
              return att;
            }

            const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(fileName);
            return { ...att, url: publicUrl };
          } catch (err) {
            console.error('File processing error:', err);
            return att;
          }
        }
        return att;
      }));

      addMessage(inputText, selectedChat?.id, finalAttachments);
      setInputText('');
      setAttachments([]);
      fileMapRef.current.clear();

      // Ensure the chat remains visible if it was manual
      if (selectedChat) {
        setManualChatIds(prev => [...prev, selectedChat.id]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newAttachments: Attachment[] = Array.from(e.target.files).map((file: File) => {
        const id = Date.now().toString() + Math.random();
        fileMapRef.current.set(id, file);
        return {
          id,
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          type: file.type,
          url: URL.createObjectURL(file)
        };
      });
      setAttachments(prev => [...prev, ...newAttachments]);
      e.target.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
    fileMapRef.current.delete(id);
  };

  const handleChatSelect = (chat: User | Group | null) => {
    setSelectedChat(chat);
    setShowMobileChat(true);

    // Mark as read
    const chatId = chat ? chat.id : 'general';
    markChatRead(chatId);
  };

  const handleHideChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setHiddenChatIds(prev => [...prev, chatId]);
    setManualChatIds(prev => prev.filter(id => id !== chatId));
    if (selectedChat?.id === chatId) {
      setSelectedChat(null);
    }
    setActiveMenuId(null);
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    // Check if it is a group and if we are the creator (for "Delete Group" option which is separate, but "Delete Chat" usually means clear history/hide)
    // For now, "Delete Chat" simply hides/clears history as per standard behavior.

    setConfirmModal({
      isOpen: true,
      title: 'Delete Chat',
      message: 'Are you sure you want to delete this chat? This will clear your chat history locally and hide the conversation.',
      onConfirm: async () => {
        await clearChatHistory(chatId);
        setHiddenChatIds(prev => [...prev, chatId]);
        setManualChatIds(prev => prev.filter(id => id !== chatId));
        setActiveMenuId(null);
        setActiveHeaderMenu(false);
        setConfirmModal(null);
        if (selectedChat?.id === chatId) {
          setSelectedChat(null);
          setShowMobileChat(false);
        }
      }
    });
  };

  const handleDeepDeleteGroup = (e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Group Permanently',
      message: 'Are you sure you want to delete this group for EVERYONE? This action cannot be undone and will remove the group and all messages.',
      onConfirm: async () => {
        await deleteGroup(groupId);
        setActiveMenuId(null);
        setActiveHeaderMenu(false);
        setConfirmModal(null);
        if (selectedChat?.id === groupId) {
          setSelectedChat(null);
          setShowMobileChat(false);
        }
      }
    });
  };

  const removeMember = async (groupId: string, memberId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const newMemberIds = group.memberIds.filter(id => id !== memberId);
    await updateGroup({ ...group, memberIds: newMemberIds });
  };

  const handleAddMembers = async () => {
    if (!groupInfoModal || selectedUserIdsToAdd.length === 0) return;
    const group = groups.find(g => g.id === groupInfoModal.group.id);
    if (group) {
      const newMemberIds = Array.from(new Set([...group.memberIds, ...selectedUserIdsToAdd]));
      await updateGroup({ ...group, memberIds: newMemberIds });
      // Update local modal data optimistically
      setGroupInfoModal(prev => prev ? { ...prev, group: { ...prev.group, memberIds: newMemberIds } } : null);
    }
    setIsAddingMembersToGroup(false);
    setSelectedUserIdsToAdd([]);
    setAddMembersSearchTerm('');
  };

  const handleStartCall = () => {
    if (selectedChat && isUser(selectedChat)) {
      startCall(selectedChat.id);
    } else {
      // Team Chat or Group Chat
      let recipients: string[] = [];

      if (!selectedChat) {
        // Team Chat: Invite all other users
        recipients = users.filter(u => u.id !== currentUser?.id).map(u => u.id);
      } else if (isGroup(selectedChat)) {
        // Group Chat: Invite all other group members
        recipients = selectedChat.memberIds.filter(id => id !== currentUser?.id);
      }

      if (recipients.length > 0) {
        startGroupCall(recipients);
      }
    }
  };

  const handleInviteUser = (userId: string) => {
    addToCall(userId);
    setIsInviteModalOpen(false);
  };

  const handleCreateChat = async () => {
    if (selectedUserIdsForGroup.length === 0) return;

    if (selectedUserIdsForGroup.length === 1) {
      // 1:1 Chat
      const user = users.find(u => u.id === selectedUserIdsForGroup[0]);
      if (user) {
        // Unhide if hidden
        setHiddenChatIds(prev => prev.filter(id => id !== user.id));
        // Mark as manually opened
        setManualChatIds(prev => [...prev, user.id]);
        handleChatSelect(user);
      }
    } else {
      // Group Chat
      if (!newGroupName.trim()) return;
      const newGroupId = await createGroup(newGroupName, selectedUserIdsForGroup);
      if (newGroupId) {
        setManualChatIds(prev => [...prev, newGroupId]);
      }
    }
    setIsNewChatModalOpen(false);
    setNewChatSearchTerm('');
    setSelectedUserIdsForGroup([]);
    setNewGroupName('');
  };

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIdsForGroup.length === 0) {
      setSelectedUserIdsForGroup([userId]);
      return;
    }

    if (selectedUserIdsForGroup.includes(userId)) {
      setSelectedUserIdsForGroup(prev => prev.filter(id => id !== userId));
    } else {
      setSelectedUserIdsForGroup(prev => [...prev, userId]);
    }
  };

  // Helper to get last message timestamp for sorting, IGNORING deleted messages
  const getLastMsgTimestamp = (chatId: string, isGroupChat: boolean) => {
    const relevantMsgs = messages.filter(m => {
      if (deletedMessageIds.has(m.id)) return false; // Ignore deleted
      if (isGroupChat) {
        return m.recipientId === chatId;
      } else {
        return (m.senderId === currentUser?.id && m.recipientId === chatId) ||
          (m.senderId === chatId && m.recipientId === currentUser?.id);
      }
    });
    return relevantMsgs.length > 0 ? relevantMsgs[relevantMsgs.length - 1].timestamp : 0;
  };

  // Logic to determine if a user/group should be shown in sidebar
  const isChatVisible = (id: string, isGroupChat: boolean) => {
    if (hiddenChatIds.includes(id)) return false;
    if (manualChatIds.includes(id)) return true; // Explicitly opened

    // Check history (excluding deleted)
    const hasHistory = messages.some(m => {
      if (deletedMessageIds.has(m.id)) return false;
      if (isGroupChat) return m.recipientId === id;
      return (m.senderId === currentUser?.id && m.recipientId === id) ||
        (m.senderId === id && m.recipientId === currentUser?.id);
    });

    return hasHistory;
  };

  // Filter messages based on selection and deleted status
  const currentMessages = messages.filter(msg => {
    if (deletedMessageIds.has(msg.id)) return false;

    if (!selectedChat) {
      return !msg.recipientId;
    } else if (isGroup(selectedChat)) {
      return msg.recipientId === selectedChat.id;
    } else {
      return (msg.senderId === currentUser?.id && msg.recipientId === selectedChat.id) ||
        (msg.senderId === selectedChat.id && msg.recipientId === currentUser?.id);
    }
  });

  const filteredUsers = users
    .filter(u =>
      u.id !== currentUser?.id &&
      (u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase())) &&
      isChatVisible(u.id, false)
    )
    .sort((a, b) => getLastMsgTimestamp(b.id, false) - getLastMsgTimestamp(a.id, false));

  const filteredGroups = groups
    .filter(g =>
      g.memberIds.includes(currentUser?.id || '') &&
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      isChatVisible(g.id, true)
    )
    .sort((a, b) => getLastMsgTimestamp(b.id, true) - getLastMsgTimestamp(a.id, true));

  // --- Call Interface Component ---
  const CallInterface = () => {
    const mainStageRef = useRef<HTMLDivElement>(null);
    // Determine the main "Spotlight" user
    // Priority: Pinned User > Someone with Video (Screen Sharing or Camera) > First Remote
    let spotlightUserId: string | null = pinnedUserId;

    if (!spotlightUserId) {
      // Find anyone screen sharing or with video
      const sharerId = Array.from(remoteStreams.entries()).find(([_, stream]) => stream.getVideoTracks().length > 0)?.[0];
      spotlightUserId = sharerId || activeCallData?.participantIds[0] || null;
    }

    const isLocalPinned = pinnedUserId === currentUser?.id;

    // Resolve spotlight stream/user data
    let spotlightStream: MediaStream | null = null;
    let spotlightUser: User | undefined;

    if (isLocalPinned && localStream) {
      spotlightStream = localStream;
      spotlightUser = currentUser!;
    } else if (spotlightUserId) {
      spotlightStream = remoteStreams.get(spotlightUserId) || null;
      spotlightUser = users.find(u => u.id === spotlightUserId);
    }

    // Sidebar Users: All participants EXCEPT the one in spotlight
    // If local is pinned, sidebar is all remote.
    // If remote is pinned, sidebar is local + other remotes.
    const remoteParticipantIds = activeCallData?.participantIds || [];

    const showLocalInSidebar = !isLocalPinned;
    const sidebarRemoteIds = remoteParticipantIds.filter(id => id !== spotlightUserId);

    // Helper to check if a stream has video
    const hasVideoTrack = (stream: MediaStream | null | undefined) => {
      return stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;
    };

    return (
      <div className={`
        ${viewMode === 'fullscreen' ? 'fixed inset-0 z-[100] bg-slate-900' : ''}
        ${viewMode === 'pip' ? 'fixed bottom-4 right-4 z-[100] w-80 h-auto bg-slate-800 rounded-xl shadow-2xl border border-slate-700' : ''}
        ${viewMode === 'default' ? 'absolute inset-0 z-20 bg-slate-900' : ''}
        flex flex-col overflow-hidden transition-all duration-300
      `}>
        {/* ... Call Header ... */}
        <div className={`
           absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start 
           bg-gradient-to-b from-black/60 to-transparent pointer-events-none
           ${viewMode === 'pip' ? 'p-2' : ''}
         `}>
          {/* ... */}
          <div className="flex items-center text-white pointer-events-auto">
            {activeCallData && !viewMode.includes('pip') && (
              <div className="bg-red-500/80 px-3 py-1 rounded-full text-xs font-semibold animate-pulse mr-3 flex items-center">
                <div className="w-2 h-2 bg-white rounded-full mr-2"></div>
                Live Call
                {activeCallData.participantIds.length > 0 && <span className="ml-2 text-[10px] opacity-80">({activeCallData.participantIds.length + 1} People)</span>}
              </div>
            )}
          </div>

          <div className="flex space-x-2 pointer-events-auto">
            {viewMode !== 'pip' && (
              <button
                onClick={() => setViewMode('pip')}
                className="p-2 bg-black/20 hover:bg-black/40 text-white rounded-lg transition-colors backdrop-blur-sm"
                title="Picture in Picture"
              >
                <PictureInPicture size={20} />
              </button>
            )}

            <button
              onClick={() => setViewMode(viewMode === 'fullscreen' ? 'default' : 'fullscreen')}
              className="p-2 bg-black/20 hover:bg-black/40 text-white rounded-lg transition-colors backdrop-blur-sm"
              title={viewMode === 'fullscreen' ? "Exit Full Screen" : "Full Screen"}
            >
              {viewMode === 'fullscreen' ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>

        {/* Main Layout Area */}
        <div className={`flex-1 flex overflow-hidden ${viewMode === 'pip' ? 'block' : 'flex-col md:flex-row'}`}>

          {viewMode === 'pip' ? (
            // --- PiP View ---
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group">
              {spotlightUserId ? (
                <RemoteVideoPlayer stream={spotlightStream || new MediaStream()} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-xs">Waiting...</div>
              )}
              <button
                onClick={() => setViewMode('default')}
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Maximize2 className="text-white" size={24} />
              </button>
            </div>
          ) : (
            // --- Standard/Fullscreen View ---
            <>
              {/* 1. Main Stage (Spotlight) */}
              <div ref={mainStageRef} className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
                {spotlightUser ? (
                  <div className="w-full h-full relative">
                    {/* ALWAYS Render Video Player if stream exists to ensure Audio plays */}
                    {spotlightStream && (
                      <div className="absolute inset-0 z-0">
                        <RemoteVideoPlayer stream={spotlightStream} isMainStage={true} />
                      </div>
                    )}

                    {/* If Video is missing, show Avatar Overlay */}
                    {(!spotlightStream || !hasVideoTrack(spotlightStream)) && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900">
                        <img src={spotlightUser?.avatar} className="w-24 h-24 rounded-full border-4 border-slate-700 opacity-50 mb-4 animate-pulse" />
                        <span className="text-slate-400 text-lg">{spotlightUser?.name}</span>
                        <span className="text-slate-500 text-sm mt-2 flex items-center"><Mic size={14} className="mr-1" /> Audio Only</span>
                      </div>
                    )}

                    <div className="absolute bottom-6 left-6 text-white font-medium flex items-center bg-black/40 px-4 py-2 rounded-full text-base backdrop-blur-sm z-20">
                      {spotlightUser?.name || 'Unknown'} {isLocalPinned && '(You)'}
                    </div>

                    {/* Unpin & Fullscreen Buttons */}
                    <div className="absolute top-20 right-4 flex flex-col space-y-2 z-30">
                      {pinnedUserId && (
                        <button
                          onClick={() => setPinnedUserId(null)}
                          className="p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-colors"
                          title="Unpin"
                        >
                          <PinOff size={20} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (document.fullscreenElement) {
                            document.exitFullscreen().catch(err => console.error(err));
                          } else {
                            mainStageRef.current?.requestFullscreen().catch(err => console.error(err));
                          }
                        }}
                        className="p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-colors md:hidden"
                        title="Full Screen"
                      >
                        <Maximize size={20} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 animate-pulse">
                      <Users size={32} className="opacity-50" />
                    </div>
                    <p>Waiting for others to join...</p>
                  </div>
                )}
              </div>

              {/* 2. Sidebar (Sideways Column) */}
              <div className="w-full md:w-64 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-row md:flex-col p-3 mb-28 md:mb-0 space-x-3 md:space-x-0 md:space-y-3 overflow-x-auto md:overflow-y-auto shrink-0 z-10 no-scrollbar">

                {/* Local User Card (Only if not pinned) */}
                {showLocalInSidebar && (
                  <div className="relative shrink-0 w-40 md:w-full aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-md group">
                    {/* Show local video only if screen sharing or camera is on */}
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className={`w-full h-full object-cover transform ${!isScreenSharing ? 'scale-x-[-1]' : ''} ${(!isScreenSharing && !isCameraOn) ? 'hidden' : ''}`}
                    />
                    {!isScreenSharing && !isCameraOn && (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800">
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center mb-1">
                          <span className="text-white text-xs font-bold">YOU</span>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 text-white text-xs font-medium bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                      You {!isMicOn && <MicOff size={10} className="inline ml-1 text-red-400" />}
                    </div>
                    <button
                      onClick={() => setPinnedUserId(currentUser!.id)}
                      className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-indigo-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                      title="Pin Yourself"
                    >
                      <Pin size={14} />
                    </button>
                  </div>
                )}

                {/* Remote Users in Sidebar */}
                {sidebarRemoteIds.map(userId => {
                  const user = users.find(u => u.id === userId);
                  const stream = remoteStreams.get(userId);
                  const hasVideo = hasVideoTrack(stream);

                  return (
                    <div key={userId} className="relative shrink-0 w-40 md:w-full aspect-video bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-md group">
                      {/* Always render player for Audio */}
                      {stream && <RemoteVideoPlayer stream={stream} />}

                      {/* Overlay if no video */}
                      {!hasVideo && (
                        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-slate-800 z-10">
                          <img src={user?.avatar} className="w-8 h-8 rounded-full opacity-50 mb-1" />
                          <span className="text-[10px] text-slate-400">Connected</span>
                        </div>
                      )}

                      <div className="absolute bottom-2 left-2 text-white text-xs font-medium bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm truncate max-w-[90%] z-20">
                        {user?.name}
                      </div>
                      <button
                        onClick={() => setPinnedUserId(userId)}
                        className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-indigo-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                        title="Pin User"
                      >
                        <Pin size={14} />
                      </button>
                    </div>
                  );
                })}

                {/* Invite Placeholder if few people */}
                {activeCallData && activeCallData.participantIds.length < 3 && (
                  <button
                    onClick={() => setIsInviteModalOpen(true)}
                    className="shrink-0 w-40 md:w-full aspect-video bg-slate-800/50 rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-slate-800 transition-all"
                  >
                    <UserPlus size={20} className="mb-2" />
                    <span className="text-xs font-medium">Add Member</span>
                  </button>
                )}

              </div>
            </>
          )}
        </div>

        {/* Call Controls */}
        {viewMode !== 'pip' && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 z-50">
            <div className="bg-slate-900/90 backdrop-blur-md rounded-full px-6 py-3 border border-slate-700 shadow-2xl flex items-center space-x-4">
              <button
                onClick={toggleMic}
                disabled={!hasAudioDevice}
                className={`p-3 rounded-full transition-transform hover:scale-110 ${!isMicOn ? 'bg-red-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'} ${!hasAudioDevice ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={!hasAudioDevice ? "No microphone detected" : (isMicOn ? "Mute" : "Unmute")}
              >
                {!isMicOn ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                onClick={toggleScreenShare}
                className={`p-3 rounded-full transition-transform hover:scale-110 ${isScreenSharing ? 'bg-blue-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                title="Share Screen"
              >
                <Monitor size={20} />
              </button>
              <div className="w-px h-8 bg-slate-700 mx-2"></div>
              <button onClick={() => setIsInviteModalOpen(true)} className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg transition-transform hover:scale-110" title="Add People"><UserPlus size={20} /></button>
              <button onClick={endCall} className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg transition-transform hover:scale-110" title="End Call"><PhoneOff size={20} /></button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- Invite Modal ---
  const InviteModal = () => {
    const [inviteSearch, setInviteSearch] = useState('');

    // Reset search when modal opens/closes
    useEffect(() => {
      if (!isInviteModalOpen) setInviteSearch('');
    }, [isInviteModalOpen]);

    const availableUsers = users.filter(u =>
      u.id !== currentUser?.id &&
      !activeCallData?.participantIds.includes(u.id) &&
      (u.name.toLowerCase().includes(inviteSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(inviteSearch.toLowerCase()))
    );

    return (
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Add Member to Call"
        maxWidth="max-w-xl"
        className="h-[550px]"
        noScroll={true}
      >
        <div className="flex flex-col h-full p-6 space-y-5">
          <div className="relative shrink-0">
            <Search size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search for people to invite..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-base shadow-sm"
              autoFocus
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
            {availableUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-slate-100 hover:border-indigo-100 transition-all group">
                <div className="flex items-center min-w-0">
                  <div className="relative mr-4 shrink-0">
                    <img src={user.avatar} className="w-12 h-12 rounded-full border border-slate-200" alt={user.name} />
                    <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${user.isOnline ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-800 text-sm truncate">{user.name}</span>
                    <span className="text-xs text-slate-500 truncate">@{user.username || 'user'}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleInviteUser(user.id)}
                  className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors flex items-center shadow-sm shrink-0"
                  title="Call User"
                >
                  <Phone size={18} className="mr-2" />
                  <span className="text-xs font-bold uppercase">Call</span>
                </button>
              </div>
            ))}

            {availableUsers.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <Users size={40} className="mb-3 opacity-20" />
                <p className="font-medium text-sm">No other users available to add.</p>
                <p className="text-xs opacity-70 mt-1">Everyone is already here!</p>
              </div>
            )}
          </div>

          <div className="shrink-0 pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => setIsInviteModalOpen(false)}
              className="px-6 py-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div className="flex flex-1 bg-white md:rounded-xl md:shadow-sm md:border md:border-slate-200 overflow-hidden md:m-6 m-0 relative">

      {/* Call Interface Injection */}
      {isInCall && <CallInterface />}
      <InviteModal />

      {/* --- LEFT SIDEBAR (User List) --- */}
      <div className={`
        w-full md:w-80 bg-slate-50 border-r border-slate-200 flex flex-col
        ${showMobileChat ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-800">Messages</h2>
            </div>
            <button
              onClick={() => setIsNewChatModalOpen(true)}
              className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
              title="New Chat / Group"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search people & groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-lg py-2.5 pl-9 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Team Chat Option */}
          <button
            onClick={() => handleChatSelect(null)}
            className={`w-full flex items-center p-3 rounded-lg transition-colors ${selectedChat === null ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-white hover:shadow-sm text-slate-700'
              }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 relative ${selectedChat === null ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
              <Users size={20} />
              {getUnreadCount('general') > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
              )}
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Team Chat</div>
              <div className="text-xs opacity-70 truncate">General channel</div>
            </div>
          </button>

          {/* Groups Section */}
          {filteredGroups.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">Groups</div>
              {filteredGroups.map(group => (
                <div key={group.id} className="relative group/item">
                  <button
                    onClick={() => handleChatSelect(group)}
                    className={`w-full flex items-center p-3 rounded-lg transition-colors ${isGroup(selectedChat) && selectedChat.id === group.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-white hover:shadow-sm text-slate-700'
                      }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 border border-blue-200 relative">
                      <span className="font-bold text-xs">{group.name.substring(0, 2).toUpperCase()}</span>
                      {/* Red Dot for Unread Group Messages */}
                      {getUnreadCount(group.id) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0 pr-6">
                      <div className="flex justify-between items-baseline">
                        <div className="font-semibold text-sm truncate">{group.name}</div>
                        {getLastMsgTimestamp(group.id, true) > 0 && (
                          <span className="text-[10px] opacity-60 ml-2 whitespace-nowrap">
                            {new Date(getLastMsgTimestamp(group.id, true)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="text-xs opacity-70 truncate">{group.memberIds.length} members</div>
                    </div>
                  </button>
                  {/* Context Menu Button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === group.id ? null : group.id); }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded opacity-0 group-hover/item:opacity-100 transition-opacity"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {activeMenuId === group.id && (
                    <div className="absolute right-0 top-8 bg-white shadow-xl border border-slate-100 rounded-lg z-50 w-36 py-1">
                      <button
                        onClick={(e) => handleHideChat(e, group.id)}
                        className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center"
                      >
                        <X size={12} className="mr-2" /> Hide Chat
                      </button>
                      <button
                        onClick={(e) => handleDeleteChat(e, group.id)}
                        className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
                      >
                        <Trash2 size={12} className="mr-2" /> Delete Chat
                      </button>
                      {/* Admin Option: Permanently Delete Group */}
                      {(currentUser?.role === 'ADMIN' || group.createdBy === currentUser?.id) && (
                        <button
                          onClick={(e) => handleDeepDeleteGroup(e, group.id)}
                          className="w-full text-left px-4 py-2 text-xs text-red-700 font-bold hover:bg-red-100 flex items-center border-t border-red-100"
                        >
                          <Trash2 size={12} className="mr-2 fill-current" /> Delete Group
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* DMs Section */}
          <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">Direct Messages</div>

          {filteredUsers.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-slate-400 italic">
              No active conversations. <br />Start a new chat!
            </div>
          )}

          {filteredUsers.map(user => {
            const lastMsg = messages.filter(m =>
              !deletedMessageIds.has(m.id) &&
              ((m.senderId === user.id && m.recipientId === currentUser?.id) ||
                (m.senderId === currentUser?.id && m.recipientId === user.id))
            ).pop();
            const unread = getUnreadCount(user.id);

            return (
              <div key={user.id} className="relative group/item">
                <button
                  onClick={() => handleChatSelect(user)}
                  className={`w-full flex items-center p-3 rounded-lg transition-colors ${isUser(selectedChat) && selectedChat.id === user.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-white hover:shadow-sm text-slate-700'
                    }`}
                >
                  <div className="relative mr-3">
                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full border border-slate-200" />
                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${user.isOnline ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                    {/* Red Dot for Unread DMs */}
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0 pr-6">
                    <div className="flex justify-between items-baseline">
                      <div className={`text-sm truncate ${unread > 0 ? 'font-bold text-slate-900' : 'font-semibold'}`}>{user.name}</div>
                      {lastMsg && (
                        <span className="text-[10px] opacity-60 ml-2 whitespace-nowrap">
                          {new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <div className={`text-xs truncate ${unread > 0 ? 'font-medium text-slate-800' : 'opacity-70'}`}>
                      {lastMsg
                        ? (lastMsg.type === 'missed_call' ? '📞 Missed Call' : lastMsg.attachments?.length ? `📎 ${lastMsg.attachments.length} attachment(s)` : lastMsg.text)
                        : 'Start a conversation'}
                    </div>
                  </div>
                </button>
                {/* Context Menu Button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === user.id ? null : user.id); }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded opacity-0 group-hover/item:opacity-100 transition-opacity"
                >
                  <MoreVertical size={16} />
                </button>
                {activeMenuId === user.id && (
                  <div className="absolute right-0 top-8 bg-white shadow-xl border border-slate-100 rounded-lg z-50 w-36 py-1">
                    <button
                      onClick={(e) => handleHideChat(e, user.id)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 flex items-center"
                    >
                      <X size={12} className="mr-2" /> Hide Chat
                    </button>
                    <button
                      onClick={(e) => handleDeleteChat(e, user.id)}
                      className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
                    >
                      <Trash2 size={12} className="mr-2" /> Delete Chat
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- RIGHT CHAT AREA --- */}
      <div className={`
        flex-1 flex flex-col bg-white relative h-full min-h-0
        ${showMobileChat ? 'flex' : 'hidden md:flex'}
      `}>
        {/* Chat Header */}
        <div className="h-16 px-4 border-b border-slate-100 flex justify-between items-center bg-white shrink-0 z-10 shadow-sm relative">
          <div className="flex items-center">
            <button
              onClick={() => setShowMobileChat(false)}
              className="md:hidden mr-2 p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full"
            >
              <ChevronLeft size={20} />
            </button>

            {selectedChat ? (
              <div className="flex items-center">
                {isUser(selectedChat) ? (
                  <img src={selectedChat.avatar} className="w-9 h-9 rounded-full mr-3" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 font-bold text-xs">
                    {selectedChat.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div
                  className={`cursor-pointer group/headername ${isGroup(selectedChat) ? 'hover:opacity-80' : ''}`}
                  onClick={() => isGroup(selectedChat) && setGroupInfoModal({ isOpen: true, group: selectedChat })}
                  title={isGroup(selectedChat) ? "View Group Info" : ""}
                >
                  <h3 className="font-bold text-slate-800 text-sm flex items-center">
                    {selectedChat.name}
                    {isGroup(selectedChat) && <Users size={12} className="ml-1.5 opacity-40 group-hover/headername:opacity-100 transition-opacity" />}
                  </h3>
                  {isUser(selectedChat) ? (
                    <div className="flex items-center text-xs text-green-500">
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${selectedChat.isOnline ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                      {selectedChat.isOnline ? 'Online' : 'Offline'}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">
                      {(selectedChat as Group).memberIds.length} members
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Team Chat</h3>
                  <p className="text-xs text-slate-500">{users.length} members</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={handleStartCall}
              className={`p-2 rounded-full transition-colors ${isInCall ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
              title="Start Audio Call"
            >
              <Phone size={20} />
            </button>

            {selectedChat && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveHeaderMenu(!activeHeaderMenu); }}
                  className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                >
                  <MoreVertical size={20} />
                </button>
                {activeHeaderMenu && (
                  <div className="absolute right-0 top-10 bg-white shadow-xl border border-slate-100 rounded-lg z-50 w-40 py-1">
                    <button
                      onClick={(e) => handleDeleteChat(e, selectedChat.id)}
                      className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
                    >
                      <Trash2 size={14} className="mr-2" /> Delete Chat
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- Group Info Modal --- */}
        {
          groupInfoModal && (
            <Modal
              isOpen={groupInfoModal.isOpen}
              onClose={() => setGroupInfoModal(null)}
              title="Group Info"
              maxWidth="max-w-md"
              className="h-[500px]"
              noScroll={true} // We handle scrolling internally
            >
              <div className="flex flex-col h-full">
                {/* Header Info */}
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-2xl mb-3 shadow-sm border border-blue-200">
                    {groupInfoModal.group.name.substring(0, 2).toUpperCase()}
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">{groupInfoModal.group.name}</h3>
                  <p className="text-sm text-slate-500">{groupInfoModal.group.memberIds.length} members</p>
                  <p className="text-xs text-slate-400 mt-1">Created {new Date(groupInfoModal.group.createdAt).toLocaleDateString()}</p>
                </div>

                {/* Members List */}
                <div className="flex-1 overflow-y-auto p-2">
                  {!isAddingMembersToGroup ? (
                    <>
                      <h4 className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Members</h4>
                      <div className="space-y-1">
                        {groupInfoModal.group.memberIds.map(memberId => {
                          const user = users.find(u => u.id === memberId);
                          const isAdmin = groupInfoModal.group.createdBy === memberId;
                          const isMe = currentUser?.id === memberId;
                          const canRemove = (currentUser?.role === 'ADMIN' || groupInfoModal.group.createdBy === currentUser?.id) && memberId !== currentUser?.id;

                          return (
                            <div key={memberId} className="flex items-center justify-between p-3 mx-2 rounded-lg hover:bg-slate-50 group transition-colors">
                              <div className="flex items-center min-w-0">
                                <img src={user?.avatar || 'https://i.pravatar.cc/150?u=unknown'} className="w-8 h-8 rounded-full border border-slate-200 mr-3" />
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-800 flex items-center">
                                    {user?.name || 'Unknown User'}
                                    {isAdmin && <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded uppercase font-bold">Admin</span>}
                                    {isMe && <span className="ml-2 text-slate-400 text-xs">(You)</span>}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate">@{user?.username}</div>
                                </div>
                              </div>
                              {canRemove && (
                                <button
                                  onClick={() => {
                                    setConfirmModal({
                                      isOpen: true,
                                      title: "Remove User",
                                      message: `Are you sure you want to remove ${user?.name} from this group?`,
                                      onConfirm: async () => {
                                        await removeMember(groupInfoModal.group.id, memberId);
                                        setGroupInfoModal(prev => prev ? { ...prev, group: { ...prev.group, memberIds: prev.group.memberIds.filter(id => id !== memberId) } } : null);
                                        setConfirmModal(null);
                                      }
                                    });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                  title="Remove from group"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="p-4 space-y-4">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search users to add..."
                          className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          value={addMembersSearchTerm}
                          onChange={(e) => setAddMembersSearchTerm(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar">
                        {users
                          .filter(u => !groupInfoModal.group.memberIds.includes(u.id))
                          .filter(u => u.name.toLowerCase().includes(addMembersSearchTerm.toLowerCase()))
                          .map(user => (
                            <div
                              key={user.id}
                              onClick={() => {
                                if (selectedUserIdsToAdd.includes(user.id)) {
                                  setSelectedUserIdsToAdd(prev => prev.filter(id => id !== user.id));
                                } else {
                                  setSelectedUserIdsToAdd(prev => [...prev, user.id]);
                                }
                              }}
                              className={`flex items-center p-2 rounded-lg cursor-pointer border transition-colors ${selectedUserIdsToAdd.includes(user.id) ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}
                            >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${selectedUserIdsToAdd.includes(user.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                {selectedUserIdsToAdd.includes(user.id) && <Check size={10} />}
                              </div>
                              <img src={user.avatar} className="w-8 h-8 rounded-full border border-slate-200 mr-2" />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-800 truncate">{user.name}</div>
                                <div className="text-[10px] text-slate-500 truncate">@{user.username}</div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-100 bg-slate-50">
                  {(currentUser?.role === 'ADMIN' || groupInfoModal.group.createdBy === currentUser?.id) && (
                    !isAddingMembersToGroup ? (
                      <button
                        onClick={() => setIsAddingMembersToGroup(true)}
                        className="w-full py-2.5 bg-white border border-slate-200 text-indigo-600 font-bold text-sm rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        <UserPlus size={16} />
                        Add New Member
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setIsAddingMembersToGroup(false);
                            setSelectedUserIdsToAdd([]);
                          }}
                          className="flex-1 py-2.5 bg-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-300 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddMembers}
                          disabled={selectedUserIdsToAdd.length === 0}
                          className={`flex-1 py-2.5 font-bold text-sm rounded-xl shadow-lg transition-all ${selectedUserIdsToAdd.length > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'}`}
                        >
                          Add ({selectedUserIdsToAdd.length})
                        </button>
                      </div>
                    )
                  )}
                  {!isAddingMembersToGroup && (
                    <p className="text-[10px] text-center text-slate-400 mt-3">
                      Group created by {users.find(u => u.id === groupInfoModal.group.createdBy)?.name || 'Admin'}
                    </p>
                  )}
                </div>
              </div>
            </Modal>
          )
        }

        {/* --- Confirmation Modal --- */}
        {
          confirmModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 transform transition-all scale-100">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed">{confirmModal.message}</p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setConfirmModal(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmModal.onConfirm}
                    className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-lg shadow-red-200 transition-all"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {/* Main Content Area (Messages OR Call Interface Placeholder) */}
        {/* Messages List - using ref for container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 min-h-0"
        >
          {currentMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                <Send size={24} />
              </div>
              <p>No messages yet.</p>
              <p className="text-xs">Say hello to start the conversation!</p>
            </div>
          )}

          {currentMessages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser?.id;
            const sender = users.find(u => u.id === msg.senderId);
            const isMissedCall = msg.type === 'missed_call';

            // Logic for grouping
            const isLastInSequence = idx === currentMessages.length - 1 || currentMessages[idx + 1].senderId !== msg.senderId;
            const isFirstInSequence = idx === 0 || currentMessages[idx - 1].senderId !== msg.senderId;

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1 animate-in slide-in-from-bottom-1 duration-200`}>
                <div className={`flex max-w-[85%] md:max-w-[70%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end`}>

                  {/* Avatar Column */}
                  <div className={`w-6 h-6 shrink-0 flex flex-col justify-end ${isMe ? 'ml-2' : 'mr-2'}`}>
                    {isLastInSequence ? (
                      <img src={sender?.avatar} className="w-6 h-6 rounded-full shadow-sm border border-slate-100 object-cover" title={sender?.name} />
                    ) : (
                      <div className="w-6 h-6" />
                    )}
                  </div>

                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} min-w-0`}>
                    {/* Sender Name (Only for first message in sequence, and not me, and in group context) */}
                    {isFirstInSequence && !isMe && (selectedChat || isGroup(selectedChat)) && (
                      <span className="text-[10px] text-slate-400 mb-0.5 ml-1">{sender?.name}</span>
                    )}

                    {/* Message Bubble */}
                    <div className={`px-4 py-2 shadow-sm text-sm leading-relaxed max-w-full break-words ${isMissedCall
                      ? 'bg-red-50 border border-red-100 text-red-800 rounded-2xl'
                      : isMe
                        ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm'
                        : 'bg-white border border-slate-100 text-slate-800 rounded-2xl rounded-tl-sm'
                      }`}>
                      {isMissedCall ? (
                        <div className="flex items-center space-x-2">
                          <div className="p-1.5 bg-red-100 rounded-full shrink-0">
                            <PhoneMissed size={16} className="text-red-600" />
                          </div>
                          <span className="font-medium">Missed Call</span>
                        </div>
                      ) : (
                        <>
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className={`grid grid-cols-2 gap-2 ${msg.text ? 'mt-3 pt-2 border-t ' + (isMe ? 'border-indigo-500' : 'border-slate-100') : ''}`}>
                              {msg.attachments.map(att => (
                                <button
                                  key={att.id}
                                  onClick={() => att.url && setPreviewAttachment(att)}
                                  className={`flex flex-col p-2 rounded ${isMe ? 'bg-indigo-700 hover:bg-indigo-800' : 'bg-slate-50 hover:bg-slate-100'} transition-colors w-full text-left`}
                                >
                                  {att.type.startsWith('image/') ? (
                                    <img src={att.url} alt={att.name} className="w-full h-24 object-cover rounded mb-1 bg-black/10" />
                                  ) : (
                                    <div className="w-full h-24 flex items-center justify-center bg-black/5 rounded mb-1">
                                      <FileText size={24} className="opacity-50" />
                                    </div>
                                  )}
                                  <span className="text-[10px] truncate w-full block opacity-80">{att.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Timestamp Below */}
                    <span className={`text-[10px] text-slate-300 mt-1 ${isMe ? 'mr-1' : 'ml-1'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Area (Same as before) */}
        <div className="p-4 bg-white border-t border-slate-100 flex-shrink-0">
          {/* Attachment Previews */}
          {attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mb-3 pb-2">
              {attachments.map(att => (
                <div key={att.id} className="relative flex-shrink-0 group">
                  <div className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                    {att.type.startsWith('image/') ? (
                      <img src={att.url} className="w-full h-full object-cover" />
                    ) : (
                      <FileText size={24} className="text-slate-400" />
                    )}
                  </div>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-end space-x-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all"
              title="Add attachments"
            >
              <Paperclip size={20} />
            </button>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
            />

            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Message ${selectedChat ? selectedChat.name.split(' ')[0] : 'Team'}...`}
              className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-sm text-slate-800 placeholder-slate-400 py-3 max-h-32"
            />

            <button
              type="submit"
              disabled={!inputText.trim() && attachments.length === 0}
              className={`p-3 rounded-xl transition-all flex-shrink-0 ${inputText.trim() || attachments.length > 0
                ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:scale-105 active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div >

      {/* New Chat Modal (No changes here) */}
      < Modal
        isOpen={isNewChatModalOpen}
        onClose={() => { setIsNewChatModalOpen(false); setNewChatSearchTerm(''); }}
        title="Start New Chat"
        maxWidth="max-w-2xl"
        className="h-[600px]"
        noScroll={true}
      >
        <div className="flex flex-col h-full p-6 space-y-6">
          <div className="relative shrink-0">
            <Search size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-base"
              value={newChatSearchTerm}
              onChange={(e) => setNewChatSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
              {users
                .filter(u => u.id !== currentUser?.id)
                .filter(u => u.name.toLowerCase().includes(newChatSearchTerm.toLowerCase()) || u.username.toLowerCase().includes(newChatSearchTerm.toLowerCase()))
                .map(user => (
                  <div
                    key={user.id}
                    onClick={() => toggleUserSelection(user.id)}
                    className={`flex items-center p-3 rounded-xl cursor-pointer border transition-all ${selectedUserIdsForGroup.includes(user.id)
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                      }`}
                  >
                    <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center mr-3 transition-colors ${selectedUserIdsForGroup.includes(user.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {selectedUserIdsForGroup.includes(user.id) && <Check size={14} />}
                    </div>
                    <img src={user.avatar} className="w-10 h-10 rounded-full mr-3 border border-slate-200" alt={user.name} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-800 truncate">{user.name}</div>
                      <div className="text-xs text-slate-500 truncate">@{user.username || 'user'}</div>
                    </div>
                  </div>
                ))}
            </div>
            {users.filter(u => u.id !== currentUser?.id && (u.name.toLowerCase().includes(newChatSearchTerm.toLowerCase()) || u.username.toLowerCase().includes(newChatSearchTerm.toLowerCase()))).length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                <Search size={32} className="mb-2 opacity-50" />
                <p className="text-sm">No users found.</p>
              </div>
            )}
          </div>

          {selectedUserIdsForGroup.length > 1 && (
            <div className="shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Group Name</label>
              <input
                type="text"
                placeholder="e.g. Marketing Team"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              />
            </div>
          )}

          <div className="shrink-0 pt-5 border-t border-slate-100 flex justify-end space-x-3">
            <button
              onClick={() => { setIsNewChatModalOpen(false); setNewChatSearchTerm(''); }}
              className="px-5 py-2.5 text-slate-500 font-medium hover:bg-slate-100 hover:text-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateChat}
              disabled={selectedUserIdsForGroup.length === 0 || (selectedUserIdsForGroup.length > 1 && !newGroupName.trim())}
              className={`px-6 py-2.5 rounded-xl font-bold text-white shadow-lg transition-all transform active:scale-95 ${selectedUserIdsForGroup.length === 0 || (selectedUserIdsForGroup.length > 1 && !newGroupName.trim())
                ? 'bg-slate-300 shadow-none cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-0.5'
                }`}
            >
              {selectedUserIdsForGroup.length > 1 ? 'Create Group' : 'Start Chat'}
            </button>
          </div>
        </div>
      </Modal >
      <Modal
        isOpen={!!previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        title={previewAttachment?.name || 'Attachment Preview'}
        maxWidth="max-w-4xl"
        className="h-[80vh]"
      >
        <div className="w-full h-full flex items-center justify-center bg-slate-50">
          {previewAttachment && (
            <>
              {previewAttachment.type.startsWith('image/') ? (
                <img src={previewAttachment.url} alt={previewAttachment.name} className="max-w-full max-h-full object-contain" />
              ) : previewAttachment.type.startsWith('video/') ? (
                <video src={previewAttachment.url} controls className="max-w-full max-h-full" />
              ) : previewAttachment.type.startsWith('audio/') ? (
                <audio src={previewAttachment.url} controls />
              ) : (
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(previewAttachment.url || '')}&embedded=true`}
                  className="w-full h-full border-none"
                  title="Document Preview"
                />
              )}
            </>
          )}
        </div>
      </Modal>
    </div >
  );
};

// Helper component for remote videos to handle refs
const RemoteVideoPlayer: React.FC<{ stream: MediaStream; isMainStage?: boolean }> = ({ stream, isMainStage }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, forceUpdate] = useState(0);
  const [playError, setPlayError] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // Info: Track "enabled" vs "muted"
  // enabled = Controlled by the source (sender) - but typically reflected as muted=true on receiver if sender sets enabled=false? 
  // Actually, WebRTC spec says if sender disables track, receiver gets black frames (muted).
  // If sender stops track/replaces with null, receiver track gets muted.

  useEffect(() => {
    const checkVideoStatus = () => {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        setIsVideoMuted(videoTrack.muted || !videoTrack.enabled);

        // Add listeners for dynamic changes
        videoTrack.onmute = () => setIsVideoMuted(true);
        videoTrack.onunmute = () => setIsVideoMuted(false);
        // also listen to ended
        videoTrack.onended = () => setIsVideoMuted(true);
      } else {
        setIsVideoMuted(true);
      }
      forceUpdate(n => n + 1);
    };

    checkVideoStatus();

    const handleTrack = () => checkVideoStatus();
    stream.addEventListener('addtrack', handleTrack);
    stream.addEventListener('removetrack', handleTrack);

    return () => {
      stream.removeEventListener('addtrack', handleTrack);
      stream.removeEventListener('removetrack', handleTrack);
    };
  }, [stream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      // Explicitly call play to ensure audio/video starts
      const playPromise = videoRef.current.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setPlayError(false);
          })
          .catch(e => {
            if (e.name !== 'AbortError') {
              console.error("Autoplay failed:", e);
              setPlayError(true);
            }
          });
      }
    }
  }, [stream, stream.getTracks().length, stream.active]); // Added stream.active

  // Determine if we should show the video element or a placeholder
  const hasVideo = stream.getVideoTracks().length > 0 && !isVideoMuted;

  const retryPlay = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(console.error);
      setPlayError(false);
    }
  };

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Important: Remote streams must NOT be muted, otherwise you won't hear them.
        muted={false}
        className={`w-full h-full ${isMainStage ? 'object-contain bg-black' : 'object-cover'} ${!hasVideo ? 'opacity-0' : 'opacity-100'}`}
      />
      {playError && (
        <button
          onClick={retryPlay}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 text-white cursor-pointer"
        >
          <div className="bg-red-500 rounded-full p-4 mb-2 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
          <span className="font-bold text-sm">Click to Play Audio</span>
        </button>
      )}
    </div>
  );
};