import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import QRCode from 'react-native-qrcode-svg';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { generateQRCodeData, verifyQRCodeData } from '@/crypto/engine';
import { useAuthStore } from '@/stores/authStore';

interface SafetyVerificationProps {
  visible: boolean;
  safetyNumber: string;
  onClose: () => void;
}

export default function SafetyVerificationScreen({
  visible,
  safetyNumber,
  onClose,
}: SafetyVerificationProps) {
  const [mode, setMode] = useState<'show' | 'scan'>('show');
  const [scanning, setScanning] = useState(false);
  const { userId } = useAuthStore();

  const qrData = userId ? generateQRCodeData(safetyNumber, userId) : '';

  const handleBarCodeRead = (event: any) => {
    if (scanning) return;
    setScanning(true);

    try {
      const scannedData = verifyQRCodeData(event.data);
      
      if (!scannedData) {
        Alert.alert('Invalid QR Code', 'The scanned QR code is invalid or expired');
        setScanning(false);
        return;
      }

      if (scannedData.safetyNumber === safetyNumber) {
        Alert.alert(
          'Verified!',
          'The safety numbers match. Your connection is secure.',
          [{ text: 'OK', onPress: onClose }]
        );
      } else {
        Alert.alert(
          'Warning!',
          'The safety numbers do NOT match. Your connection may not be secure. Do not proceed with this conversation.',
          [{ text: 'OK', onPress: onClose }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to verify QR code');
    } finally {
      setScanning(false);
    }
  };

  const renderShowMode = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Safety Number Verification</Text>
      <Text style={styles.description}>
        Have your chat partner scan this QR code to verify your connection is secure
      </Text>

      <View style={styles.qrContainer}>
        <QRCode value={qrData} size={250} />
      </View>

      <View style={styles.safetyNumberContainer}>
        <Text style={styles.safetyNumberLabel}>Safety Number:</Text>
        <Text style={styles.safetyNumber}>{safetyNumber}</Text>
        <Text style={styles.hint}>
          You can also verify by comparing this number with your partner
        </Text>
      </View>

      <TouchableOpacity
        style={styles.switchButton}
        onPress={() => setMode('scan')}
      >
        <Icon name="qr-code-scanner" size={24} color="#0ea5e9" />
        <Text style={styles.switchButtonText}>Scan Partner's QR Code</Text>
      </TouchableOpacity>
    </View>
  );

  const renderScanMode = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Scan QR Code</Text>
      <Text style={styles.description}>
        Point your camera at your partner's QR code to verify the connection
      </Text>

      <View style={styles.cameraContainer}>
        <RNCamera
          style={styles.camera}
          type={RNCamera.Constants.Type.back}
          onBarCodeRead={handleBarCodeRead}
          captureAudio={false}
          barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
        >
          <View style={styles.scanFrame} />
        </RNCamera>
      </View>

      <TouchableOpacity
        style={styles.switchButton}
        onPress={() => setMode('show')}
      >
        <Icon name="qr-code" size={24} color="#0ea5e9" />
        <Text style={styles.switchButtonText}>Show My QR Code</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
        </View>

        {mode === 'show' ? renderShowMode() : renderScanMode()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  qrContainer: {
    padding: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 30,
  },
  safetyNumberContainer: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
  },
  safetyNumberLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 10,
  },
  safetyNumber: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: '#1f2937',
    marginBottom: 10,
    lineHeight: 24,
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 16,
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    gap: 10,
  },
  switchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  cameraContainer: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 30,
  },
  camera: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#0ea5e9',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
});
