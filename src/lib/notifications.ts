let audioContext: AudioContext | null = null;

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showDesktopNotification(title: string, body: string, icon?: string | null): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, {
      body,
      icon: icon || '/favicon.svg',
      badge: '/favicon.svg',
      silent: true,
      tag: 'datchord-message',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* Some browsers require a service worker; never block the chat. */
  }
}

export function playChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ??= new AudioContextClass();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const now = audioContext.currentTime;
    const notes = [
      { frequency: 659.25, start: 0, duration: 0.16 },
      { frequency: 880, start: 0.11, duration: 0.22 },
    ];
    for (const note of notes) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.05, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.duration + 0.02);
    }
  } catch {
    /* Audio is a nice-to-have. */
  }
}
