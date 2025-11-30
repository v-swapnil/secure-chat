import notifee, { AuthorizationStatus } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

/**
 * Push notification service for presence and match events
 * NEVER sends message content - only notifications about events
 */

export class PushNotificationService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Request permission
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.log('Push notifications permission denied');
        return;
      }

      // Get FCM token
      const token = await messaging().getToken();
      console.log('FCM Token:', token);

      // Create notification channel (Android)
      if (Platform.OS === 'android') {
        await notifee.createChannel({
          id: 'presence',
          name: 'Presence Notifications',
          importance: 4,
        });

        await notifee.createChannel({
          id: 'match',
          name: 'Match Notifications',
          importance: 4,
        });
      }

      // Handle foreground messages
      messaging().onMessage(async remoteMessage => {
        await this.handleNotification(remoteMessage);
      });

      // Handle background messages
      messaging().setBackgroundMessageHandler(async remoteMessage => {
        await this.handleNotification(remoteMessage);
      });

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
    }
  }

  private async handleNotification(remoteMessage: any) {
    const { data, notification } = remoteMessage;

    // Only handle presence and match events - NEVER message content
    if (data?.type === 'presence') {
      await this.showPresenceNotification(data);
    } else if (data?.type === 'match') {
      await this.showMatchNotification(data);
    }
  }

  private async showPresenceNotification(data: any) {
    await notifee.displayNotification({
      title: 'User Online',
      body: data.message || 'A user is now online',
      android: {
        channelId: 'presence',
        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },
      },
      ios: {
        categoryId: 'presence',
      },
    });
  }

  private async showMatchNotification(data: any) {
    await notifee.displayNotification({
      title: 'Match Found!',
      body: data.message || 'You have been matched with someone',
      android: {
        channelId: 'match',
        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },
      },
      ios: {
        categoryId: 'match',
      },
    });
  }

  async getFCMToken(): Promise<string | null> {
    try {
      return await messaging().getToken();
    } catch (error) {
      console.error('Failed to get FCM token:', error);
      return null;
    }
  }

  async requestPermission(): Promise<boolean> {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  }
}

export const pushService = new PushNotificationService();
