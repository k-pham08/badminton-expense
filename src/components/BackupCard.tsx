import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useStore } from '../store';
import { colors, radius, space } from '../theme';
import type { AppData } from '../types';
import { backupFileName, isLargeBackup, parseBackup, toBackupJson } from '../utils/backup';
import { Card, PrimaryButton, SecondaryButton, SectionTitle } from './ui';

export function BackupCard() {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const confirmImport = (next: AppData) => {
    Alert.alert(
      'Nhập dữ liệu?',
      'Dữ liệu hiện tại trên máy này sẽ bị thay. Không hoàn tác được.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Nhập',
          style: 'destructive',
          onPress: () => {
            store.importData(next);
            setPasteOpen(false);
            setPasteText('');
            Alert.alert('Xong', 'Đã nhập dữ liệu.');
          },
        },
      ],
    );
  };

  const exportJson = async () => {
    try {
      setBusy(true);
      const json = toBackupJson(store.data);
      if (isLargeBackup(json)) {
        const dir = FileSystem.cacheDirectory;
        if (!dir) throw new Error('Không ghi được file tạm.');
        const path = `${dir}${backupFileName()}`;
        await FileSystem.writeAsStringAsync(path, json);
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) throw new Error('Máy này không mở được menu chia sẻ.');
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          UTI: 'public.json',
          dialogTitle: 'Xuất dữ liệu Cầu Lông',
        });
        return;
      }
      await Clipboard.setStringAsync(json);
      await Share.share({
        message: json,
        title: 'Cầu Lông JSON',
      });
    } catch (error) {
      Alert.alert('Xuất thất bại', error instanceof Error ? error.message : 'Không xuất được dữ liệu.');
    } finally {
      setBusy(false);
    }
  };

  const openPaste = async () => {
    try {
      const clip = (await Clipboard.getStringAsync()).trim();
      setPasteText(clip.startsWith('{') ? clip : '');
    } catch {
      setPasteText('');
    }
    setPasteOpen(true);
  };

  const importPasted = () => {
    try {
      confirmImport(parseBackup(pasteText));
    } catch (error) {
      Alert.alert('Nhập thất bại', error instanceof Error ? error.message : 'JSON không hợp lệ.');
    }
  };

  const importFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'public.json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets[0]) return;
      setBusy(true);
      const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      confirmImport(parseBackup(raw));
    } catch (error) {
      Alert.alert('Nhập thất bại', error instanceof Error ? error.message : 'Không đọc được file.');
    } finally {
      setBusy(false);
    }
  };

  const startImport = () => {
    Alert.alert('Nhập dữ liệu', 'Dán JSON đã copy, hoặc chọn file nếu dữ liệu lớn.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Chọn file', onPress: () => void importFile() },
      { text: 'Dán JSON', onPress: () => void openPaste() },
    ]);
  };

  const useFile = isLargeBackup(toBackupJson(store.data));

  return (
    <Card>
      <SectionTitle>Sao lưu</SectionTitle>
      <Text style={styles.hint}>
        {useFile
          ? 'Dữ liệu khá lớn — xuất bằng file JSON rồi AirDrop / Files sang máy kia.'
          : 'Xuất JSON thô (copy / AirDrop chữ). Máy kia dán JSON để nhập. File chỉ dùng khi dữ liệu lớn.'}
      </Text>
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={styles.actions}>
          <PrimaryButton
            label={useFile ? 'Xuất file JSON' : 'Xuất JSON'}
            onPress={() => void exportJson()}
          />
          <SecondaryButton label="Nhập JSON" onPress={startImport} />
        </View>
      )}

      <Modal visible={pasteOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Dán JSON</Text>
          <Text style={styles.hint}>Copy JSON từ máy kia, rồi dán. Không cần sửa trong app.</Text>
          <SecondaryButton
            label="Dán từ clipboard"
            onPress={() => void openPaste()}
          />
          <Text style={styles.hint}>
            {pasteText.trim() ? `Đã dán · ${pasteText.length} ký tự` : 'Chưa dán JSON.'}
          </Text>
          <View style={{ marginTop: 'auto' }}>
            <PrimaryButton label="Nhập" onPress={importPasted} disabled={!pasteText.trim()} />
            <View style={{ height: 10 }} />
            <SecondaryButton label="Đóng" onPress={() => setPasteOpen(false)} />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  actions: {
    gap: 10,
  },
  busy: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: space.md,
    paddingTop: 28,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  pasteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
    marginBottom: space.md,
    textAlignVertical: 'top',
  },
});
