'use client';

import { ChatList } from '@/components/chat/ChatList';

export default function ChatPage() {
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Chat</h1></div>
      <div className="chatwrap only-list">
        <ChatList />
        <div className="thread placeholder"><p className="muted">Wähle links einen Chat oder starte einen neuen.</p></div>
      </div>
    </div>
  );
}
