import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuthStore } from '@/stores/authStore';
import { MobileCryptoEngine } from '@/crypto/engine';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { logout, userId, deviceId } = useAuthStore();

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          if (deviceId) {
            const crypto = new MobileCryptoEngine(deviceId);
            await crypto.clearAllKeys();
          }
          await logout();
          navigation.navigate('Login' as never);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Secure Chat</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Icon name="logout" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('RandomMatch' as never)}
        >
          <View style={styles.cardIcon}>
            <Icon name="shuffle" size={32} color="#0ea5e9" />
          </View>
          <Text style={styles.cardTitle}>Random Match Chat</Text>
          <Text style={styles.cardDescription}>
            Get matched with a random stranger based on your interests. Completely anonymous and
            end-to-end encrypted.
          </Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardFooterText}>Start matching</Text>
            <Icon name="arrow-forward" size={20} color="#0ea5e9" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardDisabled]}
          disabled
        >
          <View style={[styles.cardIcon, styles.cardIconDisabled]}>
            <Icon name="chat" size={32} color="#999" />
          </View>
          <Text style={[styles.cardTitle, styles.cardTitleDisabled]}>Direct Chat</Text>
          <Text style={styles.cardDescription}>
            Chat securely with verified users. Share safety numbers to verify identity and prevent
            man-in-the-middle attacks.
          </Text>
          <View style={styles.cardFooter}>
            <Text style={[styles.cardFooterText, styles.cardFooterTextDisabled]}>
              Coming soon
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Security Information</Text>
          <View style={styles.infoItem}>
            <Icon name="check-circle" size={20} color="#10b981" />
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>End-to-End Encryption:</Text> All messages are
              encrypted on your device before being sent.
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Icon name="check-circle" size={20} color="#10b981" />
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>Zero Message Storage:</Text> The server never stores
              your messages or conversations.
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Icon name="check-circle" size={20} color="#10b981" />
            <Text style={styles.infoText}>
              <Text style={styles.infoBold}>Perfect Forward Secrecy:</Text> Past messages cannot
              be decrypted even if keys are compromised.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#0ea5e9',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  cardIconDisabled: {
    backgroundColor: '#f3f4f6',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  cardTitleDisabled: {
    color: '#6b7280',
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 15,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardFooterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0ea5e9',
    marginRight: 5,
  },
  cardFooterTextDisabled: {
    color: '#9ca3af',
  },
  infoCard: {
    backgroundColor: '#e0f2fe',
    borderRadius: 12,
    padding: 20,
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#075985',
    marginBottom: 15,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#0c4a6e',
    marginLeft: 10,
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '600',
  },
});
