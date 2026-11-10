import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ScheduleItem } from '@/db/studytrack';
import type { FocusAlarmSound } from '@/settings/storage';

const CLASS_REMINDER_KIND = 'class-schedule-reminder';
const CLASS_CHANNEL_ID = 'class-reminders';

const FOCUS_SOUNDS: FocusAlarmSound[] = ['default', 'soft', 'chime', 'silent'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function requestAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function focusChannelId(sound: FocusAlarmSound): string {
  return `focus-timer-${sound}`;
}

async function configureAndroidChannels(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CLASS_CHANNEL_ID, {
    name: 'Class schedule reminders',
    description: 'Reminders one hour before scheduled classes',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });

  for (const sound of FOCUS_SOUNDS) {
    const channelSound =
      sound === 'soft' ? 'soft_alarm.wav' : sound === 'chime' ? 'chime_alarm.wav' : sound === 'silent' ? null : 'default';
    await Notifications.setNotificationChannelAsync(focusChannelId(sound), {
      name: `Focus timer (${sound})`,
      description: 'Alert when a focus session ends',
      importance: Notifications.AndroidImportance.HIGH,
      sound: channelSound,
      vibrationPattern: sound === 'silent' ? undefined : [0, 300, 150, 300],
    });
  }
}

export async function scheduleFocusAlarm(
  seconds: number,
  sound: FocusAlarmSound
): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (!(await requestAndroidNotificationPermission())) {
    throw new Error('Notifications are disabled. Allow StudyTrack notifications to use the focus timer alarm.');
  }

  await configureAndroidChannels();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Focus session complete',
      body: 'Your timer has finished. Take a short break!',
      data: { kind: 'focus-timer-alarm' },
      sound: sound === 'silent' ? false : sound === 'default' ? 'default' : `${sound === 'soft' ? 'soft' : 'chime'}_alarm.wav`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.floor(seconds)),
      channelId: focusChannelId(sound),
    },
  });
}

export async function cancelFocusAlarm(identifier: string | null): Promise<void> {
  if (!identifier || Platform.OS !== 'android') return;
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

function getReminderTime(schedule: ScheduleItem): { weekday: number; hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(schedule.start_time);
  if (!match || !Number.isInteger(schedule.day_of_week) || schedule.day_of_week < 0 || schedule.day_of_week > 6) {
    throw new Error(`Invalid start time or weekday for class "${schedule.title}".`);
  }

  const startMinutes = Number(match[1]) * 60 + Number(match[2]) - 60;
  const dayOffset = startMinutes < 0 ? -1 : 0;
  const reminderMinutes = (startMinutes + 24 * 60) % (24 * 60);
  const reminderDay = (schedule.day_of_week + dayOffset + 7) % 7;

  return {
    weekday: reminderDay + 1,
    hour: Math.floor(reminderMinutes / 60),
    minute: reminderMinutes % 60,
  };
}

export async function syncClassScheduleReminders(
  schedules: ScheduleItem[],
  enabled: boolean
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = scheduled.filter(
    (request) => request.content.data?.kind === CLASS_REMINDER_KIND
  );

  if (!enabled) {
    await Promise.all(existing.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    return;
  }

  if (schedules.length === 0) {
    await Promise.all(existing.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    return;
  }

  const reminders: { schedule: ScheduleItem; reminder: ReturnType<typeof getReminderTime> }[] = [];
  for (const schedule of schedules) {
    try {
      reminders.push({ schedule, reminder: getReminderTime(schedule) });
    } catch (error: unknown) {
      console.error(`[Notifications] Invalid class schedule "${schedule.title}" was not scheduled:`, error);
    }
  }

  if (reminders.length === 0) {
    await Promise.all(existing.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    return;
  }

  if (!(await requestAndroidNotificationPermission())) {
    throw new Error('Allow StudyTrack notifications in Android settings to receive class reminders.');
  }

  await configureAndroidChannels();
  const replacementIds: string[] = [];
  try {
    for (const { schedule, reminder } of reminders) {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Class in 1 hour',
          body: `${schedule.title}${schedule.location ? ` · ${schedule.location}` : ''}`,
          data: { kind: CLASS_REMINDER_KIND, scheduleId: schedule.id },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          ...reminder,
          channelId: CLASS_CHANNEL_ID,
        },
      });
      replacementIds.push(identifier);
    }
  } catch (error: unknown) {
    for (const identifier of replacementIds) {
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      } catch (cancelError: unknown) {
        console.error('[Notifications] Could not roll back a partially scheduled class reminder:', cancelError);
      }
    }
    throw error;
  }

  await Promise.all(existing.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}
