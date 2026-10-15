import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { cacheDirectory, EncodingType, documentDirectory, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
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
import { 
  backupFileName, 
  formatBackupTime, 
  isLargeBackup, 
  loadAutoBackup, 
  parseBackup, 
  saveAutoBackup, 
  toBackupJson 
} from '../utils/backup';
import { Card, PrimaryButton, SecondaryButton, SectionTitle } from './ui';

export function BackupCard() {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [hasAutoBackup, setHasAutoBackup] = useState(false);
  const [loadingAutoBackup, setLoadingAutoBackup] = useState(true);

  // Load auto-backup status on mount
  useEffect(() => {
    async function checkAutoBackup() {
      const { data, timestamp } = await loadAutoBackup();
      setHasAutoBackup(!!data);
      setLastBackupTime(timestamp);
      setLoadingAutoBackup(false);
    }
    void checkAutoBackup();
  }, []);

  // Auto-backup whenever data changes
  useEffect(() => {
    if (!store.data.members.length && !Object.keys(store.data.months).length) return;
    
    const timer = setTimeout(() => {
      void saveAutoBackup(store.data);
      setLastBackupTime(new Date().toISOString());
      setHasAutoBackup(true);
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timer);
  }, [store.data]);

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
            // Update auto-backup after import
            void saveAutoBackup(next);
            setLastBackupTime(new Date().toISOString());
            setHasAutoBackup(true);
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
        const dir = documentDirectory ?? cacheDirectory;
        if (!dir) throw new Error('Không ghi được file tạm.');
        const path = `${dir}${backupFileName()}`;
        await writeAsStringAsync(path, json, { encoding: EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) throw new Error('Máy này không mở được menu chia sẻ.');
        await Sharing.shareAsync(path, {
          mimeType: 'application/json',
          UTI: 'public.json',
          dialogTitle: 'Export Badminton Data',
        });
        return;
      }
      await Clipboard.setStringAsync(json);
      await Share.share({
        message: json,
        title: 'Badminton JSON',
      });
    } catch (error) {
      Alert.alert('Xuất thất bại', error instanceof Error ? error.message : 'Không xuất được dữ liệu.');
    } finally {
      setBusy(false);
    }
  };

  const restoreAutoBackup = async () => {
    try {
      setBusy(true);
      const { data } = await loadAutoBackup();
      if (!data) {
        Alert.alert('Không có backup', 'Chưa có backup tự động nào.');
        return;
      }

      Alert.alert(
        'Khôi phục backup?',
        'Dữ liệu hiện tại sẽ bị thay thế bằng backup tự động gần nhất.',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Khôi phục',
            style: 'destructive',
            onPress: () => {
              store.importData(data);
              Alert.alert('Xong', 'Đã khôi phục từ backup tự động.');
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không khôi phục được.');
    } finally {
      setBusy(false);
    }
  };

  const forceBackupNow = async () => {
    try {
      setBusy(true);
      await saveAutoBackup(store.data);
      setLastBackupTime(new Date().toISOString());
      setHasAutoBackup(true);
      Alert.alert('Xong', 'Đã lưu backup tự động.');
    } catch (error) {
      Alert.alert('Lỗi', 'Không lưu được backup.');
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
      const raw = await readAsStringAsync(picked.assets[0].uri, { encoding: EncodingType.UTF8 });
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
      <SectionTitle>Sao lưu tự động</SectionTitle>
      
      {loadingAutoBackup ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={styles.autoBackupInfo}>
          <View style={styles.autoBackupRow}>
            <Text style={styles.autoBackupLabel}>Backup gần nhất:</Text>
            <Text style={styles.autoBackupValue}>{formatBackupTime(lastBackupTime)}</Text>
          </View>
          
          {hasAutoBackup ? (
            <Text style={styles.autoBackupHint}>
              ✅ Đã có backup tự động. Dữ liệu được lưu mỗi khi thay đổi.
            </Text>
          ) : (
            <Text style={styles.autoBackupHint}>
              ⏳ Chưa có backup. Thêm dữ liệu để tự động lưu.
            </Text>
          )}
          
          <View style={styles.autoBackupActions}>
            <Pressable style={styles.autoBackupBtn} onPress={() => void forceBackupNow()}>
              <Text style={styles.autoBackupBtnText}>💾 Lưu ngay</Text>
            </Pressable>
            <Pressable style={styles.autoBackupBtn} onPress={() => void restoreAutoBackup()}>
              <Text style={styles.autoBackupBtnText}>📥 Khôi phục</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={{ marginTop: 16 }}>
        <SectionTitle>Sao lưu thủ công</SectionTitle>
      </View>
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
  autoBackupInfo: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: 4,
  },
  autoBackupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  autoBackupLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  autoBackupValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  autoBackupHint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  autoBackupActions: {
    flexDirection: 'row',
    gap: 8,
  },
  autoBackupBtn: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  autoBackupBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
