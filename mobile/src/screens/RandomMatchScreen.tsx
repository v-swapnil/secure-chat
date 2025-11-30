import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { authService } from '@/services/authService';
import { wsService } from '@/services/websocketService';
import { MobileCryptoEngine, hashQuestionnaireAnswers } from '@/crypto/engine';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@/types';

type MatchState = 'questionnaire' | 'searching' | 'matched' | 'chatting';

const QUESTIONNAIRE = [
  { id: 'interests', question: 'What are your main interests?', options: ['Tech', 'Art', 'Sports', 'Music', 'Gaming'] },
  { id: 'communication', question: 'Preferred communication style?', options: ['Casual', 'Deep', 'Funny', 'Serious', 'Mixed'] },
  { id: 'topics', question: 'Topics to discuss?', options: ['Life', 'Work', 'Hobbies', 'Philosophy', 'Random'] },
];

export default function RandomMatchScreen() {
  const [matchState, setMatchState] = useState<MatchState>('questionnaire');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [partnerId, setPartnerId] = useState<string>('');
  const [partnerKey, setPartnerKey] = useState<string>('');
  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [ephemeralKeyPair, setEphemeralKeyPair] = useState<any>(null);
  
  const navigation = useNavigation();
  const { deviceId } = useAuthStore();
  const scrollViewRef = useRef<FlatList>(null);
  const cryptoRef = useRef<MobileCryptoEngine | null>(null);

  useEffect(() => {
    if (deviceId && !cryptoRef.current) {
      cryptoRef.current = new MobileCryptoEngine(deviceId);
      cryptoRef.current.init().catch(console.error);
    }
  }, [deviceId]);

  useEffect(() => {
    if (matchState === 'chatting') {
      wsService.on('message', handleIncomingMessage);
      wsService.on('match-ended', handleMatchEnded);
      return () => {
        wsService.off('message');
        wsService.off('match-ended');
      };
    }
  }, [matchState, partnerKey]);

  const handleAnswerSelect = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleStartMatching = async () => {
    if (Object.keys(answers).length !== QUESTIONNAIRE.length) {
      Alert.alert('Incomplete', 'Please answer all questions before matching');
      return;
    }

    setLoading(true);
    setMatchState('searching');

    try {
      const crypto = cryptoRef.current;
      if (!crypto) throw new Error('Crypto not initialized');

      // Generate ephemeral keys for anonymous matching
      const ephemeralKP = crypto.generateEphemeralKeyPair();
      setEphemeralKeyPair(ephemeralKP);

      // Hash questionnaire answers
      const categoryTags = hashQuestionnaireAnswers(answers);

      // Join match queue
      await authService.joinMatchQueue(
        categoryTags,
        Buffer.from(ephemeralKP.publicKey).toString('base64'),
        'ephemeral-signed-prekey-placeholder'
      );

      // Poll for match
      const pollInterval = setInterval(async () => {
        try {
          const status = await authService.getMatchStatus();
          if (status.matched) {
            clearInterval(pollInterval);
            setPartnerId(status.partnerAnonymousId);
            setPartnerKey(status.partnerEphemeralKey);
            
            // Generate safety number
            const safety = crypto.generateSafetyNumber(status.partnerEphemeralKey);
            setSafetyNumber(safety);

            setMatchState('matched');
            setLoading(false);
          }
        } catch (error) {
          console.error('Failed to check match status:', error);
        }
      }, 2000);

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        if (matchState === 'searching') {
          setLoading(false);
          Alert.alert('No Match', 'Could not find a match. Please try again.', [
            {
              text: 'OK',
              onPress: () => {
                authService.leaveMatchQueue().catch(console.error);
                setMatchState('questionnaire');
              },
            },
          ]);
        }
      }, 60000);
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Error', error.message || 'Failed to start matching');
      setMatchState('questionnaire');
    }
  };

  const handleStartChat = async () => {
    try {
      await wsService.connect();
      setMatchState('chatting');
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to chat');
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !cryptoRef.current || !partnerKey) return;

    try {
      const crypto = cryptoRef.current;
      const encrypted = await crypto.encryptMessage(message.trim(), partnerKey);

      const msg: Message = {
        id: uuidv4(),
        from: 'me',
        to: partnerId,
        content: message.trim(),
        timestamp: Date.now(),
        type: 'text',
      };

      setMessages(prev => [...prev, msg]);
      setMessage('');

      wsService.send({
        from: 'anonymous',
        to: partnerId,
        type: 'message',
        payload: {
          ciphertext: encrypted,
        },
      });

      scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleIncomingMessage = async (data: any) => {
    if (!cryptoRef.current || !partnerKey) return;

    try {
      const crypto = cryptoRef.current;
      const decrypted = await crypto.decryptMessage(data.payload.ciphertext, partnerKey);

      const msg: Message = {
        id: uuidv4(),
        from: partnerId,
        to: 'me',
        content: decrypted,
        timestamp: Date.now(),
        type: 'text',
      };

      setMessages(prev => [...prev, msg]);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      console.error('Failed to decrypt message:', error);
    }
  };

  const handleMatchEnded = () => {
    Alert.alert('Match Ended', 'Your chat partner has left the conversation', [
      {
        text: 'OK',
        onPress: () => {
          wsService.disconnect();
          if (cryptoRef.current && partnerId) {
            cryptoRef.current.clearSessionKey(partnerId);
          }
          navigation.goBack();
        },
      },
    ]);
  };

  const handleEndChat = () => {
    Alert.alert('End Chat', 'Are you sure you want to end this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          try {
            await authService.leaveMatchQueue();
            wsService.disconnect();
            if (cryptoRef.current && partnerId) {
              cryptoRef.current.clearSessionKey(partnerId);
            }
            navigation.goBack();
          } catch (error) {
            console.error('Failed to end chat:', error);
          }
        },
      },
    ]);
  };

  const renderQuestionnaire = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Find Your Match</Text>
      <Text style={styles.subtitle}>Answer a few questions to find someone with similar interests</Text>

      {QUESTIONNAIRE.map((q, idx) => (
        <View key={q.id} style={styles.questionCard}>
          <Text style={styles.questionNumber}>Question {idx + 1}</Text>
          <Text style={styles.questionText}>{q.question}</Text>
          <View style={styles.optionsContainer}>
            {q.options.map(option => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  answers[q.id] === option && styles.optionButtonSelected,
                ]}
                onPress={() => handleAnswerSelect(q.id, option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    answers[q.id] === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.button, Object.keys(answers).length !== QUESTIONNAIRE.length && styles.buttonDisabled]}
        onPress={handleStartMatching}
        disabled={Object.keys(answers).length !== QUESTIONNAIRE.length}
      >
        <Text style={styles.buttonText}>Start Matching</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderSearching = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#0ea5e9" />
      <Text style={styles.searchingText}>Finding your match...</Text>
      <Text style={styles.searchingSubtext}>This may take up to a minute</Text>
      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={() => {
          authService.leaveMatchQueue().catch(console.error);
          setMatchState('questionnaire');
          setLoading(false);
        }}
      >
        <Text style={styles.buttonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMatched = () => (
    <View style={styles.centerContainer}>
      <Icon name="check-circle" size={80} color="#10b981" />
      <Text style={styles.matchedTitle}>Match Found!</Text>
      <Text style={styles.matchedText}>You've been matched with someone who shares your interests</Text>

      <View style={styles.safetyCard}>
        <Text style={styles.safetyTitle}>Safety Number</Text>
        <Text style={styles.safetyNumber}>{safetyNumber?.slice(0, 30)}...</Text>
        <Text style={styles.safetyHint}>Verify this matches your partner's safety number</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleStartChat}>
        <Text style={styles.buttonText}>Start Chatting</Text>
      </TouchableOpacity>
    </View>
  );

  const renderChatting = () => (
    <View style={styles.chatContainer}>
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.chatHeaderCenter}>
          <Text style={styles.chatHeaderTitle}>Anonymous Chat</Text>
          <Text style={styles.chatHeaderSubtitle}>End-to-end encrypted</Text>
        </View>
        <TouchableOpacity onPress={handleEndChat}>
          <Icon name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={scrollViewRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesContainer}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.from === 'me' ? styles.messageBubbleMe : styles.messageBubbleOther,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.from === 'me' ? styles.messageTextMe : styles.messageTextOther,
              ]}
            >
              {item.content}
            </Text>
            <Text style={styles.messageTime}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!message.trim()}
        >
          <Icon name="send" size={24} color="#fff" />
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </View>
  );

  switch (matchState) {
    case 'questionnaire':
      return renderQuestionnaire();
    case 'searching':
      return renderSearching();
    case 'matched':
      return renderMatched();
    case 'chatting':
      return renderChatting();
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollContent: {
    padding: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 30,
  },
  questionCard: {
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
  questionNumber: {
    fontSize: 12,
    color: '#0ea5e9',
    fontWeight: '600',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 15,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0ea5e9',
  },
  optionText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#0ea5e9',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonSecondary: {
    backgroundColor: '#6b7280',
    marginTop: 30,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchingText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 20,
  },
  searchingSubtext: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 10,
  },
  matchedTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 20,
  },
  matchedText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  safetyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 10,
  },
  safetyNumber: {
    fontSize: 18,
    fontFamily: 'monospace',
    color: '#1f2937',
    marginBottom: 10,
  },
  safetyHint: {
    fontSize: 12,
    color: '#9ca3af',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  chatHeader: {
    backgroundColor: '#0ea5e9',
    padding: 15,
    paddingTop: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  chatHeaderSubtitle: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  messagesContainer: {
    padding: 15,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  messageBubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#0ea5e9',
  },
  messageBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
  },
  messageTextMe: {
    color: '#fff',
  },
  messageTextOther: {
    color: '#1f2937',
  },
  messageTime: {
    fontSize: 11,
    color: 'rgba(0, 0, 0, 0.5)',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    color: '#1f2937',
  },
  sendButton: {
    backgroundColor: '#0ea5e9',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
