import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Plus, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { useToast } from '../contexts/ToastContext';
import type { DmConversation } from '../types';
import { CreateServerDialog, JoinServerDialog } from '../components/ServerDialogs';
import { DmChat } from '../components/dm/DmChat';
import { DmSidebar } from '../components/dm/DmSidebar';
import { NewDmDialog } from '../components/dm/NewDmDialog';
import { ServerRail } from '../components/app/ServerRail';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { Logo } from '../components/ui/Logo';

export function MessagesPage() {
  const { t } = useTranslation();
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { servers } = useAuth();
  const { conversations, unreadTotal, subscribe } = useRealtime();
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const conversation = conversations.find((entry) => entry.id === conversationId) ?? null;

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'dm-removed' && event.conversationId === conversationId) {
          toast.info(t('dms.removedToast'));
          navigate('/app', { replace: true });
        }
      }),
    [subscribe, conversationId, toast, t, navigate],
  );

  const openConversation = (entry: DmConversation) => {
    navigate(`/app/dms/${entry.id}`);
  };

  const closeNav = () => setNavOpen(false);

  const rail = (
    <ServerRail
      servers={servers}
      activeDms
      dmUnread={unreadTotal}
      onCreateServer={() => setCreateOpen(true)}
      onJoinServer={() => setJoinOpen(true)}
    />
  );

  return (
    <div className={cx('app-shell', 'dms-shell', conversation && 'is-dm-chat-open')}>
      {rail}

      <DmSidebar
        conversations={conversations}
        activeId={conversation?.id}
        onNew={() => setNewOpen(true)}
        onCreateServer={() => setCreateOpen(true)}
        onJoinServer={() => setJoinOpen(true)}
        onOpenNav={() => setNavOpen(true)}
      />

      {conversation ? (
        <DmChat key={conversation.id} conversation={conversation} onBack={() => navigate('/app')} />
      ) : (
        <section className="chat-panel dm-empty-panel">
          <div className="message-state">
            <EmptyState
              icon={<MessageCircle className="icon" />}
              title={t('dms.emptyPanelTitle')}
              body={t('dms.emptyPanelBody')}
              action={
                <div className="empty-action-row">
                  <Button
                    variant="primary"
                    onClick={() => setNewOpen(true)}
                    icon={<Plus className="icon" aria-hidden="true" />}
                  >
                    {t('dms.new')}
                  </Button>
                  {conversations.length === 0 && (
                    <>
                      <Button variant="soft" onClick={() => setCreateOpen(true)}>
                        {t('servers.create')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setJoinOpen(true)}
                        icon={<UserPlus className="icon" aria-hidden="true" />}
                      >
                        {t('servers.join')}
                      </Button>
                    </>
                  )}
                </div>
              }
            />
          </div>
        </section>
      )}

      <Drawer
        open={navOpen}
        onClose={closeNav}
        label={t('a11y.serverNavigation')}
        side="start"
        className="nav-drawer"
      >
        <Link to="/app" className="drawer-brand" onClick={closeNav}>
          <Logo size={36} withWordmark />
        </Link>
        <ServerRail
          servers={servers}
          variant="drawer"
          activeDms
          dmUnread={unreadTotal}
          onNavigate={closeNav}
          onCreateServer={() => {
            closeNav();
            setCreateOpen(true);
          }}
          onJoinServer={() => {
            closeNav();
            setJoinOpen(true);
          }}
        />
      </Drawer>

      <NewDmDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={openConversation}
      />
      <CreateServerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(server, createdChannelId) => {
          navigate(`/app/s/${server.id}/c/${createdChannelId}`);
        }}
      />
      <JoinServerDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={(server, joinedChannelId) => {
          navigate(
            joinedChannelId ? `/app/s/${server.id}/c/${joinedChannelId}` : `/app/s/${server.id}`,
          );
        }}
      />
    </div>
  );
}
